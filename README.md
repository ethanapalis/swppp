# SWPPP Appendix A Map Generator

- **Stack**: Vite + React + TypeScript, MapLibre GL JS, Express + Puppeteer (PDF), html2canvas + jsPDF fallback
- **Default provider**: Open stack (OSM + MapTiler raster) with Nominatim geocoding
- **Purpose**: Speed up SWPPP Appendix A creation

## PDF Export

- Prefers server `/export` (Puppeteer) for crisp text
- Falls back to client capture if server is unavailable

## License & Attribution

- Uses OpenStreetMap, Maxbox, and compatible tile providers by default. Ensure attribution appears in footer of exports.
