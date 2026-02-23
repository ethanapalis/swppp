import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import puppeteer, { type Browser } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = Number(process.env.PORT) || 3002;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '6mb' }));

let sharedBrowser: Browser | null = null;
async function getBrowser() {
  if (sharedBrowser) return sharedBrowser;
  sharedBrowser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return sharedBrowser;
}

type CacheValue = {
  ts: number;
  data: any;
};
const cache = new Map<string, CacheValue>();
const CACHE_TTL_MS = 10 * 60 * 1000;

type ArcGisServiceInfo = {
  baseUrl: string;
  layerId: number;
  valueField?: string;
};

const serviceCache = new Map<string, ArcGisServiceInfo>();

const portalBase = 'https://gispublic.waterboards.ca.gov/portal';

async function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : (e?.message || String(e));
    throw new Error(`fetch failed url=${url} detail=${msg}`);
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url: string) {
  const res = await fetchWithTimeout(url, undefined, 15_000);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  try {
    return await res.json();
  } catch (e: any) {
    throw new Error(`failed to parse json for ${url}: ${e?.message || String(e)}`);
  }
}

function toWebMercator(pt: { lat: number; lng: number }) {
  // EPSG:3857 spherical mercator
  const x = (pt.lng * 20037508.34) / 180;
  const y = Math.log(Math.tan(((90 + pt.lat) * Math.PI) / 360)) / (Math.PI / 180);
  return { x: (y * 20037508.34) / 180, y: (x * 0) };
}

function lngLatToWebMercator(pt: { lat: number; lng: number }) {
  const x = (pt.lng * 20037508.34) / 180;
  const y = Math.log(Math.tan(((90 + pt.lat) * Math.PI) / 360)) / (Math.PI / 180);
  const yMeters = (y * 20037508.34) / 180;
  return { x, y: yMeters };
}

function webMercatorToLngLat(m: { x: number; y: number }) {
  const lng = (m.x / 20037508.34) * 180;
  let lat = (m.y / 20037508.34) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return { lat, lng };
}

function parseLatLngText(v: string): { lat: number; lng: number } | null {
  const m = v.trim().match(/^\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function withNoTrailingSlash(u: string) {
  return u.endsWith('/') ? u.slice(0, -1) : u;
}

function normalizeServiceUrlAndLayerId(url: string, fallbackLayerId: number) {
  const cleaned = withNoTrailingSlash(String(url));
  const m = cleaned.match(/^(.*\/MapServer|.*\/FeatureServer)\/(\d+)$/i);
  if (m) {
    return { baseUrl: m[1], layerId: Number(m[2]) };
  }
  return { baseUrl: cleaned, layerId: fallbackLayerId };
}

async function resolveServiceFromWebAppItem(itemId: string, factorKey: 'LS' | 'K'): Promise<ArcGisServiceInfo> {
  const cached = serviceCache.get(itemId);
  if (cached) return cached;

  const itemUrl = `${portalBase}/sharing/rest/content/items/${itemId}?f=json`;
  // Many Web AppBuilder items reference a web map; try to discover it.
  const dataUrl = `${portalBase}/sharing/rest/content/items/${itemId}/data?f=json`;
  const [item, data] = await Promise.all([
    fetchJson(itemUrl),
    fetchJson(dataUrl),
  ]);

  const webmapItemId: string | undefined =
    data?.values?.webmap ||
    data?.webmap ||
    data?.map?.itemId ||
    item?.properties?.webmap ||
    undefined;

  if (!webmapItemId) {
    throw new Error(`Could not resolve webmap for ${factorKey} item ${itemId}`);
  }

  const webmapDataUrl = `${portalBase}/sharing/rest/content/items/${webmapItemId}/data?f=json`;
  const webmapData = await fetchJson(webmapDataUrl);
  const ops: any[] = Array.isArray(webmapData?.operationalLayers) ? webmapData.operationalLayers : [];

  // Pick the first operational layer with a url to a MapServer/FeatureServer
  const op = ops.find(l => typeof l?.url === 'string' && /\/MapServer\b|\/FeatureServer\b/i.test(l.url));
  if (!op?.url) {
    throw new Error(`Could not find operational layer url for ${factorKey} webmap ${webmapItemId}`);
  }

  // Determine a layer id. Prefer explicit sublayer ids from the webmap, then op.layerId, else 0.
  const webmapLayerId = Number.isFinite(Number(op?.layers?.[0]?.id)) ? Number(op.layers[0].id) : undefined;
  const opLayerId = Number.isFinite(Number(op?.layerId)) ? Number(op.layerId) : undefined;
  const fallbackLayerId = webmapLayerId ?? opLayerId ?? 0;

  const norm = normalizeServiceUrlAndLayerId(String(op.url), fallbackLayerId);
  const resolved = { baseUrl: norm.baseUrl, layerId: norm.layerId };
  serviceCache.set(itemId, resolved);
  return resolved;
}

async function queryValueAtPoint(service: ArcGisServiceInfo, factorKey: 'LS' | 'K', pt: { lat: number; lng: number }) {
  const layerUrl = `${service.baseUrl}/${service.layerId}/query`;
  const u = new URL(layerUrl);
  u.searchParams.set('f', 'json');
  u.searchParams.set('where', '1=1');
  u.searchParams.set('geometry', `${pt.lng},${pt.lat}`);
  u.searchParams.set('geometryType', 'esriGeometryPoint');
  u.searchParams.set('inSR', '4326');
  u.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  u.searchParams.set('outFields', '*');
  u.searchParams.set('returnGeometry', 'false');
  u.searchParams.set('resultRecordCount', '1');

  const json = await fetchJson(u.toString());
  const feat = Array.isArray(json?.features) ? json.features[0] : null;
  const attrs = feat?.attributes && typeof feat.attributes === 'object' ? feat.attributes : null;
  if (!attrs) {
    return { value: '', valueField: '', popupText: 'No features returned for point.', screenshotBase64: '' };
  }

  // Some of these services encode the LS/K value in a display field like "Name" (e.g. "0.37")
  // and only include an OID as the numeric identifier.
  const nameVal = (attrs as any)?.Name;
  if (typeof nameVal === 'string' && nameVal.trim() !== '' && Number.isFinite(Number(nameVal))) {
    const popupText = JSON.stringify(attrs, null, 2);
    return { value: nameVal.trim(), valueField: 'Name', popupText, screenshotBase64: '' };
  }
  const folderPathVal = (attrs as any)?.FolderPath;
  if (typeof folderPathVal === 'string' && folderPathVal.trim() !== '') {
    const m = folderPathVal.trim().match(/\/([-+]?\d+(?:\.\d+)?)\s*$/);
    if (m && Number.isFinite(Number(m[1]))) {
      const popupText = JSON.stringify(attrs, null, 2);
      return { value: m[1], valueField: 'FolderPath', popupText, screenshotBase64: '' };
    }
  }

  // Try to pick a numeric field that looks like LS/K (avoid OID/ObjectID/FID)
  const keys = Object.keys(attrs);
  const isOidLike = (k: string) => /(^|_)(objectid|oid|fid)(_|$)|objectid|globalid|shape__?(len|area)|shape_length|shape_area/i.test(k);
  const numericCandidates = keys
    .filter(k => !isOidLike(k))
    .map(k => ({ k, v: attrs[k] }))
    .filter(x => typeof x.v === 'number' || (typeof x.v === 'string' && x.v.trim() !== '' && !Number.isNaN(Number(x.v))));

  const preferPatterns: RegExp[] = factorKey === 'K'
    ? [
        /soil\s*erodibility\s*\(\s*k\s*\)\s*value/i,
        /soil\s*erodibility/i,
        /soil.*erod/i,
        /\bK\b/i,
        /\(\s*K\s*\)/i,
        /erod/i,
      ]
    : [
        /linear\s*slope\s*\(\s*ls\s*\)\s*factor/i,
        /linear\s*slope/i,
        /linear.*slope/i,
        /\bLS\b/i,
        /slope.*factor/i,
        /\(\s*LS\s*\)/i,
      ];

  const score = (k: string, v: any) => {
    let s = 50;
    for (let i = 0; i < preferPatterns.length; i++) {
      if (preferPatterns[i].test(k)) { s = Math.min(s, i); break; }
    }
    if (/\bid\b/i.test(k) || /_?id$/i.test(k)) s += 500;
    if (isOidLike(k)) s += 1000;

    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (Number.isFinite(n)) {
      // LS/K typically are decimals < 1.0 (often ~0.3). Strongly prefer those.
      if (n >= 0 && n <= 1) s -= 30;
      // Strongly penalize very large integers which are usually IDs.
      if (Number.isInteger(n) && n > 1000) s += 200;
      if (n > 1 && n <= 10) s += 10;
    }
    return s;
  };

  const chosenKey = numericCandidates
    .slice()
    .sort((a, b) => score(a.k, a.v) - score(b.k, b.v))
    [0]?.k || '';
  const rawVal = chosenKey ? attrs[chosenKey] : '';
  const value = rawVal === null || rawVal === undefined ? '' : String(rawVal);

  const popupText = JSON.stringify(attrs, null, 2);
  return { value, valueField: chosenKey, popupText, screenshotBase64: '' };
}

function buildBbox(pt: { lat: number; lng: number }, delta: number) {
  const xmin = pt.lng - delta;
  const ymin = pt.lat - delta;
  const xmax = pt.lng + delta;
  const ymax = pt.lat + delta;
  return { xmin, ymin, xmax, ymax };
}

function buildBboxWebMercator(pt: { lat: number; lng: number }, deltaMeters: number) {
  const m = lngLatToWebMercator(pt);
  const xmin = m.x - deltaMeters;
  const ymin = m.y - deltaMeters;
  const xmax = m.x + deltaMeters;
  const ymax = m.y + deltaMeters;
  return { xmin, ymin, xmax, ymax };
}

function buildBboxWebMercatorAspect(pt: { lat: number; lng: number }, halfWidthMeters: number, widthPx: number, heightPx: number) {
  const m = lngLatToWebMercator(pt);
  const halfHeightMeters = halfWidthMeters * (heightPx / widthPx);
  const xmin = m.x - halfWidthMeters;
  const ymin = m.y - halfHeightMeters;
  const xmax = m.x + halfWidthMeters;
  const ymax = m.y + halfHeightMeters;
  return { xmin, ymin, xmax, ymax };
}

async function exportMapImage(service: ArcGisServiceInfo, pt: { lat: number; lng: number }) {
  // Export from a MapServer if possible (FeatureServer usually has a related MapServer URL)
  let exportBase = service.baseUrl;
  if (/\/FeatureServer\b/i.test(exportBase)) {
    exportBase = exportBase.replace(/\/FeatureServer\b/i, '/MapServer');
  }
  const exportUrl = `${withNoTrailingSlash(exportBase)}/export`;

  const widthPx = 1200;
  const heightPx = 693;
  const { xmin, ymin, xmax, ymax } = buildBboxWebMercatorAspect(pt, 2100, widthPx, heightPx);

  const u = new URL(exportUrl);
  u.searchParams.set('f', 'image');
  u.searchParams.set('bbox', `${xmin},${ymin},${xmax},${ymax}`);
  u.searchParams.set('bboxSR', '3857');
  u.searchParams.set('imageSR', '3857');
  u.searchParams.set('size', `${widthPx},${heightPx}`);
  // Return transparent overlay so client can layer over a basemap
  u.searchParams.set('format', 'png8');
  u.searchParams.set('transparent', 'true');
  // Only filter layers when we have a concrete sublayer id; a wrong id can hide everything.
  if (Number.isFinite(service.layerId) && service.layerId >= 0) {
    u.searchParams.set('layers', `show:${service.layerId}`);
  }
  u.searchParams.set('dpi', '110');

  const res = await fetchWithTimeout(u.toString(), undefined, 20_000);
  if (!res.ok) throw new Error(`export failed HTTP ${res.status}`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  if (!ct.startsWith('image/')) {
    const snippet = buf.toString('utf8', 0, Math.min(buf.length, 300)).replace(/\s+/g, ' ').trim();
    throw new Error(`export did not return an image (content-type: ${ct || 'unknown'}). url=${u.toString()} snippet=${JSON.stringify(snippet)}`);
  }
  return buf.toString('base64');
}

async function exportEsriBasemap(pt: { lat: number; lng: number }) {
  const widthPx = 1200;
  const heightPx = 693;
  const { xmin, ymin, xmax, ymax } = buildBboxWebMercatorAspect(pt, 2100, widthPx, heightPx);

  const baseExportUrl = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/export';
  const refExportUrl = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/export';

  const mk = (exportUrl: string, opts: { format: string; transparent: 'true' | 'false' }) => {
    const u = new URL(exportUrl);
    u.searchParams.set('f', 'image');
    u.searchParams.set('bbox', `${xmin},${ymin},${xmax},${ymax}`);
    u.searchParams.set('bboxSR', '3857');
    u.searchParams.set('imageSR', '3857');
    u.searchParams.set('size', `${widthPx},${heightPx}`);
    u.searchParams.set('format', opts.format);
    u.searchParams.set('transparent', opts.transparent);
    u.searchParams.set('dpi', '110');
    if (opts.format.toLowerCase().includes('jpg')) {
      u.searchParams.set('compressionQuality', '70');
    }
    return u;
  };

  const baseUrl = mk(baseExportUrl, { format: 'jpg', transparent: 'false' });
  const refUrl = mk(refExportUrl, { format: 'png32', transparent: 'true' });

  const [baseRes, refRes] = await Promise.all([
    fetchWithTimeout(baseUrl.toString(), undefined, 20_000),
    fetchWithTimeout(refUrl.toString(), undefined, 20_000),
  ]);

  if (!baseRes.ok) throw new Error(`basemap base export failed HTTP ${baseRes.status}`);
  if (!refRes.ok) throw new Error(`basemap reference export failed HTTP ${refRes.status}`);

  const baseCt = (baseRes.headers.get('content-type') || '').toLowerCase();
  const refCt = (refRes.headers.get('content-type') || '').toLowerCase();
  const baseBuf = Buffer.from(await baseRes.arrayBuffer());
  const refBuf = Buffer.from(await refRes.arrayBuffer());

  if (!baseCt.startsWith('image/')) {
    const snippet = baseBuf.toString('utf8', 0, Math.min(baseBuf.length, 300)).replace(/\s+/g, ' ').trim();
    throw new Error(`basemap base did not return an image (content-type: ${baseCt || 'unknown'}). url=${baseUrl.toString()} snippet=${JSON.stringify(snippet)}`);
  }
  if (!refCt.startsWith('image/')) {
    const snippet = refBuf.toString('utf8', 0, Math.min(refBuf.length, 300)).replace(/\s+/g, ' ').trim();
    throw new Error(`basemap reference did not return an image (content-type: ${refCt || 'unknown'}). url=${refUrl.toString()} snippet=${JSON.stringify(snippet)}`);
  }

  return {
    basemapBase64: baseBuf.toString('base64'),
    basemapReferenceBase64: refBuf.toString('base64'),
  };
}

async function exportOsmBasemap(pt: { lat: number; lng: number }) {
  const widthPx = 1600;
  const heightPx = 924;

  const { xmin, ymin, xmax, ymax } = buildBboxWebMercatorAspect(pt, 2600, widthPx, heightPx);
  const sw = webMercatorToLngLat({ x: xmin, y: ymin });
  const ne = webMercatorToLngLat({ x: xmax, y: ymax });

  const tileTemplate = process.env.OSM_TILE_TEMPLATE || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const subdomains = (process.env.OSM_TILE_SUBDOMAINS || 'abc').split('');

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        html, body { margin: 0; padding: 0; background: #fff; }
        #map { width: ${widthPx}px; height: ${heightPx}px; }
        /* Greyscale tiles */
        .leaflet-tile-pane { filter: grayscale(1) contrast(1.05) brightness(1.05); }
        .leaflet-container { background: #fff; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        (function(){
          const map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true });
          const layer = L.tileLayer(${JSON.stringify(tileTemplate)}, {
            subdomains: ${JSON.stringify(subdomains)},
            maxZoom: 20,
            crossOrigin: true,
            updateWhenIdle: true,
            updateWhenZooming: false,
            keepBuffer: 0,
          });
          layer.addTo(map);
          const bounds = L.latLngBounds([${sw.lat}, ${sw.lng}], [${ne.lat}, ${ne.lng}]);
          map.fitBounds(bounds, { padding: [0,0] });

          const waitForTiles = () => new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('tile timeout')), 12000);
            layer.once('load', () => { clearTimeout(timeout); resolve(true); });
          });

          window.__basemapReady = (async () => {
            try {
              await waitForTiles();
              // allow one more frame for rendering
              await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
              return true;
            } catch (e) {
              return false;
            }
          })();
        })();
      </script>
    </body>
  </html>`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: ['domcontentloaded'] });
  await page.waitForFunction('window.__basemapReady !== undefined', { timeout: 15_000 });
  const ok = await page.evaluate('window.__basemapReady');
  if (!ok) {
    await page.close();
    throw new Error('OSM basemap tiles failed to load');
  }

  const buf = await page.screenshot({ type: 'jpeg', quality: 88 }) as Buffer;
  await page.close();
  return { basemapBase64: buf.toString('base64'), basemapReferenceBase64: '' };
}

app.get('/health', (_req, res) => {
  res.status(200).send('ok-appendix-l');
});

app.post('/api/fetch-factors', async (req, res) => {
  try {
    const t0 = Date.now();
    let tLast = t0;
    const mark = (label: string) => {
      const now = Date.now();
      const dt = now - tLast;
      tLast = now;
      return `${label}=${dt}ms`;
    };
    console.log('[appendix-l] POST /api/fetch-factors');
    const addressText: string | undefined = req.body?.addressText;
    const includeImages: boolean = req.body?.includeImages !== false;
    if (!addressText || typeof addressText !== 'string' || !addressText.trim()) {
      res.status(400).json({ error: 'Missing addressText' });
      return;
    }

    const key = `${addressText.trim().toLowerCase()}|img:${includeImages ? '1' : '0'}`;
    const cached = cache.get(key);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      res.status(200).json(cached.data);
      return;
    }

    const pt = parseLatLngText(addressText);
    if (!pt) {
      res.status(400).json({ error: 'Address geocoding is not configured yet. Enter Lat,Lng for now.' });
      return;
    }

    const lsItemId = '26961aabd2854bd7bfbb00328e45a059';
    const kItemId = '4ca926e05dad42b1b6ca006b78584f6a';

    const [lsSvc, kSvc] = await Promise.all([
      resolveServiceFromWebAppItem(lsItemId, 'LS'),
      resolveServiceFromWebAppItem(kItemId, 'K'),
    ]);
    const svcMark = mark('svc');

    const [lsQ, kQ] = await Promise.all([
      queryValueAtPoint(lsSvc, 'LS', pt),
      queryValueAtPoint(kSvc, 'K', pt),
    ]);
    const qMark = mark('query');

    let lsImg = '';
    let kImg = '';
    let basemapBase64 = '';
    let basemapReferenceBase64 = '';
    if (includeImages) {
      const [bm, ls, kk] = await Promise.all([
        exportEsriBasemap(pt),
        exportMapImage(lsSvc, pt),
        exportMapImage(kSvc, pt),
      ]);
      basemapBase64 = bm.basemapBase64;
      basemapReferenceBase64 = bm.basemapReferenceBase64;
      lsImg = ls;
      kImg = kk;
    }
    const imgMark = includeImages ? mark('img') : '';

    const ls = { ...lsQ, screenshotBase64: lsImg, basemapBase64, basemapReferenceBase64 };
    const k = { ...kQ, screenshotBase64: kImg, basemapBase64, basemapReferenceBase64 };

    const payload = { ls, k };
    cache.set(key, { ts: Date.now(), data: payload });
    const ms = Date.now() - t0;
    console.log(`[appendix-l] fetch-factors ok includeImages=${includeImages ? '1' : '0'} ms=${ms} ${svcMark} ${qMark}${imgMark ? ` ${imgMark}` : ''}`);
    res.status(200).json(payload);
  } catch (e: any) {
    const message = e?.message || 'fetch-factors failed';
    const stack = typeof e?.stack === 'string' ? e.stack : undefined;
    console.error('[appendix-l] fetch-factors error:', message);
    if (stack) console.error(stack);
    res.status(500).json({ error: message });
  }
});

app.get('/api/fetch-factors', (_req, res) => {
  res.status(405).json({ error: 'Use POST /api/fetch-factors' });
});

// Expect { html: string }
app.post('/export', async (req, res) => {
  try {
    const html: string | undefined = req.body?.html;
    if (!html || typeof html !== 'string') {
      res.status(400).json({ error: 'Missing html' });
      return;
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ['domcontentloaded', 'networkidle0'] });

    const pdf = await page.pdf({
      printBackground: true,
      width: '8.5in',
      height: '11in',
      margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Appendix_L.pdf"');
    res.send(Buffer.from(pdf));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'export failed' });
  }
});

const distDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/export') {
      res.status(404).send('Not Found');
      return;
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Appendix L server listening on http://localhost:${PORT}`);
});
