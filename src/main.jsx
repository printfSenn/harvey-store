import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { ArrowRight, BadgeCheck, Bell, Camera, Check, ChevronDown, Copy, CreditCard, Eye, EyeOff, ExternalLink, Gamepad2, Headphones, History, Home, LogIn, Menu, Newspaper, Search, ShieldCheck, Star, Ticket, Trash2, User, Wallet, X, Zap } from 'lucide-react';
import { categories, games as baseGames, formatRupiah } from './games.jsx';
import './styles/retro.css';

const navItems = [
  { href: 'index.html', label: 'Arcade', icon: Home, page: 'home' },
  { href: 'topup.html', label: 'Top Up', icon: Zap, page: 'topup' },
  { href: 'news.html', label: 'News', icon: Newspaper, page: 'news' },
  { href: 'ratings.html', label: 'Player Rate', icon: Star, page: 'ratings' },
  { href: 'history.html', label: 'History', icon: History, page: 'history' },
  { href: 'account.html', label: 'Account', icon: User, page: 'account' },
];

const openPage = (href) => { window.location.href = href; };

const STORAGE_KEYS = Object.freeze({
  profiles: 'mbr8_player_profiles',
  orders: 'mbr8_orders',
  accounts: 'harvey_store_accounts',
  session: 'harvey_store_session',
  adminSession: 'harvey_admin_session',
  customGames: 'harvey_custom_games',
  nominalOverrides: 'harvey_nominal_overrides',
  gameOverrides: 'harvey_game_overrides',
  hiddenGames: 'harvey_hidden_games',
  artworkBackup: 'harvey_game_artwork_backup',
  ratings: 'harvey_transaction_ratings',
  loyaltyRedemptions: 'harvey_loyalty_redemptions',
  notifications: 'harvey_store_notifications',
});

const readStoredValue = (key, fallback = null) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const readStoredList = (key) => {
  const value = readStoredValue(key, []);
  return Array.isArray(value) ? value : [];
};

const writeStoredValue = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const writeStoredList = (key, value) => writeStoredValue(key, value);
const removeStoredValue = (key) => { try { window.localStorage.removeItem(key); } catch { /* local storage may be unavailable */ } };

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{2,23}$/;
const PLAYER_INPUT_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,63}$/u;

const isValidEmail = (value) => {
  const email = String(value || '').trim();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return false;
  const [localPart, domain] = email.split('@');
  return localPart.length <= 64 && !localPart.includes('..') && !domain.includes('..');
};

const isValidUsername = (value) => USERNAME_PATTERN.test(String(value || '').trim());
const isValidPlayerInput = (value) => PLAYER_INPUT_PATTERN.test(String(value || '').trim());
const isValidRegistrationPassword = (value) => String(value || '').length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value) && !/\s/.test(value);

const getAccountNotifications = (accountId) => readStoredList(STORAGE_KEYS.notifications)
  .filter((notification) => notification.accountId === accountId)
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const saveAccountNotifications = (notifications) => {
  const saved = writeStoredList(STORAGE_KEYS.notifications, notifications);
  if (saved) window.dispatchEvent(new Event('mbr-notifications-updated'));
  return saved;
};

const addAccountNotification = (accountId, notification) => {
  if (!accountId) return false;
  const notifications = readStoredList(STORAGE_KEYS.notifications);
  const nextNotification = {
    id: notification.id || `notice-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    accountId,
    createdAt: new Date().toISOString(),
    read: false,
    ...notification,
  };
  return saveAccountNotifications([nextNotification, ...notifications.filter((item) => item.id !== nextNotification.id)]);
};

const syncOrderNotifications = (accountId) => {
  if (!accountId) return [];
  const notifications = readStoredList(STORAGE_KEYS.notifications);
  const orders = readStoredList(STORAGE_KEYS.orders).filter((order) => order.accountId === accountId && order.status === 'Paid');
  const knownIds = new Set(notifications.map((notification) => notification.id));
  const missing = orders.filter((order) => !knownIds.has(`order-paid-${order.id}`)).map((order) => ({
    id: `order-paid-${order.id}`,
    accountId,
    title: 'Order berhasil',
    message: `${order.game} · ${order.nominal} sudah tercatat dan siap diproses.`,
    type: 'order',
    orderId: order.id,
    createdAt: order.createdAt || new Date().toISOString(),
    read: false,
  }));
  if (missing.length) saveAccountNotifications([...missing, ...notifications]);
  return getAccountNotifications(accountId);
};

const getCatalogGames = () => {
  if (Array.isArray(window.__mbrCatalogSnapshot)) return window.__mbrCatalogSnapshot;
  const customGames = readStoredList(STORAGE_KEYS.customGames);
  const nominalOverrides = readStoredValue(STORAGE_KEYS.nominalOverrides, {});
  const gameOverrides = readStoredValue(STORAGE_KEYS.gameOverrides, {});
  return [...baseGames, ...customGames].map((game) => ({
    ...game,
    ...(gameOverrides?.[game.id] || {}),
    nominals: [...(game.nominals || []), ...(nominalOverrides?.[game.id] || [])],
  }));
};

const getAvailableGames = () => {
  const hiddenGames = Array.isArray(window.__mbrHiddenGames) ? window.__mbrHiddenGames : readStoredList(STORAGE_KEYS.hiddenGames);
  return getCatalogGames().filter((game) => !hiddenGames.includes(game.id));
};

const getGameById = (id) => getAvailableGames().find((game) => game.id === id);
const getCatalogGameCount = () => getAvailableGames().length;
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const slugify = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

const applyCatalogSnapshot = (payload) => {
  if (!payload || !Array.isArray(payload.games)) return false;
  const previousGames = Array.isArray(window.__mbrCatalogSnapshot) ? window.__mbrCatalogSnapshot : getCatalogGames();
  const artworkBackup = readStoredValue(STORAGE_KEYS.artworkBackup, {});
  const nextArtworkBackup = { ...artworkBackup };
  previousGames.forEach((game) => { if (game.image) nextArtworkBackup[game.id] = game.image; });
  const games = payload.games.map((game) => game.image ? game : nextArtworkBackup?.[game.id] ? { ...game, image: nextArtworkBackup[game.id] } : game);
  games.forEach((game) => { if (game.image) nextArtworkBackup[game.id] = game.image; });
  writeStoredValue(STORAGE_KEYS.artworkBackup, nextArtworkBackup);
  window.__mbrCatalogSnapshot = games;
  window.__mbrHiddenGames = Array.isArray(payload.hiddenGames) ? payload.hiddenGames : [];
  window.dispatchEvent(new Event('mbr-catalog-updated'));
  return true;
};

const adminApi = async (path, options = {}) => {
  const session = readStoredValue(STORAGE_KEYS.adminSession, {});
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Server tidak bisa memproses perubahan.');
  applyCatalogSnapshot(payload);
  return payload;
};

function useCatalogSync() {
  const [, setCatalogVersion] = useState(0);
  useEffect(() => {
    let mounted = true;
    const rerender = () => { if (mounted) setCatalogVersion((value) => value + 1); };
    const loadCatalog = async () => {
      try {
        const response = await fetch('/api/catalog', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        applyCatalogSnapshot(await response.json());
      } catch {
        // Static preview can keep using the local fallback catalog.
      }
    };
    loadCatalog();
    const stream = typeof window.EventSource === 'function' ? new window.EventSource('/api/catalog/stream') : null;
    if (stream) stream.onmessage = (event) => { try { applyCatalogSnapshot(JSON.parse(event.data)); } catch { /* ignore malformed events */ } };
    window.addEventListener('mbr-catalog-updated', rerender);
    return () => { mounted = false; stream?.close(); window.removeEventListener('mbr-catalog-updated', rerender); };
  }, []);
}

const getPlayerLabel = (game) => {
  if (game?.playerLabel) return game.playerLabel;
  if (game?.id === 'roblox') return 'Username';
  if (game?.id === 'cod-mobile' || game?.id === 'genshin-impact') return 'UID';
  if (game?.id === 'mobile-legends') return 'User ID';
  if (game?.id === 'valorant') return 'Riot ID';
  if (game?.id === 'steam-wallet' || game?.id === 'playstation-store') return 'Account ID';
  return 'Player ID';
};

const GAME_SERVER_OPTIONS = {
  'genshin-impact': [
    { value: 'America', label: 'America' },
    { value: 'Europe', label: 'Europe' },
    { value: 'Asia', label: 'Asia' },
    { value: 'TW, HK, MO', label: 'TW, HK, MO' },
  ],
};

const getDefaultNominal = (game) => game?.nominals?.[game.id === 'cod-mobile' ? 0 : 1] || game?.nominals?.[0] || null;
const getDefaultItemGroup = (game) => getDefaultNominal(game)?.group || 'diamonds';
const ITEM_GROUP_LABELS = {
  'weekly-card': 'Weekly Card',
  'first-recharge': 'First Recharge',
  'monthly-pass': 'Monthly Pass',
  pass: 'Pass',
  'gift-card': 'Gift Card',
  minecoins: 'Minecoins',
  robux: 'Robux',
  premium: 'Premium',
  bundle: 'Bundle',
  subscription: 'Subscription',
  silver: 'Silver',
  crystals: 'Crystals',
  'b-chips': 'B-Chips',
  'special-offer': 'Special Offer',
};
const getItemGroups = (game) => game ? [
  { id: 'diamonds', label: 'Nominal' },
  ...[...new Set(game.nominals.map((item) => item.group).filter(Boolean))].map((group) => ({ id: group, label: ITEM_GROUP_LABELS[group] || group })),
] : [];

const getGameCategories = (game) => game?.categories || [game?.category].filter(Boolean);

const loyaltyTiers = [
  { id: 'rookie', name: 'Rookie', minPoints: 0, benefits: ['Support standar', 'Akses kupon rewards'] },
  { id: 'silver', name: 'Silver', minPoints: 250, benefits: ['Support diprioritaskan', 'Penanganan kendala masuk antrean prioritas'] },
  { id: 'gold', name: 'Gold', minPoints: 750, benefits: ['Prioritas support lebih tinggi', 'Review kendala transaksi didahulukan', 'Akses promo terbatas'] },
  { id: 'elite', name: 'Elite', minPoints: 2000, benefits: ['Jalur support utama', 'Penanganan masalah transaksi diprioritaskan', 'Akses awal promo tertentu'] },
];

const loyaltyCoupons = [
  { id: 'SAVE5', label: 'Rp5.000 OFF', discount: 5000, points: 250, minSpend: 75000 },
  { id: 'SAVE12', label: 'Rp12.000 OFF', discount: 12000, points: 600, minSpend: 150000 },
  { id: 'SAVE25', label: 'Rp25.000 OFF', discount: 25000, points: 1200, minSpend: 300000 },
];

const vaBanks = [
  { id: 'bca', name: 'BCA', app: 'myBCA / m-BCA', vaNumber: '88080 8123 4567', steps: ['Buka myBCA atau m-BCA lalu login.', 'Pilih menu Transfer, lalu BCA Virtual Account.', 'Masukkan nomor Virtual Account di atas dan cek nama merchant.', 'Pastikan nominal benar, masukkan PIN, selesai.'] },
  { id: 'bri', name: 'BRI', app: 'BRImo', vaNumber: '88770 8123 4567', steps: ['Buka BRImo lalu login.', 'Pilih menu Transfer, lalu BRI Virtual Account.', 'Masukkan nomor Virtual Account di atas dan cek detail tagihan.', 'Konfirmasi dengan PIN BRImo, selesai.'] },
  { id: 'bni', name: 'BNI', app: 'BNI Mobile Banking', vaNumber: '98880 8123 4567', steps: ['Buka BNI Mobile Banking lalu login.', 'Pilih menu Transfer, lalu Virtual Account Billing.', 'Masukkan nomor Virtual Account di atas dan cek nama serta nominal.', 'Konfirmasi dengan password transaksi, selesai.'] },
  { id: 'mandiri', name: 'Mandiri', app: "Livin' by Mandiri", vaNumber: '89580 8123 4567', steps: ["Buka Livin' by Mandiri lalu login.", 'Pilih menu Bayar, lalu Virtual Account.', 'Masukkan nomor Virtual Account di atas dan cek detail tagihan.', 'Konfirmasi dengan PIN Livin, selesai.'] },
];

const ewallets = [
  { id: 'gopay', name: 'GoPay', app: 'Gojek / GoPay', accountLabel: 'Nomor HP GoPay', accountPlaceholder: '08xxxxxxxxxx', steps: ['Klik Konfirmasi pembayaran di halaman ini.', 'Buka aplikasi Gojek / GoPay, notifikasi pembayaran muncul otomatis.', 'Cek detail transaksi, lalu konfirmasi dengan PIN GoPay.', 'Saldo GoPay terpotong dan item langsung diproses.'] },
  { id: 'ovo', name: 'OVO', app: 'OVO', accountLabel: 'Nomor HP OVO', accountPlaceholder: '08xxxxxxxxxx', steps: ['Klik Konfirmasi pembayaran di halaman ini.', 'Buka aplikasi OVO, popup konfirmasi OVO Cash muncul.', 'Masukkan PIN OVO untuk menyetujui pembayaran.', 'Cek notifikasi berhasil, item langsung diproses.'] },
  { id: 'dana', name: 'DANA', app: 'DANA', accountLabel: 'Nomor HP DANA', accountPlaceholder: '08xxxxxxxxxx', steps: ['Klik Konfirmasi pembayaran di halaman ini.', 'Buka aplikasi DANA, permintaan pembayaran muncul otomatis.', 'Cek nominal, lalu konfirmasi dengan PIN DANA.', 'Saldo DANA terpotong dan item langsung diproses.'] },
  { id: 'shopeepay', name: 'ShopeePay', app: 'Shopee', accountLabel: 'Nomor HP ShopeePay', accountPlaceholder: '08xxxxxxxxxx', steps: ['Klik Konfirmasi pembayaran di halaman ini.', 'Buka aplikasi Shopee, notifikasi pembayaran ShopeePay muncul.', 'Konfirmasi dengan PIN ShopeePay.', 'Cek riwayat transaksi, item langsung diproses.'] },
];

const isValidEwalletAccount = (value) => {
  const account = String(value || '').trim();
  if (!account || !/^[\d\s+()-]+$/.test(account)) return false;
  const digits = account.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 16;
};

const pointsForOrder = (order) => Math.max(1, Math.floor(Number(order.subtotal || order.price || 0) / 10000));
const getLoyaltySummary = (accountId) => {
  const orders = readStoredList(STORAGE_KEYS.orders).filter((order) => order.accountId === accountId && order.status === 'Paid');
  const lifetimePoints = orders.reduce((total, order) => total + pointsForOrder(order), 0);
  const redemptions = readStoredList(STORAGE_KEYS.loyaltyRedemptions).filter((redemption) => redemption.accountId === accountId);
  const redeemedPoints = redemptions.reduce((total, redemption) => total + Number(redemption.points || 0), 0);
  const currentTier = [...loyaltyTiers].reverse().find((tier) => lifetimePoints >= tier.minPoints) || loyaltyTiers[0];
  const nextTier = loyaltyTiers.find((tier) => tier.minPoints > lifetimePoints) || null;
  return { orders, lifetimePoints, redeemedPoints, points: Math.max(0, lifetimePoints - redeemedPoints), currentTier, nextTier, redemptions };
};

const orderPrefixes = {
  'mobile-legends': 'ML', 'free-fire': 'FF', 'pubg-mobile': 'PUBGM', 'genshin-impact': 'GENSHIN',
  valorant: 'VAL', minecraft: 'MC', roblox: 'ROBLOX', 'honkai-star-rail': 'HSR', 'cod-mobile': 'CODM',
  'fc-mobile': 'FCM', 'steam-wallet': 'STEAM', 'playstation-store': 'PS', 'honkai-impact': 'HI',
  'magic-chess': 'MAGIC', 'wuthering-waves': 'WUWA', 'clash-of-clans': 'COC', 'clash-royale': 'CR', csgo: 'CS:GO',
};

const createUniqueOrderId = (game, existingOrders) => {
  const prefix = orderPrefixes[game.id] || game.id.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase() || 'ORDER';
  let orderId = '';
  do {
    orderId = `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;
  } while (existingOrders.some((order) => order.id === orderId));
  return orderId;
};

const hashPassword = async (password) => {
  if (window.crypto?.subtle && window.TextEncoder) {
    const bytes = new TextEncoder().encode(password);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `fallback-${btoa(unescape(encodeURIComponent(password)))}`;
};

const compressImage = (file, targetWidth, targetHeight, quality = 0.82, fit = 'cover') => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Foto tidak bisa dibaca.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('Format foto tidak didukung.'));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      context.fillStyle = '#100f12';
      context.fillRect(0, 0, targetWidth, targetHeight);
      const scale = fit === 'contain' ? Math.min(targetWidth / image.width, targetHeight / image.height) : Math.max(targetWidth / image.width, targetHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

const compressAvatar = (file) => compressImage(file, 256, 256, 0.82);

const updateAccountAvatar = (accountId, avatar) => {
  const accounts = readStoredList(STORAGE_KEYS.accounts);
  const nextAccounts = accounts.map((account) => account.id === accountId ? { ...account, avatar } : account);
  const currentSession = readStoredValue(STORAGE_KEYS.session);
  const saved = writeStoredList(STORAGE_KEYS.accounts, nextAccounts)
    && writeStoredValue(STORAGE_KEYS.session, { ...currentSession, avatar });
  if (saved) window.dispatchEvent(new Event('storage'));
  return saved;
};

function App() {
  const page = document.documentElement.dataset.page || 'home';
  useCatalogSync();
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const notify = (message) => { setToast(message); window.clearTimeout(window.__mbrToast); window.__mbrToast = window.setTimeout(() => setToast(''), 2600); };
  return <div className="app-shell"><Topbar page={page} menuOpen={menuOpen} setMenuOpen={setMenuOpen} /><main className="site-main">
    {page === 'home' && <HomePage />}{page === 'topup' && <TopupPage notify={notify} />}{page === 'payment' && <PaymentPage notify={notify} />}{page === 'ratings' && <RatingsPage notify={notify} />}{page === 'history' && <HistoryPage notify={notify} />}{page === 'news' && <NewsPage notify={notify} />}{page === 'account' && <AccountPage notify={notify} />}{page === 'admin' && <AdminPage notify={notify} />}{page === 'not-found' && <NotFoundPage />}
  </main><Footer />{toast && <div className="toast"><Check size={16} /> {toast}</div>}</div>;
}

function Topbar({ page, menuOpen, setMenuOpen }) {
  const [session, setSession] = useState(() => readStoredValue(STORAGE_KEYS.session));
  const [notifications, setNotifications] = useState(() => {
    const currentSession = readStoredValue(STORAGE_KEYS.session);
    return currentSession?.accountId ? getAccountNotifications(currentSession.accountId) : [];
  });
  const [notificationOpen, setNotificationOpen] = useState(false);
  useEffect(() => {
    const syncSession = () => setSession(readStoredValue(STORAGE_KEYS.session));
    window.addEventListener('storage', syncSession);
    return () => window.removeEventListener('storage', syncSession);
  }, []);
  useEffect(() => {
    const refreshNotifications = () => setNotifications(session?.accountId ? syncOrderNotifications(session.accountId) : []);
    refreshNotifications();
    window.addEventListener('storage', refreshNotifications);
    window.addEventListener('mbr-notifications-updated', refreshNotifications);
    return () => {
      window.removeEventListener('storage', refreshNotifications);
      window.removeEventListener('mbr-notifications-updated', refreshNotifications);
    };
  }, [session?.accountId]);
  const displayName = session?.username || 'LOGIN / SIGN UP';
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const markAllRead = () => {
    if (!session?.accountId || !unreadCount) return;
    const allNotifications = readStoredList(STORAGE_KEYS.notifications).map((notification) => notification.accountId === session.accountId ? { ...notification, read: true } : notification);
    saveAccountNotifications(allNotifications);
  };
  const markRead = (notification) => {
    if (!session?.accountId || notification.read) return;
    const allNotifications = readStoredList(STORAGE_KEYS.notifications).map((item) => item.id === notification.id ? { ...item, read: true } : item);
    saveAccountNotifications(allNotifications);
  };
  return <header className="topbar"><div className="container nav-inner"><a className="brand" href="index.html" aria-label="Harvey Store home"><span className="brand-mark"><Gamepad2 size={23} /></span><span className="brand-name"><b>HARVEY</b><i>STORE</i></span></a><button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Buka menu">{menuOpen ? <X size={22} /> : <Menu size={22} />}</button><nav className={`nav-links ${menuOpen ? 'is-open' : ''}`}>{navItems.map(({ href, label, icon: Icon, page: itemPage }) => <a key={href} className={page === itemPage ? 'active' : ''} href={href}><Icon size={15} /> {label}</a>)}</nav><div className="nav-actions"><div className="notification-menu-wrap"><button className="icon-button" aria-label={`Notifikasi${unreadCount ? `, ${unreadCount} belum dibaca` : ''}`} aria-expanded={notificationOpen} onClick={() => setNotificationOpen((value) => !value)}><span className="notification-wrap"><Bell size={17} />{unreadCount > 0 && <span className="notification-dot" aria-hidden="true" />}</span></button>{notificationOpen && <div className="notification-panel" role="dialog" aria-label="Notifikasi"><div className="notification-panel-head"><span>NOTIFICATIONS</span>{unreadCount > 0 && <button type="button" onClick={markAllRead}>Tandai dibaca</button>}</div>{!session ? <div className="notification-empty"><Bell size={18} /><p>Login untuk melihat notifikasi akunmu.</p><a href="account.html?mode=login">Login sekarang</a></div> : notifications.length === 0 ? <div className="notification-empty"><Bell size={18} /><p>Belum ada notifikasi baru.</p></div> : <div className="notification-list">{notifications.slice(0, 8).map((notification) => <button type="button" className={`notification-item ${notification.read ? '' : 'is-unread'}`} key={notification.id} onClick={() => { markRead(notification); if (notification.orderId) openPage('history.html'); }}><span className="notification-item-icon"><Bell size={13} /></span><span><b>{notification.title}</b><small>{notification.message}</small><time>{new Date(notification.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</time></span></button>)}</div>}</div>}</div><a className="profile-chip" href="account.html"><span className="avatar">{session?.avatar ? <img src={session.avatar} alt="" /> : displayName[0].toUpperCase()}</span><span>{displayName}</span><ChevronDown size={14} /></a></div></div></header>;
}

function PasswordField({ label = 'Password', value, onChange, autoComplete, placeholder = 'Min. 8 karakter' }) {
  const [visible, setVisible] = useState(false);
  return <label>{label}<span className="password-field"><input type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder} required /><button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>;
}

const newsArticles = [
  {
    slug: 'nominal-top-up-efisien', tag: 'GUIDE', image: '/game-art/mobile-legends.png', title: 'Cara memilih nominal top up yang paling efisien', desc: 'Biar saldo tetap aman dan kebutuhan push rank tetap jalan.', date: '10 November 2026', source: 'Harvey Store Guide', lead: 'Nominal top up yang tepat bisa membuat budget bermain lebih teratur tanpa mengorbankan kebutuhan item dan rank.',
    sections: [
      ['Mulai dari kebutuhan utama', 'Catat dulu item, pass, atau diamond yang memang ingin dibeli. Dengan begitu, kamu tidak tergoda mengambil nominal terlalu besar hanya karena terlihat lebih murah di awal.'],
      ['Bandingkan harga per unit', 'Jangan hanya melihat angka bonus. Bandingkan total harga dengan jumlah currency yang diterima agar kamu tahu paket mana yang paling efisien untuk kebiasaan bermainmu.'],
      ['Sisakan ruang untuk promo', 'Jika tidak sedang mengejar event terbatas, pilih nominal yang masih menyisakan ruang untuk promo berikutnya. Budget yang fleksibel membuat top up terasa lebih aman.'],
      ['Kesimpulan', 'Top up yang efisien bukan selalu nominal terbesar, tetapi nominal yang paling sesuai dengan kebutuhan bermain dan rencana budget kamu.'],
    ],
  },
  {
    slug: 'arcade-drop-weekend-player', tag: 'EVENT', image: '/game-art/free-fire.webp', title: 'Arcade Drop: bonus top up untuk weekend player', desc: 'Cek jadwal dan game yang masuk ke rotation promo minggu ini.', date: '9 November 2026', source: 'Harvey Store Events', lead: 'Weekend menjadi waktu yang pas untuk mengejar bonus karena rotation Arcade Drop menghadirkan penawaran pilihan untuk player aktif.',
    sections: [
      ['Apa itu Arcade Drop', 'Arcade Drop adalah rotation promo yang menyorot game dan nominal tertentu dalam periode singkat. Daftar game dapat berubah mengikuti event dan kebutuhan komunitas.'],
      ['Cara memanfaatkan bonus', 'Pilih game yang memang sedang kamu mainkan, lalu cek nominal yang masuk ke promo sebelum checkout. Bonus paling terasa ketika pembelian sudah sesuai target item yang ingin dikejar.'],
      ['Bermain tetap terukur', 'Promo bukan alasan untuk membeli di luar kebutuhan. Tentukan budget lebih dulu dan gunakan drop sebagai kesempatan mendapatkan value tambahan dari pembelian yang memang sudah direncanakan.'],
      ['Kesimpulan', 'Cek halaman news secara berkala untuk melihat rotation terbaru dan jangan lewatkan drop yang cocok dengan game favoritmu.'],
    ],
  },
  {
    slug: 'harvey-store-patch-notes', tag: 'UPDATE', image: '/game-art/cod-mobile.webp', title: 'Harvey Store patch notes - marketplace makin sat-set', desc: 'Kabar terbaru soal metode bayar, katalog, dan fitur player.', date: '8 November 2026', source: 'Harvey Store Product Desk', lead: 'Update terbaru Harvey Store merapikan alur marketplace supaya kamu bisa mencari game, memilih nominal, dan mengecek status order dengan lebih cepat.',
    sections: [
      ['Katalog lebih mudah dipindai', 'Kartu game sekarang menampilkan artwork, kategori, dan harga mulai secara lebih konsisten. Kamu bisa langsung masuk ke halaman top up dari game yang dipilih.'],
      ['Checkout lebih informatif', 'Ringkasan checkout dibuat lebih jelas dengan subtotal, biaya platform, diskon, dan total akhir yang dipisahkan agar tidak ada detail penting yang terlewat.'],
      ['Status order lebih transparan', 'Order history menampilkan status, identitas transaksi, dan akses rating setelah pembayaran selesai. Semua informasi penting ada dalam satu tempat.'],
      ['Kesimpulan', 'Patch ini fokus pada detail kecil yang membuat proses belanja terasa lebih singkat, jelas, dan nyaman untuk player aktif.'],
    ],
  },
  {
    slug: 'inside-lobby-player-stories', tag: 'COMMUNITY', image: '/game-art/roblox.webp', title: 'Inside the lobby: cerita player dari berbagai server', desc: 'Kenalan dengan komunitas kecil yang selalu hadir di leaderboard.', date: '6 November 2026', source: 'Harvey Store Community', lead: 'Di balik leaderboard dan match history, ada komunitas kecil yang membuat sesi bermain terasa lebih ramai dan punya cerita.',
    sections: [
      ['Lobby yang selalu kembali', 'Banyak player bertemu dari match acak lalu membentuk grup kecil. Mereka kembali bukan hanya untuk menang, tetapi juga karena sudah menemukan ritme bermain yang cocok.'],
      ['Komunitas tumbuh dari kebiasaan kecil', 'Mulai dari berbagi tips, mengingatkan jadwal event, sampai membantu player baru memahami game, kebiasaan sederhana bisa membuat lobby terasa lebih ramah.'],
      ['Menjaga ruang bermain tetap sehat', 'Komunitas yang kuat tetap membutuhkan komunikasi yang jelas, batasan yang sehat, dan sikap saling menghargai ketika strategi atau hasil pertandingan tidak sesuai harapan.'],
      ['Kesimpulan', 'Leaderboard memang menunjukkan skor, tetapi komunitaslah yang membuat perjalanan menuju skor itu terasa berkesan.'],
    ],
  },
];

function HomePage() {
  const availableGames = getAvailableGames();
  return <>
    <section className="hero container"><div className="hero-particles" aria-hidden="true" /><div className="hero-copy"><h1>LEVEL UP<br /><span>YOUR PLAY.</span></h1><p className="hero-lead">Top up game favoritmu, cepat dan langsung masuk.</p><div className="hero-cta"><a className="button button-primary" href="#catalog">Explore games <ArrowRight size={17} /></a><a className="button button-secondary" href="topup.html">TOP UP SEKARANG <ArrowRight size={17} /></a><a className="text-link text-link-offset" href="news.html">Lihat event minggu ini <ExternalLink size={14} /></a></div><div className="hero-stats"><div><strong className="stat-number" data-value="3" data-suffix=" detik"><span className="stat-value">0</span><small> detik</small></strong><span>Proses rata-rata</span></div><div><strong className="stat-number" data-value={availableGames.length} data-suffix=""><span className="stat-value">0</span></strong><span>Game didukung</span></div><div><strong className="stat-number" data-value="8" data-suffix=""><span className="stat-value">0</span></strong><span>Metode bayar</span></div></div></div><HeroArcadeArtwork /></section>
    <div className="ticker ticker-pink" aria-label="Daftar game"><div className="ticker-track"><span>MOBILE LEGENDS</span><i className="pixel-separator" /><span>FREE FIRE</span><i className="pixel-separator" /><span>PUBG MOBILE</span><i className="pixel-separator" /><span>GENSHIN IMPACT</span><i className="pixel-separator" /><span>VALORANT</span><i className="pixel-separator" /><span>MINECRAFT</span><i className="pixel-separator" /><span>ROBLOX</span><i className="pixel-separator" /><span>HONKAI STAR RAIL</span><i className="pixel-separator" /><span>CALL OF DUTY MOBILE</span><i className="pixel-separator" /><span>EA SPORTS FC MOBILE</span><i className="pixel-separator" /><span>MOBILE LEGENDS</span><i className="pixel-separator" /><span>FREE FIRE</span><i className="pixel-separator" /><span>PUBG MOBILE</span><i className="pixel-separator" /><span>GENSHIN IMPACT</span><i className="pixel-separator" /><span>VALORANT</span><i className="pixel-separator" /><span>MINECRAFT</span><i className="pixel-separator" /><span>ROBLOX</span><i className="pixel-separator" /><span>HONKAI STAR RAIL</span><i className="pixel-separator" /><span>CALL OF DUTY MOBILE</span><i className="pixel-separator" /><span>EA SPORTS FC MOBILE</span></div></div>
    <div className="ticker ticker-yellow" aria-label="Janji layanan"><div className="ticker-track ticker-track-reverse"><span>TOP UP CEPAT</span><i className="pixel-separator" /><span>HARGA FAIR</span><i className="pixel-separator" /><span>LANGSUNG MASUK</span><i className="pixel-separator" /><span>TOP UP CEPAT</span><i className="pixel-separator" /><span>HARGA FAIR</span><i className="pixel-separator" /><span>LANGSUNG MASUK</span></div></div>
    <section className="section container" id="catalog"><SectionHeading eyebrow="" title="PICK YOUR PLAYGROUND" action={<span className="result-count">{availableGames.length} titles online</span>} /><div className="game-grid">{availableGames.map((game) => <GameCard key={game.id} game={game} />)}</div></section>
    <section className="section section-dark"><div className="container feature-layout"><div><SectionHeading eyebrow="" title="BUILT FOR THE GRIND" /><p className="muted max-copy">Kami menjaga proses top up tetap singkat, jelas, dan ready setiap kali kamu butuh push rank.</p></div><div className="feature-grid"><Feature icon={Zap} title="Instant delivery" text="Saldo masuk otomatis dalam hitungan detik." /><Feature icon={ShieldCheck} title="Secure checkout" text="Pembayaran terenkripsi dan anti ribet." /><Feature icon={Headphones} title="Human support" text="Butuh bantuan? Player support siap dihubungi." /></div></div></section>
    <section className="section container"><SectionHeading eyebrow="" title="LATEST ARCADE DROP" action={<a className="text-link" href="news.html">View all <ArrowRight size={14} /></a>} /><div className="news-strip">{newsArticles.slice(0, 3).map((article) => <NewsMini key={article.slug} {...article} />)}</div></section>
    <div className="cursor-glow" aria-hidden="true" /><div className="scroll-progress" aria-hidden="true" /><div className="live-toast" aria-live="polite" /><LiveLandingEffects />
  </>;
}

function LiveLandingEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.matchMedia('(max-width: 720px)').matches;
    const hero = document.querySelector('.hero-visual');
    const headline = document.querySelector('.hero h1');
    const glow = document.querySelector('.cursor-glow');
    const particleHost = document.querySelector('.hero-particles');
    const toast = document.querySelector('.live-toast');
    const cards = [...document.querySelectorAll('.game-card')];
    const stats = [...document.querySelectorAll('.stat-number')];
    const cleanups = [];
    let toastTimer;
    let toastHideTimer;
    let glitchTimer;

    const updateProgress = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      root.style.setProperty('--scroll-scale', maxScroll > 0 ? String(window.scrollY / maxScroll) : '0');
    };
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
    cleanups.push(() => window.removeEventListener('scroll', updateProgress));

    const revealCards = () => cards.forEach((card, index) => {
      card.style.setProperty('--card-delay', `${index * 80}ms`);
      card.classList.add('is-visible');
    });

    const countUp = (instant = false) => stats.forEach((stat) => {
      if (stat.dataset.counted) return;
      stat.dataset.counted = 'true';
      const target = Number(stat.dataset.value || 0);
      const suffix = stat.dataset.suffix || '';
      const valueNode = stat.querySelector('.stat-value');
      const writeValue = (value) => {
        if (valueNode) valueNode.textContent = value;
        else stat.textContent = `${value}${suffix}`;
      };
      if (instant) {
        writeValue(target);
        return;
      }
      const started = performance.now();
      const duration = 850;
      const tick = (now) => {
        const progress = Math.min((now - started) / duration, 1);
        writeValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    if (reduceMotion) {
      revealCards();
      countUp(true);
      return () => cleanups.forEach((cleanup) => cleanup());
    }

    if (!mobile && hero) {
      const tilt = (event) => {
        const bounds = hero.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        hero.style.transform = `perspective(1100px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg)`;
      };
      const resetTilt = () => { hero.style.transform = 'perspective(1100px) rotateX(0deg) rotateY(0deg)'; };
      hero.addEventListener('pointermove', tilt);
      hero.addEventListener('pointerleave', resetTilt);
      cleanups.push(() => { hero.removeEventListener('pointermove', tilt); hero.removeEventListener('pointerleave', resetTilt); resetTilt(); });
    }

    if (!mobile && glow) {
      const followCursor = (event) => {
        glow.style.setProperty('--cursor-x', `${event.clientX}px`);
        glow.style.setProperty('--cursor-y', `${event.clientY}px`);
        glow.classList.add('is-visible');
      };
      const hideGlow = () => glow.classList.remove('is-visible');
      window.addEventListener('pointermove', followCursor, { passive: true });
      window.addEventListener('blur', hideGlow);
      cleanups.push(() => { window.removeEventListener('pointermove', followCursor); window.removeEventListener('blur', hideGlow); });
    }

    if (particleHost) {
      const fragment = document.createDocumentFragment();
      const shapes = ['diamond', 'star', 'coin'];
      for (let index = 0; index < 18; index += 1) {
        const particle = document.createElement('span');
        particle.className = 'hero-particle';
        particle.dataset.shape = shapes[index % shapes.length];
        particle.style.setProperty('--particle-x', `${Math.random() * 100}%`);
        particle.style.setProperty('--particle-y', `${Math.random() * 100}%`);
        particle.style.setProperty('--particle-size', `${5 + Math.random() * 7}px`);
        particle.style.setProperty('--particle-duration', `${7 + Math.random() * 8}s`);
        particle.style.setProperty('--particle-delay', `${Math.random() * -8}s`);
        fragment.appendChild(particle);
      }
      particleHost.appendChild(fragment);
      cleanups.push(() => { particleHost.replaceChildren(); });
    }

    if (cards.length) {
      const cardObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const index = cards.indexOf(entry.target);
        entry.target.style.setProperty('--card-delay', `${Math.max(index, 0) * 80}ms`);
        entry.target.classList.add('is-visible');
        cardObserver.unobserve(entry.target);
      }), { threshold: 0.15 });
      cards.forEach((card) => cardObserver.observe(card));
      cleanups.push(() => cardObserver.disconnect());
    }

    if (stats.length) {
      const statsObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          countUp();
          statsObserver.disconnect();
        }
      }, { threshold: 0.4 });
      statsObserver.observe(stats[0].parentElement.parentElement);
      cleanups.push(() => statsObserver.disconnect());
    }

    if (headline) {
      const glitch = () => {
        headline.classList.remove('is-glitch');
        void headline.offsetWidth;
        headline.classList.add('is-glitch');
        window.setTimeout(() => headline.classList.remove('is-glitch'), 420);
      };
      window.setTimeout(glitch, 500);
      glitchTimer = window.setInterval(glitch, 7200);
      cleanups.push(() => { window.clearInterval(glitchTimer); headline.classList.remove('is-glitch'); });
    }

    if (toast) {
      const names = ['Rizky', 'Naya', 'Dion', 'Salsa', 'Bagas', 'Putri', 'Fajar', 'Aulia', 'Reza', 'Nadine', 'Yoga', 'Citra', 'Gilang', 'Tari', 'Andre', 'Vina'];
      const topupItems = [
        { label: 'Diamonds', amounts: [86, 172, 344, 706, 1412, 2195, 3688] },
        { label: 'VP', amounts: [455, 700, 1375, 2400, 4000, 8150] },
        { label: 'CP', amounts: [140, 400, 880, 1400, 2400, 4050, 8100] },
        { label: 'UC', amounts: [60, 325, 660, 1800, 3850, 8100] },
        { label: 'Genesis Crystals', amounts: [60, 330, 1090, 2240, 3880, 8080] },
        { label: 'FF Diamonds', amounts: [70, 140, 355, 720, 1450, 2900] },
        { label: 'Oneiric Shards', amounts: [60, 330, 1090, 2240, 3880] },
        { label: 'Robux', amounts: [80, 400, 800, 1700, 4500] },
      ];
      const verbs = ['top up', 'ambil', 'isi'];
      const randomFrom = (list) => list[Math.floor(Math.random() * list.length)];
      let lastMessage = '';
      const buildMessage = () => {
        const item = randomFrom(topupItems);
        const message = `${randomFrom(names)} baru ${randomFrom(verbs)} ${randomFrom(item.amounts)} ${item.label}`;
        return message !== lastMessage ? message : buildMessage();
      };
      const showToast = () => {
        lastMessage = buildMessage();
        toast.textContent = lastMessage;
        toast.classList.add('is-visible');
        toastHideTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2500 + Math.random() * 2000);
        toastTimer = window.setTimeout(showToast, 8000 + Math.random() * 9000);
      };
      toastTimer = window.setTimeout(showToast, 3000 + Math.random() * 5000);
      cleanups.push(() => { window.clearTimeout(toastTimer); window.clearTimeout(toastHideTimer); toast.classList.remove('is-visible'); });
    }

    const burst = (event) => {
      const spark = document.createElement('span');
      spark.className = 'click-burst';
      spark.style.setProperty('--burst-x', `${event.clientX}px`);
      spark.style.setProperty('--burst-y', `${event.clientY}px`);
      document.body.appendChild(spark);
      window.setTimeout(() => spark.remove(), 520);
    };
    document.addEventListener('click', burst);
    cleanups.push(() => document.removeEventListener('click', burst));

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);
  return null;
}

function HeroArcadeArtwork() {
  return <div className="hero-visual" aria-label="What's New showcase"><div className="hero-glow" /><div className="scanlines" /><div className="stage-badge">STAGE 08</div><div className="visual-sticker sticker-top">INSERT<br />COINS</div><div className="arcade-cabinet"><div className="cabinet-screen"><div className="screen-heading"><h2>WHAT'S NEW</h2><Gamepad2 size={24} /></div><div className="hero-art-stage"><img className="hero-feature-image" src="/file.png" alt="Harvey Store latest update" /></div><p className="screen-title">WHAT'S NEW <span>/ HARVEY STORE</span></p></div></div></div>;
}

const GAME_PALETTES = {
  'mobile-legends': ['#ff3f9f', '#321326', '#fff0a8'], 'free-fire': ['#ff834f', '#341a15', '#fff0a8'], 'pubg-mobile': ['#b3c95d', '#273118', '#f4f6c4'], 'genshin-impact': ['#be8cff', '#271c3d', '#f2e7ff'], 'valorant': ['#ff6b5d', '#3b181d', '#ffe4db'], 'minecraft': ['#64d87c', '#18351f', '#dfffe4'], 'roblox': ['#ffcc4d', '#3d2a13', '#fff1bd'], 'honkai-star-rail': ['#b88bff', '#26173b', '#f1e3ff'], 'cod-mobile': ['#ffad45', '#3b2414', '#fff0be'], 'fc-mobile': ['#7ee2c0', '#17372e', '#e2fff5'], 'steam-wallet': ['#74a8ff', '#172845', '#e4efff'], 'playstation-store': ['#d58cff', '#2d193d', '#f3e2ff'],
  'honkai-impact': ['#ff6fa8', '#351b2d', '#ffe4ef'], 'magic-chess': ['#ffbf4d', '#3b2a16', '#fff0c1'], 'wuthering-waves': ['#70d9ff', '#17334a', '#e0f8ff'], 'clash-of-clans': ['#a9d65b', '#263719', '#efffcf'], 'clash-royale': ['#69a9ff', '#172c4d', '#e4f0ff'], csgo: ['#e2a55c', '#3b291b', '#fff0c9'],
  'where-winds-meet': ['#ffca67', '#33220f', '#fff3c4'], 'league-of-legends': ['#c9a96e', '#1f2538', '#e9e4d4'], 'honor-of-kings': ['#67e8c2', '#12352f', '#e8fff6'], arknights: ['#d67cff', '#2c1d42', '#f6ddff'], 'zenless-zone-zero': ['#ff5f8f', '#3b1628', '#ffe0ea'], 'neverness-to-everness': ['#a5a7ff', '#1e214d', '#e4e7ff'], 'blood-strike': ['#ff5858', '#3d1818', '#ffd0b8'], 'delta-force': ['#ffb45c', '#3c2817', '#fff0b5'], 'racing-master': ['#5dffdc', '#123a37', '#d8fff4'], 'arena-of-valor': ['#ff8b57', '#3b1d17', '#ffe6d4'], 'azur-lane': ['#79c8ff', '#172d4b', '#e1f3ff'],
};
const getGamePalette = (game) => GAME_PALETTES[game?.id] || ['#8ce7ff', '#172b42', '#e6faff'];
const getGameThemeStyle = (game) => { const [accent, dark, light] = getGamePalette(game); return { '--game-accent': accent, '--game-dark': dark, '--game-light': light, '--thumb-accent': accent, '--thumb-dark': dark }; };
const getGameMonogram = (game) => String(game?.title || 'GAME').replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'GAME';

function GameCard({ game }) { const categoryLabel = getGameCategories(game).join(' / '); return <article className="game-card" data-game={game.id} style={getGameThemeStyle(game)}><div className="game-cover cover-art"><GameImage game={game} />{['mobile-legends', 'valorant', 'genshin-impact'].includes(game.id) && <span className="game-badge">{game.badge}</span>}</div><div className="game-info"><div className="game-meta"><span>{categoryLabel}</span><span><Star size={12} fill="currentColor" /> {game.rating}</span></div><h3>{game.title}</h3><p>{game.genre}</p><div className="game-accent-line" /><div className="game-bottom"><span className="game-format">{categoryLabel}</span><a className="card-topup" href={`topup.html?game=${game.id}`}>TOP UP <ArrowRight size={13} /></a></div></div></article>; }

function GameImage({ game }) {
  if (game.image) return <img className="game-image" src={game.image} alt={game.title} />;
  return <div className="game-image-placeholder" aria-label={`${game.title} image placeholder`}><span>GAME IMAGE</span><small>Upload dari panel admin</small></div>;
}

function PixelGameArt({ art, title }) {
  const shapes = {
    'mobile-legends': <><rect className="art-sword-small" x="83" y="41" width="8" height="96" /><rect className="art-sword-small" x="74" y="41" width="26" height="8" /><rect className="art-sword-small" x="73" y="133" width="28" height="9" /><rect className="art-hero-small" x="121" y="72" width="44" height="55" /><rect className="art-hero-small" x="130" y="55" width="27" height="18" /><rect className="art-face-small" x="130" y="77" width="25" height="19" /></>,
    'free-fire': <><rect className="art-flame" x="108" y="49" width="45" height="80" /><rect className="art-flame" x="93" y="78" width="15" height="41" /><rect className="art-flame-light" x="120" y="72" width="18" height="54" /><rect className="art-flame-light" x="139" y="90" width="18" height="30" /></>,
    'pubg-mobile': <><rect className="art-shield-small" x="99" y="54" width="69" height="79" /><rect className="art-shield-small" x="108" y="45" width="51" height="9" /><rect className="art-shield-small" x="108" y="133" width="51" height="9" /><rect className="art-shield-mark-small" x="122" y="77" width="24" height="31" /></>,
    'genshin-impact': <><rect className="art-diamond-small" x="107" y="48" width="53" height="9" /><rect className="art-diamond-small" x="98" y="57" width="71" height="53" /><rect className="art-diamond-small" x="107" y="110" width="53" height="9" /><rect className="art-diamond-light-small" x="126" y="57" width="15" height="53" /></>,
    'valorant': <><rect className="art-target" x="99" y="52" width="69" height="9" /><rect className="art-target" x="90" y="61" width="87" height="62" /><rect className="art-target" x="99" y="123" width="69" height="9" /><rect className="art-target-center" x="118" y="78" width="32" height="28" /></>,
    'minecraft': <><rect className="art-block" x="91" y="61" width="78" height="78" /><rect className="art-block-light" x="100" y="70" width="60" height="11" /><rect className="art-block-dark" x="100" y="111" width="16" height="19" /><rect className="art-block-dark" x="144" y="111" width="16" height="19" /></>,
    'roblox': <><rect className="art-cube" x="94" y="62" width="70" height="70" /><rect className="art-cube-light" x="103" y="71" width="52" height="12" /><rect className="art-cube-dark" x="103" y="104" width="15" height="15" /><rect className="art-cube-dark" x="140" y="104" width="15" height="15" /></>,
    'honkai-star-rail': <><rect className="art-star-big" x="117" y="48" width="25" height="90" /><rect className="art-star-big" x="85" y="80" width="90" height="25" /><rect className="art-star-light" x="126" y="80" width="8" height="25" /></>,
    'honkai-impact': <><rect className="art-sword-small" x="118" y="46" width="12" height="94" /><rect className="art-sword-small" x="95" y="82" width="58" height="12" /><rect className="art-sword-small" x="106" y="62" width="15" height="15" /><rect className="art-face-small" x="125" y="82" width="15" height="12" /></>,
    'cod-mobile': <><rect className="art-crosshair" x="119" y="48" width="25" height="89" /><rect className="art-crosshair" x="87" y="80" width="89" height="25" /><rect className="art-crosshair-center" x="126" y="87" width="12" height="12" /></>,
    'magic-chess': <><rect className="art-block" x="102" y="63" width="58" height="67" /><rect className="art-block-light" x="111" y="72" width="40" height="12" /><rect className="art-block-dark" x="111" y="103" width="12" height="17" /><rect className="art-block-dark" x="139" y="103" width="12" height="17" /></>,
    'wuthering-waves': <><rect className="art-diamond-small" x="108" y="48" width="49" height="10" /><rect className="art-diamond-small" x="98" y="58" width="69" height="52" /><rect className="art-diamond-small" x="108" y="110" width="49" height="10" /><rect className="art-diamond-light-small" x="126" y="58" width="15" height="52" /></>,
    'clash-of-clans': <><rect className="art-shield-small" x="101" y="58" width="63" height="75" /><rect className="art-shield-small" x="110" y="49" width="45" height="9" /><rect className="art-shield-mark-small" x="122" y="78" width="22" height="26" /></>,
    'clash-royale': <><rect className="art-shield-small" x="101" y="58" width="63" height="75" /><rect className="art-shield-small" x="110" y="49" width="45" height="9" /><rect className="art-shield-mark-small" x="122" y="75" width="22" height="31" /></>,
    csgo: <><rect className="art-target" x="99" y="52" width="69" height="9" /><rect className="art-target" x="90" y="61" width="87" height="62" /><rect className="art-target" x="99" y="123" width="69" height="9" /><rect className="art-target-center" x="118" y="78" width="32" height="28" /></>,
    'fc-mobile': <><rect className="art-ball" x="106" y="58" width="52" height="52" /><rect className="art-ball-light" x="115" y="67" width="34" height="10" /><rect className="art-ball-dark" x="115" y="95" width="34" height="10" /><rect className="art-ball-dark" x="128" y="77" width="9" height="28" /></>,
    'steam-wallet': <><rect className="art-controller" x="88" y="72" width="85" height="42" /><rect className="art-controller" x="103" y="61" width="15" height="21" /><rect className="art-controller" x="143" y="61" width="15" height="21" /><rect className="art-controller-light" x="104" y="86" width="19" height="8" /><rect className="art-controller-light" x="145" y="84" width="8" height="8" /></>,
    'playstation-store': <><rect className="art-console" x="105" y="55" width="49" height="86" /><rect className="art-console-light" x="114" y="65" width="31" height="13" /><rect className="art-console-light" x="114" y="94" width="31" height="13" /><rect className="art-console-dark" x="114" y="117" width="31" height="15" /></>,
    'where-winds-meet': <><rect className="art-sword-small" x="83" y="41" width="8" height="96" /><rect className="art-sword-small" x="74" y="41" width="26" height="8" /><rect className="art-hero-small" x="121" y="72" width="44" height="55" /><rect className="art-face-small" x="130" y="77" width="25" height="19" /></>,
    'league-of-legends': <><rect className="art-target" x="99" y="52" width="69" height="9" /><rect className="art-target" x="90" y="61" width="87" height="62" /><rect className="art-target" x="99" y="123" width="69" height="9" /><rect className="art-target-center" x="118" y="78" width="32" height="28" /></>,
    'honor-of-kings': <><rect className="art-shield-small" x="99" y="54" width="69" height="79" /><rect className="art-shield-small" x="108" y="45" width="51" height="9" /><rect className="art-shield-mark-small" x="122" y="77" width="24" height="31" /></>,
    arknights: <><rect className="art-star-big" x="117" y="48" width="25" height="90" /><rect className="art-star-big" x="85" y="80" width="90" height="25" /><rect className="art-star-light" x="126" y="80" width="8" height="25" /></>,
    'zenless-zone-zero': <><rect className="art-diamond-small" x="107" y="48" width="53" height="9" /><rect className="art-diamond-small" x="98" y="57" width="71" height="53" /><rect className="art-diamond-small" x="107" y="110" width="53" height="9" /><rect className="art-diamond-light-small" x="126" y="57" width="15" height="53" /></>,
    'neverness-to-everness': <><rect className="art-cube" x="94" y="62" width="70" height="70" /><rect className="art-cube-light" x="103" y="71" width="52" height="12" /><rect className="art-cube-dark" x="103" y="104" width="15" height="15" /><rect className="art-cube-dark" x="140" y="104" width="15" height="15" /></>,
    'blood-strike': <><rect className="art-crosshair" x="119" y="48" width="25" height="89" /><rect className="art-crosshair" x="87" y="80" width="89" height="25" /><rect className="art-crosshair-center" x="126" y="87" width="12" height="12" /></>,
    'delta-force': <><rect className="art-target" x="99" y="52" width="69" height="9" /><rect className="art-target" x="90" y="61" width="87" height="62" /><rect className="art-target" x="99" y="123" width="69" height="9" /><rect className="art-target-center" x="118" y="78" width="32" height="28" /></>,
    'racing-master': <><rect className="art-ball" x="106" y="58" width="52" height="52" /><rect className="art-ball-light" x="115" y="67" width="34" height="10" /><rect className="art-ball-dark" x="115" y="95" width="34" height="10" /><rect className="art-ball-dark" x="128" y="77" width="9" height="28" /></>,
    'arena-of-valor': <><rect className="art-shield-small" x="99" y="54" width="69" height="79" /><rect className="art-shield-small" x="108" y="45" width="51" height="9" /><rect className="art-shield-mark-small" x="122" y="77" width="24" height="31" /></>,
    'azur-lane': <><rect className="art-star-big" x="117" y="48" width="25" height="90" /><rect className="art-star-big" x="85" y="80" width="90" height="25" /><rect className="art-star-light" x="126" y="80" width="8" height="25" /></>,
  };
  return <svg className="pixel-game-art" viewBox="0 0 260 180" role="img" aria-label={`${title} pixel art thumbnail`} shapeRendering="crispEdges"><rect className="art-bg" x="0" y="0" width="260" height="180" /><rect className="art-gridline" x="25" y="142" width="210" height="7" />{shapes[art] || <><rect className="art-controller" x="88" y="72" width="85" height="42" /><rect className="art-controller-light" x="104" y="86" width="19" height="8" /><rect className="art-controller-light" x="145" y="84" width="8" height="8" /></>}<rect className="art-spark" x="46" y="48" width="7" height="7" /><rect className="art-spark" x="201" y="66" width="7" height="7" /><rect className="art-spark" x="213" y="121" width="5" height="5" /></svg>;
}

function TopupPage({ notify }) {
  const searchParams = new URLSearchParams(window.location.search);
  const initialId = getGameById(searchParams.get('game'))?.id || '';
  const initialGame = getGameById(initialId);
  const [selectedGameId, setSelectedGameId] = useState(initialId);
  const [nominal, setNominal] = useState(() => initialGame?.nominals.find((item) => item.label === searchParams.get('nominal')) || getDefaultNominal(initialGame));
  const [itemGroup, setItemGroup] = useState(() => initialGame?.nominals.find((item) => item.label === searchParams.get('nominal'))?.group || getDefaultItemGroup(initialGame));
  const [userId, setUserId] = useState(searchParams.get('userId') || '');
  const [server, setServer] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [savedProfiles, setSavedProfiles] = useState(() => readStoredList(STORAGE_KEYS.profiles));
  const [session] = useState(() => readStoredValue(STORAGE_KEYS.session));
  const game = getGameById(selectedGameId);
  const requiresServer = game && ['mobile-legends', 'genshin-impact'].includes(game.id);
  const isGenshin = game?.id === 'genshin-impact';
  const serverFieldLabel = isGenshin ? 'Server' : 'Server / Zone';
  const playerLabel = getPlayerLabel(game);
  const savedProfilesForGame = savedProfiles.filter((profile) => profile.gameId === game?.id);
  const itemGroups = getItemGroups(game);
  const visibleNominals = game ? game.nominals.filter((item) => (itemGroup === 'diamonds' ? !item.group : item.group === itemGroup)) : [];

  const chooseGame = (gameId) => {
    setSelectedGameId(gameId);
    setNominal(null);
    setItemGroup('diamonds');
    setUserId('');
    setServer('');
    setEmail('');
    const nextParams = new URLSearchParams(window.location.search);
    nextParams.set('game', gameId);
    nextParams.delete('nominal');
    nextParams.delete('userId');
    nextParams.delete('email');
    window.history.replaceState({}, '', `${window.location.pathname}?${nextParams.toString()}`);
  };

  useEffect(() => {
    if (!selectedGameId) return;
    const nextGame = getGameById(selectedGameId);
    const nextNominal = getDefaultNominal(nextGame);
    setNominal(nextNominal);
    setItemGroup(nextNominal?.group || 'diamonds');
  }, [selectedGameId]);

  const continueToPayment = () => {
    if (!game || !nominal) return;
    if (!session) return openPage('account.html?mode=login&return=topup.html');
    if (!userId.trim()) return notify(`Isi ${playerLabel} dulu ya.`);
    if (!isValidPlayerInput(userId)) return notify(`${playerLabel} hanya boleh berisi huruf, angka, spasi, titik, strip, atau underscore.`);
    if (!isValidEmail(email)) return notify('Masukkan email yang valid, contoh: nama@gmail.com.');
    if (requiresServer && !server.trim()) return notify(`${isGenshin ? 'Pilih' : 'Isi'} ${serverFieldLabel} dulu ya.`);
    const params = new URLSearchParams({ game: game.id, nominal: nominal.label, price: nominal.price, userId: userId.trim(), server: requiresServer ? server.trim() : '', email: email.trim().toLowerCase() });
    openPage(`payment.html?${params.toString()}`);
  };

  const savePlayerProfile = () => {
    if (!game || !userId.trim()) return notify(`Isi ${playerLabel} dulu untuk menyimpan data.`);
    if (!isValidPlayerInput(userId)) return notify(`${playerLabel} hanya boleh berisi huruf, angka, spasi, titik, strip, atau underscore.`);
    if (requiresServer && !server.trim()) return notify(`${isGenshin ? 'Pilih' : 'Isi'} ${serverFieldLabel} dulu untuk menyimpan data.`);
    if (!isValidEmail(email)) return notify('Masukkan email yang valid sebelum menyimpan data player.');
    const profile = {
      id: `${game.id}:${userId.trim().toLowerCase()}:${server.trim().toLowerCase()}`,
      gameId: game.id,
      gameTitle: game.title,
      playerLabel,
      userId: userId.trim(),
      server: server.trim(),
      email: email.trim().toLowerCase(),
      updatedAt: new Date().toISOString(),
    };
    const nextProfiles = [profile, ...savedProfiles.filter((item) => item.id !== profile.id)];
    setSavedProfiles(nextProfiles);
    if (!writeStoredList(STORAGE_KEYS.profiles, nextProfiles)) return notify('Data player gagal disimpan.');
    notify('Data player berhasil disimpan.');
  };

  const useSavedProfile = (profile) => {
    setUserId(profile.userId || '');
    setServer(profile.server || '');
    setEmail(profile.email || '');
    notify(`Data ${profile.userId} dimuat.`);
  };

  return <section className="container page-section"><Breadcrumbs current="Top Up" /><PageIntro eyebrow="TOP UP TERMINAL" title="LOAD YOUR ACCOUNT" text="Pilih game, masukkan data player, lalu lanjutkan ke checkout yang aman." /><GamePicker selectedGameId={selectedGameId} onSelect={chooseGame} /><div className="topup-layout">{game ? <div className="topup-form panel"><div className="selected-game"><GameThumb game={game} /><div><span className="mini-label">SELECTED GAME</span><h2>{game.title}</h2><p>{game.genre} · {game.publisher}</p></div><a className="change-link" href="#game-picker">Ganti game</a></div><FormStep number="01" title="Player detail"><div className="field-row"><label>{playerLabel}<input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder={`${playerLabel} kamu`} required minLength="2" maxLength="64" /></label>{requiresServer && (isGenshin ? <label>Server<select value={server} onChange={(event) => setServer(event.target.value)} required><option value="">Pilih server</option>{GAME_SERVER_OPTIONS['genshin-impact'].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : <label>Server / Zone<input value={server} onChange={(event) => setServer(event.target.value)} placeholder="Server / zone" required maxLength="40" /></label>)}</div><label>Email untuk invoice<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@gmail.com" autoComplete="email" required maxLength="254" /></label><div className="player-save-row"><button type="button" className="text-button" onClick={savePlayerProfile}>Simpan data player</button><span className="local-data-note">Data player tersimpan</span></div>{savedProfilesForGame.length > 0 && <div className="saved-profiles"><span className="saved-profiles-label">DATA TERSIMPAN UNTUK {game.title.toUpperCase()}</span><div className="saved-profile-list">{savedProfilesForGame.map((profile) => <button type="button" className="saved-profile" key={profile.id} onClick={() => useSavedProfile(profile)}><span><b>{profile.userId}</b><small>{profile.playerLabel}{profile.server ? ` · ${profile.server}` : ''}</small></span><span className="saved-profile-use">PAKAI</span></button>)}</div></div>}</FormStep><FormStep number="02" title="Choose nominal">{itemGroups.length > 1 && <div className="category-tabs item-tabs">{itemGroups.map((group) => <button type="button" key={group.id} className={itemGroup === group.id ? 'active' : ''} onClick={() => setItemGroup(group.id)}>{group.label}</button>)}</div>}<div className="nominal-grid">{visibleNominals.map((item) => <button type="button" key={item.label} className={`nominal-card ${nominal?.label === item.label ? 'active' : ''}`} onClick={() => setNominal(item)}><span>{item.label}</span><b>{formatRupiah(item.price)}</b>{item.hot && <i>HOT</i>}</button>)}</div></FormStep><div className="form-notice"><ShieldCheck size={16} /><span>Data player dan transaksi tersimpan aman.</span></div></div> : <div className="topup-form panel topup-empty"><div className="empty-icon"><Gamepad2 size={25} /></div><span className="mini-label">READY PLAYER?</span><h2>Pilih game dulu</h2><p>Pilih game di grid atas untuk membuka nominal dan detail top up.</p><a className="button button-secondary" href="#game-picker">Pilih game <ArrowRight size={16} /></a></div>}{game ? <aside className="order-preview panel"><div className="panel-heading"><span>ORDER PREVIEW</span><span className="status-dot">READY</span></div><div className="preview-cover"><GameThumb game={game} /><div><span className="muted">Top up</span><h3>{game.title}</h3><p>{nominal?.label || 'Pilih nominal'}</p></div></div>{nominal && <Summary price={nominal.price} fee={1500} />}<button className="button button-primary full" onClick={continueToPayment} disabled={!nominal}>Continue payment <ArrowRight size={16} /></button><p className="tiny-note">Dengan lanjut, kamu menyetujui terms of service Harvey Store.</p></aside> : <aside className="order-preview panel empty-order"><div className="panel-heading"><span>ORDER PREVIEW</span><span className="status-dot">WAITING</span></div><div className="empty-preview"><Gamepad2 size={22} /><p>Pilih game untuk melihat order preview.</p></div><button className="button button-primary full" disabled>Continue payment <ArrowRight size={16} /></button></aside>}</div></section>;
}

function DemoQrCode({ value, amount }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 1, width: 220, color: { dark: '#151417', light: '#ffffff' } }).then((dataUrl) => { if (active) setImage(dataUrl); }).catch(() => setImage(''));
    return () => { active = false; };
  }, [value]);
  return <div className="demo-qris"><div className="demo-qris-head"><span>QRIS SCAN</span><small>SIMULATION</small></div>{image ? <img src={image} alt="QRIS pembayaran simulasi" /> : <div className="demo-qris-loading">Preparing QR...</div>}<b>{formatRupiah(amount)}</b><p>Scan untuk melihat detail pembayaran demo. Tidak memotong saldo sungguhan.</p></div>;
}

function PaymentGuide({ option, amount, notify }) {
  return <div className="va-guide"><div className="va-guide-head"><span>CARA BAYAR · {option.name}</span><small>SIMULATION</small></div>{option.vaNumber && <div className="va-number-row"><code>{option.vaNumber}</code><button type="button" aria-label={`Salin nomor Virtual Account ${option.name}`} onClick={() => { navigator.clipboard?.writeText(option.vaNumber.replace(/\s/g, '')); notify('Nomor VA disalin.'); }}><Copy size={14} /></button></div>}<b>Nominal {formatRupiah(amount)} a.n. HARVEY STORE</b><ol className="va-steps">{option.steps.map((step) => <li key={step}>{step}</li>)}</ol><p>Panduan demo. Tidak memotong saldo sungguhan.</p></div>;
}

function PaymentPage({ notify }) {
  const params = new URLSearchParams(window.location.search);
  const game = getGameById(params.get('game')) || getAvailableGames()[0];
  const defaultNominal = getDefaultNominal(game);
  const nominal = params.get('nominal') || defaultNominal.label;
  const price = Number(params.get('price')) || defaultNominal.price;
  const playerLabel = getPlayerLabel(game);
  const userId = params.get('userId') || '';
  const server = params.get('server') || '';
  const email = params.get('email') || '';
  const session = readStoredValue(STORAGE_KEYS.session);
  const [method, setMethod] = useState('QRIS');
  const [qrisRequested, setQrisRequested] = useState(false);
  const [vaBank, setVaBank] = useState(null);
  const selectedVaBank = vaBanks.find((bank) => bank.id === vaBank);
  const [ewallet, setEwallet] = useState(null);
  const [ewalletAccount, setEwalletAccount] = useState('');
  const selectedEwallet = ewallets.find((wallet) => wallet.id === ewallet);
  const [paid, setPaid] = useState(false);
  const [completedOrderId, setCompletedOrderId] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const discount = appliedCoupon?.discount || 0;
  const total = price + 1500 - discount;

  const applyCoupon = () => {
    const code = couponCode.trim().toUpperCase();
    const coupon = readStoredList(STORAGE_KEYS.loyaltyRedemptions).find((item) => item.accountId === session?.accountId && item.code === code);
    if (!coupon) return notify('Kode kupon tidak ditemukan di akunmu.');
    if (price < Number(coupon.minSpend || 0)) return notify(`Kupon ini membutuhkan minimal order ${formatRupiah(coupon.minSpend)}.`);
    setAppliedCoupon(coupon);
    notify(`Kupon ${coupon.code} berhasil dipakai.`);
  };

  const pay = () => {
    if (paid || !session) return;
    if (!isValidPlayerInput(userId)) return notify(`Data ${playerLabel} tidak valid. Periksa kembali input player.`);
    if (!isValidEmail(email)) return notify('Email invoice tidak valid. Kembali ke Top Up dan perbaiki email.');
    if (method === 'QRIS' && !qrisRequested) {
      setQrisRequested(true);
      return;
    }
    if (method === 'Virtual Account' && !selectedVaBank) return notify('Pilih bank Virtual Account dulu ya.');
    if (method === 'E-wallet' && !selectedEwallet) return notify('Pilih e-wallet dulu ya.');
    if (method === 'E-wallet' && !ewalletAccount.trim()) return notify(`Masukkan ${selectedEwallet.name} dulu ya.`);
    if (method === 'E-wallet' && !isValidEwalletAccount(ewalletAccount)) return notify('Nomor e-wallet harus 8–16 digit.');
    const now = new Date();
    const existingOrders = readStoredList(STORAGE_KEYS.orders);
    const order = {
      id: createUniqueOrderId(game, existingOrders),
      accountId: session.accountId,
      accountName: session.username,
      gameId: game.id,
      game: game.title,
      nominal,
      subtotal: price,
      fee: 1500,
      discount,
      couponCode: appliedCoupon?.code || '',
      price: total,
      status: 'Paid',
      date: now.toLocaleDateString('id-ID'),
      createdAt: now.toISOString(),
      playerLabel,
      userId,
      server,
      email,
      ewalletAccount: selectedEwallet ? ewalletAccount.trim() : '',
      paymentMethod: selectedVaBank ? `Virtual Account · ${selectedVaBank.name}` : selectedEwallet ? `E-wallet · ${selectedEwallet.name}` : method,
    };
    const savedOrders = [order, ...existingOrders];
    if (!writeStoredList(STORAGE_KEYS.orders, savedOrders)) {
      notify('Transaksi gagal diproses.');
      return;
    }
    addAccountNotification(session.accountId, { id: `order-paid-${order.id}`, title: 'Order berhasil', message: `${order.game} · ${order.nominal} sudah tercatat dan siap diproses.`, type: 'order', orderId: order.id });
    setPaid(true);
    setCompletedOrderId(order.id);
    notify('Order berhasil dibuat. GG, player!');
  };

  if (!session) return <AuthRequired title="Login untuk melanjutkan" text="Masuk atau buat akun Harvey Store dulu agar order ini masuk ke history kamu." returnTo={`payment.html${window.location.search}`} />;
  if (paid) return <section className="container page-section"><div className="success-card panel"><div className="success-icon"><Check size={34} /></div><h1>PAYMENT<br /><span>COMPLETE.</span></h1><p>Order <b>{completedOrderId}</b> kamu sudah tercatat. Item <b>{nominal}</b> untuk {game.title} sedang dikirim ke {playerLabel} <b>{userId || 'your account'}</b>.</p><p className="loyalty-earned">+{pointsForOrder({ subtotal: price })} Harvey Points earned</p><div className="success-actions"><a className="button button-primary" href="history.html">Open history <History size={16} /></a><a className="button button-ghost" href="ratings.html">Kasih rating <Star size={16} /></a><a className="button button-ghost" href="index.html">Back to arcade</a></div></div></section>;
  const qrValue = `https://mbr8arcade.com/demo-payment?game=${encodeURIComponent(game.id)}&nominal=${encodeURIComponent(nominal)}&amount=${total}`;
  return <section className="container page-section"><Breadcrumbs current="Payment" /><PageIntro eyebrow="SECURE CHECKOUT" title="FINAL CHECKPOINT" text="Satu langkah lagi sebelum item masuk ke akunmu." /><div className="payment-layout"><div className="panel payment-methods"><div className="panel-heading"><span>01 / PAYMENT METHOD</span><span className="secure-label"><ShieldCheck size={14} /> encrypted</span></div><div className="method-list">{['QRIS', 'Virtual Account', 'E-wallet'].map((item) => <button type="button" key={item} className={`method-option ${method === item ? 'active' : ''}`} onClick={() => { setMethod(item); setQrisRequested(false); setVaBank(null); setEwallet(null); setEwalletAccount(''); }}><span className="method-icon">{item === 'QRIS' ? <span className="scan-symbol" /> : item === 'E-wallet' ? <Wallet size={20} /> : <CreditCard size={20} />}</span><span><b>{item}</b><small>{item === 'QRIS' ? 'Scan dari semua mobile banking' : item === 'E-wallet' ? 'GoPay, OVO, DANA, ShopeePay' : 'BCA, BRI, BNI, Mandiri'}</small></span><span className="radio-dot" /></button>)}</div>{method === 'QRIS' && qrisRequested && <DemoQrCode value={qrValue} amount={total} />}{method === 'Virtual Account' && <div className="va-section"><div className="va-bank-list">{vaBanks.map((bank) => <button type="button" key={bank.id} className={`va-bank-option ${vaBank === bank.id ? 'active' : ''}`} onClick={() => setVaBank(bank.id)}><span><b>{bank.name}</b><small>{bank.app}</small></span><span className="radio-dot" /></button>)}</div>{selectedVaBank && <PaymentGuide option={selectedVaBank} amount={total} notify={notify} />}</div>}{method === 'E-wallet' && <div className="va-section"><div className="va-bank-list">{ewallets.map((wallet) => <button type="button" key={wallet.id} className={`va-bank-option ${ewallet === wallet.id ? 'active' : ''}`} onClick={() => { if (ewallet !== wallet.id) setEwalletAccount(''); setEwallet(wallet.id); }}><span><b>{wallet.name}</b><small>{wallet.app}</small></span><span className="radio-dot" /></button>)}</div>{selectedEwallet && <><label className="ewallet-input-field">{selectedEwallet.accountLabel}<input type="tel" inputMode="numeric" autoComplete="tel" value={ewalletAccount} onChange={(event) => setEwalletAccount(event.target.value)} placeholder={selectedEwallet.accountPlaceholder} maxLength="18" aria-label={selectedEwallet.accountLabel} /><small>Masukkan nomor akun yang menerima permintaan pembayaran.</small></label><PaymentGuide option={selectedEwallet} amount={total} notify={notify} /></>}</div>}<div className="payment-note"><ShieldCheck size={17} /><span>Checkout dilindungi sistem anti-fraud Harvey Store.</span></div></div><aside className="panel checkout-summary"><div className="panel-heading"><span>02 / SUMMARY</span><Ticket size={17} /></div><div className="checkout-game"><GameThumb game={game} /><div><b>{game.title}</b><span>{nominal}</span><small>{playerLabel}: {userId || 'not set'}{server ? ` · ${server}` : ''}</small></div></div><div className="coupon-entry"><label>Kode kupon<input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="M8-SAVE5-XXXXXX" /></label><button type="button" className="button button-ghost" onClick={applyCoupon}>Pakai kupon</button>{appliedCoupon && <small>Kupon {appliedCoupon.code} aktif · hemat {formatRupiah(discount)}</small>}</div><Summary price={price} fee={1500} discount={discount} label="Pay now" /><button type="button" className="button button-primary full" onClick={pay}>{method === 'QRIS' && qrisRequested ? 'Konfirmasi pembayaran' : `Pay with ${method}`} <ArrowRight size={16} /></button><p className="tiny-note">Invoice akan dikirim ke {email || 'email kamu'}.</p></aside></div></section>;
}

function AuthRequired({ title, text, returnTo = 'history.html' }) {
  const loginUrl = `account.html?mode=login&return=${encodeURIComponent(returnTo)}`;
  const registerUrl = `account.html?mode=register&return=${encodeURIComponent(returnTo)}`;
  return <section className="container page-section"><div className="auth-required panel"><div className="auth-required-icon"><User size={24} /></div><h1>{title}</h1><p>{text}</p><div className="success-actions"><a className="button button-primary" href={loginUrl}><LogIn size={16} /> Login</a><a className="button button-ghost" href={registerUrl}>Create new account</a></div></div></section>;
}

function AccountPage({ notify }) {
  const searchParams = new URLSearchParams(window.location.search);
  const requestedReturn = searchParams.get('return') || 'history.html';
  const returnTo = /^(index|topup|payment|history|ratings)\.html(?:\?.*)?$/.test(requestedReturn) ? requestedReturn : 'history.html';
  const [session, setSession] = useState(() => readStoredValue(STORAGE_KEYS.session));
  const [mode, setMode] = useState(searchParams.get('mode') === 'register' ? 'register' : 'login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(() => session?.avatar || '');

  const completeLogin = (account) => {
    const nextSession = { accountId: account.id, username: account.username, email: account.email, avatar: account.avatar || '' };
    if (!writeStoredValue(STORAGE_KEYS.session, nextSession)) {
      setError('Sesi tidak bisa dibuat. Coba lagi.');
      return;
    }
    setSession(nextSession);
    window.location.href = returnTo;
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const accounts = readStoredList(STORAGE_KEYS.accounts);
    try {
      if (mode === 'register') {
        const cleanUsername = username.trim();
        const cleanEmail = email.trim().toLowerCase();
        if (!isValidUsername(cleanUsername)) throw new Error('Nama pengguna harus 3–24 karakter, diawali huruf, tanpa spasi.');
        if (!isValidEmail(cleanEmail)) throw new Error('Email tidak valid. Gunakan format seperti nama@gmail.com.');
        if (!isValidRegistrationPassword(password)) throw new Error('Password minimal 8 karakter, harus punya huruf dan angka, tanpa spasi.');
        if (accounts.some((account) => account.username.toLowerCase() === cleanUsername.toLowerCase())) throw new Error('Username sudah dipakai.');
        if (accounts.some((account) => account.email.toLowerCase() === cleanEmail)) throw new Error('Email sudah terdaftar.');
        const account = { id: `ACC-${Date.now()}-${Math.floor(Math.random() * 1000)}`, username: cleanUsername, email: cleanEmail, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
        if (!writeStoredList(STORAGE_KEYS.accounts, [account, ...accounts])) throw new Error('Akun tidak bisa dibuat.');
        addAccountNotification(account.id, { id: `welcome-${account.id}`, title: 'Selamat datang di Harvey Store', message: 'Akun kamu sudah aktif. Yuk mulai top up game favoritmu.', type: 'welcome' });
        completeLogin(account);
      } else {
        const cleanIdentifier = identifier.trim().toLowerCase();
        if (!cleanIdentifier) throw new Error('Masukkan email atau username.');
        if (!password) throw new Error('Masukkan password.');
        const account = accounts.find((item) => item.email.toLowerCase() === cleanIdentifier || item.username.toLowerCase() === cleanIdentifier);
        if (!account || account.passwordHash !== await hashPassword(password)) throw new Error('Username/email atau password salah.');
        completeLogin(account);
      }
    } catch (submitError) {
      setError(submitError.message || 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    removeStoredValue(STORAGE_KEYS.session);
    setSession(null);
    notify('Kamu sudah logout.');
  };

  const handleProfilePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('Pilih file gambar ya.');
    if (file.size > 8 * 1024 * 1024) return notify('Ukuran foto maksimal 8 MB.');
    try {
      const avatar = await compressAvatar(file);
      if (!updateAccountAvatar(session.accountId, avatar)) return notify('Foto profil gagal disimpan.');
      setProfilePhoto(avatar);
      setSession({ ...session, avatar });
      notify('Foto profil berhasil disimpan.');
    } catch (photoError) {
      notify(photoError.message || 'Foto profil gagal disimpan.');
    }
  };

  const removeProfilePhoto = () => {
    if (!updateAccountAvatar(session.accountId, '')) return notify('Foto profil gagal dihapus.');
    setProfilePhoto('');
    setSession({ ...session, avatar: '' });
    notify('Foto profil dihapus.');
  };

  if (session) return <section className="container page-section"><Breadcrumbs current="Account" /><PageIntro eyebrow="PLAYER ACCOUNT" title="WELCOME BACK" text="Akun kamu aktif dan siap dipakai." /><div className="account-card panel account-signed-in"><div className="profile-photo-editor"><div className="profile-avatar-large">{profilePhoto ? <img src={profilePhoto} alt="Foto profil" /> : <span>{session.username[0].toUpperCase()}</span>}</div><div><span className="mini-label">PROFILE PHOTO</span><p>Pilih foto baru untuk memperbarui tampilan akunmu.</p><div className="profile-photo-actions"><label className="button button-primary photo-upload"><Camera size={15} /> Ganti foto<input type="file" accept="image/*" onChange={handleProfilePhoto} /></label>{profilePhoto && <button type="button" className="button button-ghost" onClick={removeProfilePhoto}><Trash2 size={15} /> Hapus</button>}</div></div></div><span className="mini-label">SIGNED IN AS</span><h2>{session.username}</h2><p>{session.email}</p><div className="account-actions"><a className="button button-primary" href="history.html"><History size={16} /> View history</a><button type="button" className="button button-ghost" onClick={logout}>Logout</button></div></div><LoyaltyPanel accountId={session.accountId} notify={notify} /></section>;

  return <section className="container page-section"><Breadcrumbs current="Account" /><PageIntro eyebrow="PLAYER ACCOUNT" title={mode === 'login' ? 'WELCOME PLAYER' : 'JOIN THE STORE'} text={mode === 'login' ? 'Login untuk melihat history dan menghubungkan order ke akunmu.' : 'Buat akun untuk menyimpan history order dengan rapi.'} /><div className="account-layout"><form className="account-card panel" onSubmit={submit}><div className="panel-heading"><span>{mode === 'login' ? 'LOGIN' : 'CREATE NEW ACCOUNT'}</span><User size={17} /></div>{mode === 'register' ? <><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username kamu" autoComplete="username" required minLength="3" maxLength="24" pattern="[A-Za-z][A-Za-z0-9_.-]{2,23}" title="3–24 karakter, diawali huruf, tanpa spasi" /></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@gmail.com" autoComplete="email" required maxLength="254" /></label></> : <label>Email atau username<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Email atau username" autoComplete="username" required maxLength="254" /> </label>}<PasswordField label="Password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? 'Min. 8 karakter, huruf + angka' : 'Masukkan password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />{error && <p className="auth-error">{error}</p>}<button type="submit" className="button button-primary full" disabled={busy}>{busy ? 'Processing...' : mode === 'login' ? 'Login' : 'Create account'} <ArrowRight size={16} /></button><p className="tiny-note">Akunmu siap dipakai saat kamu kembali.</p></form><aside className="account-side panel"><span className="mini-label">PLAYER ACCESS</span><h2>{mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}</h2><p>{mode === 'login' ? 'Buat akun baru untuk mulai menyimpan history order per player.' : 'Login untuk melanjutkan ke akun dan order yang sudah tersimpan.'}</p><button type="button" className="button button-ghost" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create new account' : 'Login instead'}</button></aside></div></section>;
}

function LoyaltyPanel({ accountId, notify }) {
  const [summary, setSummary] = useState(() => getLoyaltySummary(accountId));
  const refresh = () => setSummary(getLoyaltySummary(accountId));
  useEffect(() => {
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [accountId]);

  const redeemCoupon = (coupon) => {
    if (summary.points < coupon.points) return notify(`Butuh ${coupon.points - summary.points} poin lagi untuk kupon ini.`);
    const code = `M8-${coupon.id}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const redemption = { id: `${accountId}-${Date.now()}`, accountId, code, couponId: coupon.id, label: coupon.label, discount: coupon.discount, points: coupon.points, minSpend: coupon.minSpend, createdAt: new Date().toISOString() };
    const redemptions = readStoredList(STORAGE_KEYS.loyaltyRedemptions);
    if (!writeStoredList(STORAGE_KEYS.loyaltyRedemptions, [redemption, ...redemptions])) return notify('Kupon gagal dibuat. Coba lagi.');
    refresh();
    notify(`Kupon ${redemption.code} berhasil ditukar.`);
  };

  const progress = summary.nextTier ? Math.min(100, Math.round(((summary.lifetimePoints - summary.currentTier.minPoints) / (summary.nextTier.minPoints - summary.currentTier.minPoints)) * 100)) : 100;
  return <section className="loyalty-panel panel"><div className="loyalty-head"><div><span className="mini-label">HARVEY REWARDS</span><h2>{summary.currentTier.name} TIER</h2><p>1 poin setiap transaksi Rp10.000. Poin dihitung dari total order yang berhasil.</p></div><div className="loyalty-points"><strong>{summary.points}</strong><span>POINTS</span></div></div><div className="loyalty-progress"><div><span>{summary.currentTier.name}</span><span>{summary.nextTier ? `${summary.nextTier.minPoints - summary.lifetimePoints} poin menuju ${summary.nextTier.name}` : 'Tier tertinggi tercapai'}</span></div><div className="loyalty-progress-track"><i style={{ width: `${progress}%` }} /></div></div><div className="loyalty-benefits"><span className="mini-label">TIER BENEFITS</span><div>{summary.currentTier.benefits.map((benefit) => <span key={benefit}><Check size={13} /> {benefit}</span>)}</div></div><div className="loyalty-coupons"><div className="panel-heading"><span>REDEEM COUPON</span><span>{summary.lifetimePoints} lifetime points</span></div><div className="coupon-grid">{loyaltyCoupons.map((coupon) => <article className="coupon-card" key={coupon.id}><b>{coupon.label}</b><span>{coupon.points} points</span><small>Min. order {formatRupiah(coupon.minSpend)}</small><button type="button" className="button button-primary" disabled={summary.points < coupon.points} onClick={() => redeemCoupon(coupon)}>{summary.points >= coupon.points ? 'Tukar poin' : `Kurang ${coupon.points - summary.points}`}</button></article>)}</div></div>{summary.redemptions.length > 0 && <div className="loyalty-issued"><span className="mini-label">YOUR COUPONS</span>{summary.redemptions.slice(0, 3).map((coupon) => <div key={coupon.id}><span><b>{coupon.code}</b><small>{coupon.label} · min. {formatRupiah(coupon.minSpend)}</small></span><button type="button" onClick={() => { navigator.clipboard?.writeText(coupon.code); notify('Kode kupon disalin.'); }}><Copy size={14} /></button></div>)}</div>}</section>;
}

function AdminPage({ notify }) {
  const [adminSession, setAdminSession] = useState(() => {
    const session = readStoredValue(STORAGE_KEYS.adminSession);
    return session?.token ? session : null;
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const login = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Username atau password admin salah.');
      const session = { username: payload.username || ADMIN_USERNAME, token: payload.token, signedInAt: new Date().toISOString() };
      if (!writeStoredValue(STORAGE_KEYS.adminSession, session)) throw new Error('Sesi admin tidak bisa dibuat.');
      setAdminSession(session);
    } catch (loginError) {
      setError(loginError.message || 'Server admin belum aktif. Jalankan npm run server.');
    }
  };

  const logout = () => {
    removeStoredValue(STORAGE_KEYS.adminSession);
    setAdminSession(null);
    notify('Admin sudah logout.');
  };

  if (!adminSession) return <section className="container page-section"><div className="admin-login panel"><div className="auth-required-icon"><ShieldCheck size={24} /></div><h1>ADMIN LOGIN</h1><p>Kelola katalog bersama. Perubahan akan dikirim ke semua halaman user yang sedang terbuka.</p><form onSubmit={login}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Username admin" required maxLength="32" /></label><PasswordField label="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Password admin" />{error && <p className="auth-error">{error}</p>}<button type="submit" className="button button-primary full">Masuk ke admin <ArrowRight size={16} /></button></form><p className="tiny-note">Demo server: admin / admin123</p></div></section>;
  return <AdminDashboardV2 notify={notify} logout={logout} />;
}

function AdminDashboard({ notify, logout }) {
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [gameForm, setGameForm] = useState({ title: '', category: 'Mobile', genre: '', publisher: '', playerLabel: 'Player ID', nominalLabel: '', price: '' });
  const [nominalForms, setNominalForms] = useState({});
  const availableGames = getAvailableGames();

  const updateGameField = (field, value) => setGameForm((current) => ({ ...current, [field]: value }));
  const addGame = async (event) => {
    event.preventDefault();
    const title = gameForm.title.trim();
    const id = slugify(title);
    const price = Number(gameForm.price);
    if (!title || !id || !gameForm.genre.trim() || !gameForm.publisher.trim() || !gameForm.nominalLabel.trim() || !price || price < 1) return notify('Lengkapi data game dan nominal dulu.');
    if (getAvailableGames().some((game) => game.id === id)) return notify('Game dengan nama itu sudah ada.');
    const game = {
      id,
      title,
      category: gameForm.category,
      categories: [gameForm.category],
      genre: gameForm.genre.trim(),
      publisher: gameForm.publisher.trim(),
      playerLabel: gameForm.playerLabel.trim() || 'Player ID',
      rating: 'NEW',
      badge: 'NEW',
      price,
      nominals: [{ label: gameForm.nominalLabel.trim(), price, hot: true }],
    };
    const customGames = readStoredList(STORAGE_KEYS.customGames);
    try {
      await adminApi('/api/admin/games', { method: 'POST', body: JSON.stringify(game) });
    } catch (saveError) {
      return notify(saveError.message || 'Game tidak bisa disimpan ke server.');
    }
    setGameForm({ title: '', category: 'Mobile', genre: '', publisher: '', playerLabel: 'Player ID', nominalLabel: '', price: '' });
    setCatalogVersion((value) => value + 1);
    notify(`${title} berhasil ditambahkan.`);
  };

  const updateNominalField = (gameId, field, value) => setNominalForms((current) => ({ ...current, [gameId]: { ...current[gameId], [field]: value } }));
  const addNominal = (event, game) => {
    event.preventDefault();
    const form = nominalForms[game.id] || {};
    const label = String(form.label || '').trim();
    const price = Number(form.price);
    if (!label || !price || price < 1) return notify('Isi nama nominal dan harga yang valid.');
    if (game.nominals.some((nominal) => nominal.label.toLowerCase() === label.toLowerCase())) return notify('Nominal itu sudah ada untuk game ini.');
    const overrides = readStoredValue(STORAGE_KEYS.nominalOverrides, {});
    const nextOverrides = { ...overrides, [game.id]: [...(overrides[game.id] || []), { label, price, hot: Boolean(form.hot) }] };
    if (!writeStoredValue(STORAGE_KEYS.nominalOverrides, nextOverrides)) return notify('Nominal gagal disimpan.');
    setNominalForms((current) => ({ ...current, [game.id]: { label: '', price: '', hot: false } }));
    setCatalogVersion((value) => value + 1);
    notify(`Nominal ${label} ditambahkan ke ${game.title}.`);
  };

  return <section className="container page-section admin-page"><div className="admin-page-head"><div><h1>ADMIN PANEL</h1><p>Kelola katalog Harvey Store secara langsung.</p></div><button type="button" className="button button-ghost" onClick={logout}>Logout admin</button></div><div className="admin-layout"><form className="admin-card panel" onSubmit={addGame}><div className="panel-heading"><span>ADD NEW GAME</span><Gamepad2 size={17} /></div><p className="admin-help">Game baru langsung muncul di halaman Top Up dan katalog.</p><label>Nama game<input value={gameForm.title} onChange={(event) => updateGameField('title', event.target.value)} placeholder="Contoh: Arena Breakout" /></label><div className="field-row"><label>Kategori<select value={gameForm.category} onChange={(event) => updateGameField('category', event.target.value)}>{categories.filter((item) => item !== 'All Games').map((item) => <option key={item}>{item}</option>)}</select></label><label>Label player<input value={gameForm.playerLabel} onChange={(event) => updateGameField('playerLabel', event.target.value)} placeholder="Player ID" /></label></div><label>Genre / currency<input value={gameForm.genre} onChange={(event) => updateGameField('genre', event.target.value)} placeholder="MOBA - Diamonds" /></label><label>Publisher<input value={gameForm.publisher} onChange={(event) => updateGameField('publisher', event.target.value)} placeholder="Nama publisher" /></label><div className="field-row"><label>Nominal awal<input value={gameForm.nominalLabel} onChange={(event) => updateGameField('nominalLabel', event.target.value)} placeholder="86 Diamonds" /></label><label>Harga awal<input type="number" min="1" value={gameForm.price} onChange={(event) => updateGameField('price', event.target.value)} placeholder="20000" /></label></div><button type="submit" className="button button-primary full">Simpan game <ArrowRight size={16} /></button></form><div className="admin-card panel"><div className="panel-heading"><span>CATALOG & NOMINALS</span><span>{availableGames.length} games</span></div><div className="admin-game-list" key={catalogVersion}>{availableGames.map((game) => { const form = nominalForms[game.id] || {}; return <article className="admin-game-row" key={game.id}><div className="admin-game-title"><div><h2>{game.title}</h2><p>{getGameCategories(game).join(' / ')} · {game.publisher}</p></div><span>{game.id}</span></div><div className="admin-nominal-list">{game.nominals.map((nominal) => <span key={nominal.label}>{nominal.label} · {formatRupiah(nominal.price)}{nominal.hot ? ' · HOT' : ''}</span>)}</div><form className="admin-nominal-form" onSubmit={(event) => addNominal(event, game)}><input value={form.label || ''} onChange={(event) => updateNominalField(game.id, 'label', event.target.value)} placeholder="Nominal baru" /><input type="number" min="1" value={form.price || ''} onChange={(event) => updateNominalField(game.id, 'price', event.target.value)} placeholder="Harga" /><label className="admin-hot"><input type="checkbox" checked={Boolean(form.hot)} onChange={(event) => updateNominalField(game.id, 'hot', event.target.checked)} /> HOT</label><button type="submit" className="button button-primary">Tambah</button></form></article>; })}</div></div></div></section>;
}

function AdminDashboardV2({ notify, logout }) {
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [gameForm, setGameForm] = useState({ title: '', category: 'Mobile', genre: '', publisher: '', playerLabel: 'Player ID', nominalLabel: '', price: '', image: '' });
  const [nominalForms, setNominalForms] = useState({});
  const [editForms, setEditForms] = useState({});
  const hiddenGames = readStoredList(STORAGE_KEYS.hiddenGames);
  const allGames = getCatalogGames();
  const availableGames = allGames.filter((game) => !hiddenGames.includes(game.id));

  const updateGameField = (field, value) => setGameForm((current) => ({ ...current, [field]: value }));
  const handleNewGameImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('Pilih file gambar ya.');
    if (file.size > 8 * 1024 * 1024) return notify('Ukuran gambar maksimal 8 MB.');
    try {
      updateGameField('image', await compressImage(file, 960, 540, 0.78, 'contain'));
      notify('Foto game siap disimpan.');
    } catch (imageError) {
      notify(imageError.message || 'Foto game gagal diproses.');
    }
  };

  const addGame = async (event) => {
    event.preventDefault();
    const title = gameForm.title.trim();
    const id = slugify(title);
    const price = Number(gameForm.price);
    if (!title || !id || !gameForm.genre.trim() || !gameForm.publisher.trim() || !gameForm.nominalLabel.trim() || !price || price < 1) return notify('Lengkapi data game dan nominal dulu.');
    if (getCatalogGames().some((game) => game.id === id)) return notify('Game dengan nama itu sudah ada.');
    const game = {
      id,
      title,
      category: gameForm.category,
      categories: [gameForm.category],
      genre: gameForm.genre.trim(),
      publisher: gameForm.publisher.trim(),
      playerLabel: gameForm.playerLabel.trim() || 'Player ID',
      rating: 'NEW',
      badge: 'NEW',
      price,
      image: gameForm.image || '',
      nominals: [{ label: gameForm.nominalLabel.trim(), price, hot: true }],
    };
    try {
      await adminApi('/api/admin/games', { method: 'POST', body: JSON.stringify(game) });
    } catch (saveError) {
      return notify(saveError.message || 'Game tidak bisa disimpan ke server.');
    }
    setGameForm({ title: '', category: 'Mobile', genre: '', publisher: '', playerLabel: 'Player ID', nominalLabel: '', price: '', image: '' });
    setCatalogVersion((value) => value + 1);
    notify(`${title} berhasil ditambahkan.`);
  };

  const getEditForm = (game) => ({
    title: game.title,
    category: game.category,
    genre: game.genre,
    publisher: game.publisher,
    playerLabel: getPlayerLabel(game),
    image: game.image || '',
    ...(editForms[game.id] || {}),
  });
  const updateEditField = (gameId, field, value) => setEditForms((current) => ({ ...current, [gameId]: { ...current[gameId], [field]: value } }));
  const handleExistingGameImage = async (event, game) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('Pilih file gambar ya.');
    if (file.size > 8 * 1024 * 1024) return notify('Ukuran gambar maksimal 8 MB.');
    try {
      updateEditField(game.id, 'image', await compressImage(file, 960, 540, 0.78, 'contain'));
      notify(`Foto ${game.title} siap disimpan.`);
    } catch (imageError) {
      notify(imageError.message || 'Foto game gagal diproses.');
    }
  };
  const saveGameEdit = async (event, game) => {
    event.preventDefault();
    const form = getEditForm(game);
    const title = String(form.title || '').trim();
    if (!title || !String(form.genre || '').trim() || !String(form.publisher || '').trim()) return notify('Nama, genre, dan publisher wajib diisi.');
    try {
      const changes = { title, category: form.category, categories: [form.category], genre: String(form.genre).trim(), publisher: String(form.publisher).trim(), playerLabel: String(form.playerLabel || '').trim() || 'Player ID' };
      if (form.image) changes.image = form.image;
      await adminApi(`/api/admin/games/${encodeURIComponent(game.id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
    } catch (saveError) {
      return notify(saveError.message || 'Perubahan game tidak bisa disimpan ke server.');
    }
    setEditForms((current) => ({ ...current, [game.id]: undefined }));
    setCatalogVersion((value) => value + 1);
    notify(`${title} berhasil diperbarui.`);
  };
  const toggleGameVisibility = async (game) => {
    try {
      await adminApi(`/api/admin/games/${encodeURIComponent(game.id)}`, { method: 'PATCH', body: JSON.stringify({ hidden: !hiddenGames.includes(game.id) }) });
    } catch (saveError) {
      return notify(saveError.message || 'Status game tidak bisa disimpan ke server.');
    }
    setCatalogVersion((value) => value + 1);
    notify(hiddenGames.includes(game.id) ? `${game.title} dipulihkan.` : `${game.title} dihapus dari katalog.`);
  };
  const updateNominalField = (gameId, field, value) => setNominalForms((current) => ({ ...current, [gameId]: { ...current[gameId], [field]: value } }));
  const addNominal = async (event, game) => {
    event.preventDefault();
    const form = nominalForms[game.id] || {};
    const label = String(form.label || '').trim();
    const price = Number(form.price);
    if (!label || !price || price < 1) return notify('Isi nama nominal dan harga yang valid.');
    if (game.nominals.some((nominal) => nominal.label.toLowerCase() === label.toLowerCase())) return notify('Nominal itu sudah ada untuk game ini.');
    try {
      await adminApi(`/api/admin/games/${encodeURIComponent(game.id)}/nominals`, { method: 'POST', body: JSON.stringify({ label, price, hot: Boolean(form.hot) }) });
    } catch (saveError) {
      return notify(saveError.message || 'Nominal tidak bisa disimpan ke server.');
    }
    setNominalForms((current) => ({ ...current, [game.id]: { label: '', price: '', hot: false } }));
    setCatalogVersion((value) => value + 1);
    notify(`Nominal ${label} ditambahkan ke ${game.title}.`);
  };

  return <section className="container page-section admin-page"><div className="admin-page-head"><div><h1>ADMIN PANEL</h1><p>Kelola game, artwork, dan nominal Harvey Store secara langsung.</p></div><button type="button" className="button button-ghost" onClick={logout}>Logout admin</button></div><div className="admin-layout"><form className="admin-card panel" onSubmit={addGame}><div className="panel-heading"><span>ADD NEW GAME</span><Gamepad2 size={17} /></div><p className="admin-help">Game, foto, dan nominal baru langsung muncul di halaman Top Up dan katalog.</p><label>Nama game<input value={gameForm.title} onChange={(event) => updateGameField('title', event.target.value)} placeholder="Contoh: Arena Breakout" /></label><div className="field-row"><label>Kategori<select value={gameForm.category} onChange={(event) => updateGameField('category', event.target.value)}>{categories.filter((item) => item !== 'All Games').map((item) => <option key={item}>{item}</option>)}</select></label><label>Label player<input value={gameForm.playerLabel} onChange={(event) => updateGameField('playerLabel', event.target.value)} placeholder="Player ID" /></label></div><label>Genre / currency<input value={gameForm.genre} onChange={(event) => updateGameField('genre', event.target.value)} placeholder="MOBA - Diamonds" /></label><label>Publisher<input value={gameForm.publisher} onChange={(event) => updateGameField('publisher', event.target.value)} placeholder="Nama publisher" /></label><div className="field-row"><label>Nominal awal<input value={gameForm.nominalLabel} onChange={(event) => updateGameField('nominalLabel', event.target.value)} placeholder="86 Diamonds" /></label><label>Harga awal<input type="number" min="1" value={gameForm.price} onChange={(event) => updateGameField('price', event.target.value)} placeholder="20000" /></label></div><label>Foto tampilan game<input type="file" accept="image/*" onChange={handleNewGameImage} /></label>{gameForm.image && <img className="admin-image-preview" src={gameForm.image} alt="Preview foto game baru" />}<button type="submit" className="button button-primary full">Simpan game <ArrowRight size={16} /></button></form><div className="admin-card panel"><div className="panel-heading"><span>CATALOG & NOMINALS</span><span>{availableGames.length} aktif / {allGames.length} total</span></div><div className="admin-game-list" key={catalogVersion}>{allGames.map((game) => { const form = nominalForms[game.id] || {}; const edit = getEditForm(game); const isHidden = hiddenGames.includes(game.id); return <article className={`admin-game-row ${isHidden ? 'is-hidden' : ''}`} key={game.id}><div className="admin-game-title"><div><h2>{edit.title}</h2><p>{getGameCategories(game).join(' / ')} · {edit.publisher}</p></div><span>{isHidden ? 'HIDDEN' : 'LIVE'}</span></div><div className="admin-game-art-row">{edit.image ? <img className="admin-game-preview" src={edit.image} alt={`${edit.title} artwork`} /> : <div className="admin-game-preview empty">NO ART</div>}<div className="admin-game-actions"><button type="button" className="button button-ghost" onClick={() => toggleGameVisibility(game)}>{isHidden ? 'Pulihkan' : 'Hapus dari katalog'}</button></div></div><form className="admin-edit-form" onSubmit={(event) => saveGameEdit(event, game)}><div className="field-row"><label>Nama<input value={edit.title} onChange={(event) => updateEditField(game.id, 'title', event.target.value)} /></label><label>Kategori<select value={edit.category} onChange={(event) => updateEditField(game.id, 'category', event.target.value)}>{categories.filter((item) => item !== 'All Games').map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="field-row"><label>Genre<input value={edit.genre} onChange={(event) => updateEditField(game.id, 'genre', event.target.value)} /></label><label>Publisher<input value={edit.publisher} onChange={(event) => updateEditField(game.id, 'publisher', event.target.value)} /></label></div><label>Label player<input value={edit.playerLabel} onChange={(event) => updateEditField(game.id, 'playerLabel', event.target.value)} /></label><label>Ganti foto tampilan<input type="file" accept="image/*" onChange={(event) => handleExistingGameImage(event, game)} /></label><button type="submit" className="button button-primary">Simpan perubahan</button></form><div className="admin-nominal-list">{game.nominals.map((nominal) => <span key={nominal.label}>{nominal.label} · {formatRupiah(nominal.price)}{nominal.hot ? ' · HOT' : ''}</span>)}</div><form className="admin-nominal-form" onSubmit={(event) => addNominal(event, game)}><input value={form.label || ''} onChange={(event) => updateNominalField(game.id, 'label', event.target.value)} placeholder="Nominal baru" /><input type="number" min="1" value={form.price || ''} onChange={(event) => updateNominalField(game.id, 'price', event.target.value)} placeholder="Harga" /><label className="admin-hot"><input type="checkbox" checked={Boolean(form.hot)} onChange={(event) => updateNominalField(game.id, 'hot', event.target.checked)} /> HOT</label><button type="submit" className="button button-primary">Tambah</button></form></article>; })}</div></div></div></section>;
}

function RatingsPage({ notify }) {
  const session = readStoredValue(STORAGE_KEYS.session);
  const [orders] = useState(() => readStoredList(STORAGE_KEYS.orders));
  const [ratings, setRatings] = useState(() => readStoredList(STORAGE_KEYS.ratings));
  const accountOrders = orders.filter((order) => order.accountId === session?.accountId && order.status === 'Paid');
  const requestedOrderId = new URLSearchParams(window.location.search).get('order');
  useEffect(() => {
    if (!requestedOrderId) return;
    const timer = window.setTimeout(() => document.getElementById(`rating-${requestedOrderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return () => window.clearTimeout(timer);
  }, [requestedOrderId]);
  const submitRating = (order, stars, text) => {
    const nextRating = { id: order.id, orderId: order.id, accountId: session.accountId, game: order.game, nominal: order.nominal, stars, text: text.trim(), createdAt: new Date().toISOString() };
    const nextRatings = [nextRating, ...ratings.filter((rating) => rating.orderId !== order.id)];
    if (!writeStoredList(STORAGE_KEYS.ratings, nextRatings)) return notify('Rating gagal disimpan.');
    setRatings(nextRatings);
    notify('Rating transaksi berhasil disimpan. Makasih, player!');
  };
  if (!session) return <AuthRequired title="Login untuk memberi rating" text="Rating hanya bisa diberikan oleh player yang punya transaksi berhasil." returnTo="ratings.html" />;
  return <section className="container page-section"><Breadcrumbs current="Player Ratings" /><PageIntro title="THE ARCADE WALL" text="Beri rating berdasarkan transaksi yang benar-benar sudah kamu selesaikan." /><div className="ratings-top"><div className="rating-score panel"><span className="score">4.9</span><Stars /><span className="muted">verified player ratings</span></div><div className="rating-bars panel">{[['5', 92], ['4', 6], ['3', 1], ['2', 1], ['1', 0]].map(([label, value]) => <div className="bar-row" key={label}><span>{label}</span><div><i style={{ width: `${value}%` }} /></div><b>{value}%</b></div>)}</div></div><section className="transaction-rating-section panel"><div className="panel-heading"><span>RATE YOUR TRANSACTIONS</span><BadgeCheck size={17} /></div><p className="muted">Satu transaksi hanya bisa diberi satu rating. Kalau belum pernah top up, form rating belum tersedia.</p>{accountOrders.length ? <div className="transaction-rating-list">{accountOrders.map((order) => <TransactionRatingCard key={order.id} order={order} existing={ratings.find((rating) => rating.orderId === order.id)} onSubmit={submitRating} highlighted={requestedOrderId === order.id} />)}</div> : <div className="rating-empty"><Ticket size={24} /><h3>Belum ada transaksi selesai</h3><p>Selesaikan top up pertamamu dulu untuk membuka rating per transaksi.</p><a className="button button-secondary" href="topup.html">Mulai top up <ArrowRight size={16} /></a></div>}</section><section className="review-layout"><div className="review-list">{reviews.map((review) => <ReviewCard key={review.name} review={review} />)}</div></section></section>;
}

function TransactionRatingCard({ order, existing, onSubmit, highlighted }) {
  const [stars, setStars] = useState(existing?.stars || 5);
  const [text, setText] = useState(existing?.text || '');
  if (existing) return <article id={`rating-${order.id}`} className={`transaction-rating-card is-rated ${highlighted ? 'is-highlighted' : ''}`}><div><b>{order.game}</b><span>{order.nominal} · {order.date} · {order.id}</span></div><div className="rating-picker is-static">{[1,2,3,4,5].map((item) => <Star key={item} fill={item <= existing.stars ? 'currentColor' : 'none'} />)}</div>{existing.text && <p>“{existing.text}”</p>}<small><Check size={13} /> Sudah diberi rating</small></article>;
  return <form id={`rating-${order.id}`} className={`transaction-rating-card ${highlighted ? 'is-highlighted' : ''}`} onSubmit={(event) => { event.preventDefault(); onSubmit(order, stars, text); }}><div className="transaction-rating-head"><div><b>{order.game}</b><span>{order.nominal} · {order.date} · {order.id}</span></div><strong>{formatRupiah(order.price)}</strong></div><div className="rating-picker">{[1,2,3,4,5].map((item) => <button type="button" key={item} className={item <= stars ? 'active' : ''} onClick={() => setStars(item)} aria-label={`${item} bintang`}><Star fill="currentColor" /></button>)}</div><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Komentar singkat (opsional)" /><button type="submit" className="button button-primary">Kirim rating <ArrowRight size={15} /></button></form>;
}
const reviews = [{ name: 'Raka', avatar: '/avatars/raka.svg', text: 'Prosesnya cepat banget, baru refresh game item sudah masuk. UI-nya juga beda dari top up store biasa.', game: 'Mobile Legends', date: '2 jam lalu' }, { name: 'Naya', avatar: '/avatars/naya.svg', text: 'Suka sama pilihan pembayaran dan notif statusnya. Harga VALORANT Points juga sering ada drop.', game: 'VALORANT', date: 'Kemarin' }, { name: 'Dion', avatar: '/avatars/dion.svg', text: 'Sudah beberapa kali repeat order di sini, support-nya responsif dan checkout sangat straightforward.', game: 'Genshin Impact', date: '3 hari lalu' }];
function ReviewCard({ review }) { return <article className="review-card panel"><div className="review-avatar"><img src={review.avatar} alt={`Avatar ${review.name}`} loading="lazy" /></div><div className="review-body"><div className="review-head"><div><b>{review.name}</b><span className="stars small"><Stars /></span></div><time>{review.date}</time></div><p>“{review.text}”</p><div className="review-tag"><BadgeCheck size={13} /> verified purchase · {review.game}</div></div></article>; }

function HistoryPage({ notify }) {
  const session = readStoredValue(STORAGE_KEYS.session);
  const [orders] = useState(() => readStoredList(STORAGE_KEYS.orders));
  const [query, setQuery] = useState('');
  if (!session) return <AuthRequired title="Login untuk melihat history" text="Buat akun atau login dulu supaya riwayat order kamu tersimpan terpisah dan tetap privat." returnTo="history.html" />;
  const accountOrders = orders.filter((order) => order.accountId === session.accountId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOrders = accountOrders.filter((order) => [order.id, order.game, order.nominal, order.userId, order.server, order.paymentMethod].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)));
  const copyId = (id) => { navigator.clipboard?.writeText(id); notify('Order ID disalin.'); };
  return <section className="container page-section"><Breadcrumbs current="Order History" /><PageIntro eyebrow="PLAYER LOG" title="YOUR ORDER HISTORY" text="Lihat kembali semua transaksi dan beri rating setelah order selesai." action={<a className="button button-primary" href="topup.html">New top up <Zap size={16} /></a>} /><div className="history-panel panel"><div className="history-head"><span>{filteredOrders.length} dari {accountOrders.length} total orders</span><label className="search-box compact"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order..." aria-label="Cari transaksi" /></label></div>{filteredOrders.length > 0 ? <div className="order-list">{filteredOrders.map((order) => <div className="order-row" key={order.id}><div className="order-icon"><Gamepad2 size={18} /></div><div className="order-main"><b>{order.game}</b><span>{order.nominal} · {order.date}</span><small className="order-player">{order.playerLabel || 'Player ID'}: {order.userId || '-'}{order.server ? ` · ${order.server}` : ''}</small></div><div className="order-id"><span>{order.id}</span><button type="button" onClick={() => copyId(order.id)} aria-label="Copy order ID"><Copy size={13} /></button></div><strong>{formatRupiah(order.price)}</strong><span className="order-status"><Check size={13} /> {order.status}</span><a className="row-arrow" href={order.status === 'Paid' ? `ratings.html?order=${encodeURIComponent(order.id)}` : 'ratings.html'} aria-label="Beri rating transaksi"><ArrowRight size={16} /></a></div>)}</div> : <div className="history-empty"><History size={25} /><h3>{accountOrders.length ? 'Transaksi tidak ditemukan' : 'Belum ada transaksi'}</h3><p>{accountOrders.length ? 'Coba cari dengan game, order ID, atau username / UID.' : 'Transaksi yang berhasil dibayar akan muncul di sini.'}</p>{!accountOrders.length && <a className="button button-secondary" href="topup.html">Mulai top up <ArrowRight size={16} /></a>}</div>}</div></section>;
}

function NewsPage() {
  const selectedSlug = new URLSearchParams(window.location.search).get('article');
  const selectedArticle = newsArticles.find((article) => article.slug === selectedSlug);
  if (selectedArticle) return <NewsDetail article={selectedArticle} />;
  return <section className="container page-section"><Breadcrumbs current="Arcade News" /><PageIntro eyebrow="ARCADE BULLETIN" title="NEWS & DROP" text="Tips, update, dan kabar terbaru dari dunia game kamu." /><div className="news-grid">{newsArticles.map((article) => <article className="news-card" key={article.slug}><div className="news-image has-image"><img src={article.image} alt="" loading="lazy" /><span>{article.tag}</span></div><div className="news-copy"><h2>{article.title}</h2><p>{article.desc}</p><a className="text-link" href={`news.html?article=${article.slug}`}>Baca selengkapnya <ArrowRight size={14} /></a></div></article>)}</div></section>;
}

function NewsDetail({ article }) {
  return <section className="container page-section"><Breadcrumbs current="News Detail" /><article className="news-detail panel"><div className="news-detail-top"><span className="mini-label">{article.tag} · {article.date}</span><span className="muted">{article.source}</span></div><h1>{article.title}</h1><p className="news-detail-lead">{article.lead}</p><div className="news-detail-body">{article.sections.map(([heading, body]) => <section className="news-story-section" key={heading}><h2>{heading}</h2><p>{body}</p></section>)}</div><p className="news-attribution">Ditulis dan dirangkum oleh Harvey Store untuk komunitas player.</p><div className="news-detail-actions"><a className="button button-secondary" href="news.html">Kembali ke news</a></div></article></section>;
}

function Summary({ price, fee, discount = 0, label = 'Total' }) { return <div className="summary-lines"><div><span>Subtotal</span><b>{formatRupiah(price)}</b></div><div><span>Platform fee</span><b>{formatRupiah(fee)}</b></div>{discount > 0 && <div><span>Coupon discount</span><b className="discount-value">-{formatRupiah(discount)}</b></div>}<div className="total"><span>{label}</span><b>{formatRupiah(price + fee - discount)}</b></div></div>; }
function Stars() { return <span className="stars"><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /><Star fill="currentColor" /></span>; }
function Breadcrumbs({ current }) { return <nav className="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Arcade</a><span>/</span><span aria-current="page">{current}</span></nav>; }
function GamePicker({ selectedGameId, onSelect }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All Games');
  const filteredGames = getAvailableGames().filter((game) => game.title.toLowerCase().includes(query.toLowerCase()) && (category === 'All Games' || getGameCategories(game).includes(category)));
  return <div className="game-picker panel" id="game-picker"><div className="game-picker-head"><div><span className="mini-label">GAME SELECT</span><h2>Pilih game</h2></div><label className="game-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari game..." aria-label="Cari game" /></label></div><div className="game-filters">{categories.map((item) => <button type="button" key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="game-picker-grid">{filteredGames.map((item) => <button type="button" key={item.id} className={`game-picker-card thumb-${item.id} ${selectedGameId === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)}><span className={`picker-art thumb-${item.id}`} style={getGameThemeStyle(item)}>{item.image ? <img src={item.image} alt="" /> : <span className="picker-art-placeholder">{getGameMonogram(item)}</span>}</span><span className="picker-copy"><b>{item.title}</b><small>{getGameCategories(item).join(' / ')}</small></span></button>)}</div>{filteredGames.length === 0 && <p className="picker-empty">Game tidak ditemukan.</p>}</div>;
}
function GameThumb({ game }) { return <div className={`game-thumb thumb-${game.category.toLowerCase()} thumb-${game.id}`} style={getGameThemeStyle(game)} aria-label={`${game.title} art slot`}>{game.image ? <img src={game.image} alt={game.title} /> : <span className="game-thumb-placeholder">{getGameMonogram(game)}</span>}</div>; }
function PageIntro({ title, text, action }) { return <div className="page-intro"><div><h1>{title}</h1><p>{text}</p></div>{action}</div>; }
function SectionHeading({ title, action }) { return <div className="section-heading"><div><h2>{title}</h2></div>{action}</div>; }
function FormStep({ number, title, children }) { return <div className="form-step"><div className="step-heading"><span>{number}</span><h3>{title}</h3></div>{children}</div>; }
function Feature({ icon: Icon, title, text }) { return <div className="feature-item"><div className="feature-icon"><Icon size={19} /></div><h3>{title}</h3><p>{text}</p></div>; }
function NewsMini({ tag, image, title, slug }) { return <article className="news-mini"><div className={`news-mini-art ${image ? 'has-image' : ''}`}>{image ? <img src={image} alt="" loading="lazy" /> : <b>{tag}</b>}</div><div><span>{tag}</span><h3>{title}</h3><a href={`news.html?article=${slug}`} className="text-link">Baca selengkapnya <ArrowRight size={13} /></a></div></article>; }
function EmptyState({ title, text }) { return <div className="empty-state panel"><Search size={22} /><h3>{title}</h3><p>{text}</p></div>; }
function NotFoundPage() { return <section className="container page-section"><Breadcrumbs current="404" /><div className="success-card panel not-found-card"><h1>404<br /><span>GAME OVER.</span></h1><p>Halaman yang kamu cari tidak ada di map ini. Kembali ke arcade untuk melanjutkan permainan.</p><a className="button button-primary" href="index.html">Back to arcade <ArrowRight size={16} /></a></div></section>; }
function Footer() { return <footer className="footer"><div className="container footer-inner"><div className="brand footer-brand"><span className="brand-mark"><Gamepad2 size={23} /></span><span className="brand-name"><b>HARVEY</b><i>STORE</i></span></div><p>Fair prices. Fast delivery. More play.</p><div className="footer-links"><a href="index.html">Arcade</a><a href="news.html">News</a><a href="ratings.html">Reviews</a><a href="admin.html">Admin</a><a href="mailto:hello@mbr8arcade.com">Support</a></div><span className="copyright">© 2026 Harvey Store / PLAYER FIRST</span></div></footer>; }

createRoot(document.getElementById('root')).render(<App />);
