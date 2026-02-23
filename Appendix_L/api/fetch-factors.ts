type CacheValue = {
  ts: number;
  data: any;
};

type ArcGisServiceInfo = {
  baseUrl: string;
  layerId: number;
  valueField?: string;
};

const cache = new Map<string, CacheValue>();
const CACHE_TTL_MS = 10 * 60 * 1000;

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

  const op = ops.find(l => typeof l?.url === 'string' && /\/MapServer\b|\/FeatureServer\b/i.test(l.url));
  if (!op?.url) {
    throw new Error(`Could not find operational layer url for ${factorKey} webmap ${webmapItemId}`);
  }

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

  const keys = Object.keys(attrs);
  const isOidLike = (k: string) => /(^|_)(objectid|oid|fid)(_|$)|objectid|globalid|shape__?(len|area)|shape_length|shape_area/i.test(k);
  const numericCandidates = keys
    .filter(k => !isOidLike(k))
    .map(k => ({ k, v: (attrs as any)[k] }))
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
      if (n >= 0 && n <= 1) s -= 30;
      if (Number.isInteger(n) && n > 1000) s += 200;
      if (n > 1 && n <= 10) s += 10;
    }
    return s;
  };

  const chosenKey = numericCandidates
    .slice()
    .sort((a, b) => score(a.k, a.v) - score(b.k, b.v))
    [0]?.k || '';
  const rawVal = chosenKey ? (attrs as any)[chosenKey] : '';
  const value = rawVal === null || rawVal === undefined ? '' : String(rawVal);

  const popupText = JSON.stringify(attrs, null, 2);
  return { value, valueField: chosenKey, popupText, screenshotBase64: '' };
}

function lngLatToWebMercator(pt: { lat: number; lng: number }) {
  const x = (pt.lng * 20037508.34) / 180;
  const y = Math.log(Math.tan(((90 + pt.lat) * Math.PI) / 360)) / (Math.PI / 180);
  const yMeters = (y * 20037508.34) / 180;
  return { x, y: yMeters };
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
  u.searchParams.set('format', 'png8');
  u.searchParams.set('transparent', 'true');
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

async function readJsonBody(req: any) {
  if (req?.body && typeof req.body === 'object') return req.body;
  const raw: string = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: any) => { data += String(chunk); });
    req.on('end', () => resolve(data));
    req.on('error', (err: any) => reject(err));
  });
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Use POST /api/fetch-factors' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const t0 = Date.now();
    let tLast = t0;
    const mark = (label: string) => {
      const now = Date.now();
      const dt = now - tLast;
      tLast = now;
      return `${label}=${dt}ms`;
    };

    const addressText: string | undefined = body?.addressText;
    const includeImages: boolean = body?.includeImages !== false;

    if (!addressText || typeof addressText !== 'string' || !addressText.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing addressText' }));
      return;
    }

    const key = `${addressText.trim().toLowerCase()}|img:${includeImages ? '1' : '0'}`;
    const cached = cache.get(key);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(cached.data));
      return;
    }

    const pt = parseLatLngText(addressText);
    if (!pt) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Address geocoding is not configured yet. Enter Lat,Lng for now.' }));
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

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  } catch (e: any) {
    const message = e?.message || 'fetch-factors failed';
    console.error('[appendix-l] fetch-factors error:', message);

    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
}
