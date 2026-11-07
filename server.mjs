import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, 'data');
const dataFile = path.join(dataDir, 'catalog.json');
const backupFile = path.join(dataDir, 'catalog.backup.json');
const distDir = path.join(rootDir, 'dist');
const seedFile = path.join(rootDir, 'src', 'games.jsx');
const port = Number(process.env.PORT || 8787);
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const adminTokens = new Set();
const streamClients = new Set();

const readSeedGames = () => {
  const source = fs.readFileSync(seedFile, 'utf8');
  const match = source.match(/export const games = (\[[\s\S]*?\]);\s*export const getGame/);
  if (!match) throw new Error('Seed catalog tidak ditemukan di src/games.jsx.');
  return Function(`return (${match[1]})`)();
};

const syncSeedCatalog = (games) => {
  const source = fs.readFileSync(seedFile, 'utf8');
  const match = source.match(/export const games = \[[\s\S]*?\];/);
  if (!match) throw new Error('Seed catalog tidak ditemukan di src/games.jsx.');
  const nextSource = `${source.slice(0, match.index)}export const games = ${JSON.stringify(games, null, 2)};${source.slice(match.index + match[0].length)}`;
  const tempFile = `${seedFile}.tmp`;
  fs.writeFileSync(tempFile, nextSource, 'utf8');
  fs.renameSync(tempFile, seedFile);
};

const ensureCatalog = () => {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ games: readSeedGames(), hiddenGames: [], updatedAt: new Date().toISOString() }, null, 2));
  }
};

ensureCatalog();
const loadCatalog = () => {
  for (const candidate of [dataFile, backupFile]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (Array.isArray(parsed.games)) return { ...parsed, hiddenGames: Array.isArray(parsed.hiddenGames) ? parsed.hiddenGames : [] };
    } catch {
      // Try the next durable copy before falling back to the seed catalog.
    }
  }
  return { games: readSeedGames(), hiddenGames: [], updatedAt: new Date().toISOString() };
};
let catalog = loadCatalog();
try { syncSeedCatalog(catalog.games); } catch (error) { console.warn(`Seed catalog belum tersinkron: ${error.message}`); }

const sendJson = (response, status, payload) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
};

const sendError = (response, status, message) => sendJson(response, status, { error: message });

const readJson = (request) => new Promise((resolve, reject) => {
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
    if (body.length > 16 * 1024 * 1024) {
      request.destroy();
      reject(new Error('Payload terlalu besar.'));
    }
  });
  request.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Format JSON tidak valid.')); }
  });
  request.on('error', reject);
});

const broadcastCatalog = () => {
  const message = `data: ${JSON.stringify(catalog)}\n\n`;
  for (const client of streamClients) client.write(message);
};

const saveCatalog = () => {
  catalog.updatedAt = new Date().toISOString();
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(catalog, null, 2));
  fs.renameSync(tempFile, dataFile);
  fs.copyFileSync(dataFile, backupFile);
  try { syncSeedCatalog(catalog.games); } catch (error) { console.warn(`Perubahan tersimpan di catalog.json, tetapi seed source gagal disinkronkan: ${error.message}`); }
  broadcastCatalog();
};

const requireAdmin = (request, response) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !adminTokens.has(token)) {
    sendError(response, 401, 'Sesi admin tidak valid atau sudah berakhir.');
    return false;
  }
  return true;
};

const gameIdFromPath = (pathname) => decodeURIComponent(pathname.replace('/api/admin/games/', '').split('/')[0]);

const handleApi = async (request, response, url) => {
  if (request.method === 'GET' && url.pathname === '/api/catalog') return sendJson(response, 200, catalog);

  if (request.method === 'GET' && url.pathname === '/api/catalog/stream') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write(`data: ${JSON.stringify(catalog)}\n\n`);
    streamClients.add(response);
    request.on('close', () => streamClients.delete(response));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/login') {
    const body = await readJson(request);
    if (body.username !== adminUsername || body.password !== adminPassword) return sendError(response, 401, 'Username atau password admin salah.');
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.add(token);
    return sendJson(response, 200, { username: adminUsername, token });
  }

  if (!url.pathname.startsWith('/api/admin/')) return sendError(response, 404, 'API route tidak ditemukan.');
  if (!requireAdmin(request, response)) return;

  if (request.method === 'POST' && url.pathname === '/api/admin/games') {
    const body = await readJson(request);
    if (!body.id || !body.title || !body.genre || !body.publisher || !Array.isArray(body.nominals) || body.nominals.length === 0) return sendError(response, 400, 'Data game belum lengkap.');
    if (catalog.games.some((game) => game.id === body.id)) return sendError(response, 409, 'Game dengan id tersebut sudah ada.');
    const game = {
      id: String(body.id),
      title: String(body.title).trim(),
      category: String(body.category || 'Mobile'),
      categories: Array.isArray(body.categories) ? body.categories : [String(body.category || 'Mobile')],
      genre: String(body.genre).trim(),
      publisher: String(body.publisher).trim(),
      playerLabel: String(body.playerLabel || 'Player ID').trim() || 'Player ID',
      rating: body.rating || 'NEW',
      badge: body.badge || 'NEW',
      price: Number(body.price) || Number(body.nominals[0].price),
      image: typeof body.image === 'string' ? body.image : '',
      nominals: body.nominals.map((nominal) => ({ label: String(nominal.label), price: Number(nominal.price), hot: Boolean(nominal.hot) })),
    };
    catalog.games = [game, ...catalog.games];
    catalog.hiddenGames = catalog.hiddenGames.filter((id) => id !== game.id);
    saveCatalog();
    return sendJson(response, 201, catalog);
  }

  if (request.method === 'PATCH' && url.pathname.startsWith('/api/admin/games/')) {
    const body = await readJson(request);
    const id = gameIdFromPath(url.pathname);
    const game = catalog.games.find((item) => item.id === id);
    if (!game) return sendError(response, 404, 'Game tidak ditemukan.');
    if (Object.prototype.hasOwnProperty.call(body, 'hidden')) {
      const hidden = Boolean(body.hidden);
      catalog.hiddenGames = hidden ? [...new Set([...catalog.hiddenGames, id])] : catalog.hiddenGames.filter((item) => item !== id);
    }
    for (const field of ['title', 'category', 'genre', 'publisher', 'playerLabel', 'rating', 'badge']) {
      if (body[field] !== undefined) game[field] = field === 'title' || field === 'genre' || field === 'publisher' || field === 'playerLabel' ? String(body[field]).trim() : body[field];
    }
    if (body.image) game.image = body.image;
    if (body.categories !== undefined) game.categories = Array.isArray(body.categories) ? body.categories : [game.category];
    if (body.price !== undefined) game.price = Number(body.price);
    saveCatalog();
    return sendJson(response, 200, catalog);
  }

  if (request.method === 'POST' && url.pathname.match(/^\/api\/admin\/games\/[^/]+\/nominals$/)) {
    const body = await readJson(request);
    const id = gameIdFromPath(url.pathname);
    const game = catalog.games.find((item) => item.id === id);
    const label = String(body.label || '').trim();
    const price = Number(body.price);
    if (!game) return sendError(response, 404, 'Game tidak ditemukan.');
    if (!label || !price || price < 1) return sendError(response, 400, 'Nominal dan harga tidak valid.');
    if (game.nominals.some((nominal) => nominal.label.toLowerCase() === label.toLowerCase())) return sendError(response, 409, 'Nominal itu sudah ada.');
    game.nominals.push({ label, price, hot: Boolean(body.hot) });
    saveCatalog();
    return sendJson(response, 201, catalog);
  }

  return sendError(response, 404, 'API route tidak ditemukan.');
};

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

const serveStatic = (request, response, url) => {
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(distDir, `.${requested}`);
  if (!filePath.startsWith(`${distDir}${path.sep}`)) return sendError(response, 403, 'Forbidden');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendError(response, 404, 'File tidak ditemukan.');
  response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try { await handleApi(request, response, url); } catch (error) { if (!response.headersSent) sendError(response, 500, error.message || 'Server error.'); }
    return;
  }
  serveStatic(request, response, url);
});

setInterval(() => {
  for (const client of streamClients) client.write(': heartbeat\n\n');
}, 25000);

server.listen(port, () => console.log(`Harvey Store realtime server running at http://localhost:${port}`));
