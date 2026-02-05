# A Generator

- **Stack**: Vite + React + TypeScript, MapLibre GL JS, Express + Puppeteer (PDF), html2canvas + jsPDF fallback
- **Default provider**: Open stack (OSM + MapTiler raster) with Nominatim geocoding

## Quick start

1. Copy `.env.example` to `.env` and edit if needed.
2. Install deps: `npm install`
3. Run dev (client + server): `npm run dev`
4. Open http://localhost:5173

## Environment

- `VITE_PROVIDER` = `open` | `mapbox` | `google` | `bing`
- Optional keys for providers
- `SERVER_BASE_URL` for PDF export endpoint

## PDF Export

- Prefers server `/export` (Puppeteer) for crisp text
- Falls back to client capture if server is unavailable

## License & Attribution

- Uses OpenStreetMap and compatible tile providers by default. Ensure attribution appears in footer of exports.
