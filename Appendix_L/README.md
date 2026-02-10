# SWPPP Appendix L PDF Generator

This is a separate Vite + React app scaffolded alongside the existing Appendix A generator.

## Development

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5183
- Server (PDF export): http://localhost:3002

## Environment variables

Create `appendix-l/.env` (do not commit) if you want geocoding:

- `VITE_GEOCODIO_KEY=...` (recommended) OR
- `VITE_MAPBOX_TOKEN=...`

If using Cloudflare Turnstile (optional):

- `VITE_TURNSTILE_SITE_KEY=...`
- `TURNSTILE_SECRET_KEY=...` (server-only)
