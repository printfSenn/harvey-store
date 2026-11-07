# Harvey Store

Harvey Store is a retro-styled game top-up storefront built with React and Vite.

## Features

- Game catalog with empty artwork placeholders when no image is configured
- Top-up flow, checkout, payment, order history, ratings, account, and admin pages
- Local catalog data in `data/catalog.json`
- Optional Node server for the API-backed experience

## Getting started

```bash
npm install
npm run dev
```

For the server-backed experience:

```bash
npm run server
```

## Available scripts

- `npm run dev` — start the Vite development server
- `npm run build` — create a production build in `dist/`
- `npm run preview` — preview the production build
- `npm run server` — start the Node server

## Project structure

- `src/` — React application and styles
- `data/catalog.json` — game catalog and nominal data
- `public/` — static assets
- `server.mjs` — Node server and API routes

## Notes

Game artwork is optional. When a catalog item has an empty `image` value, the UI renders its built-in placeholder artwork instead of a broken image.
