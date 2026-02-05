import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function tryServerExport(html: string): Promise<Blob | null> {
  const base = (import.meta.env.VITE_SERVER_BASE_URL as string) || window.location.origin;
  try {
    const h = await fetch(`${base}/health`).then(r=>r.text()).catch(()=>null);
    if (h !== 'ok') return null;
    const res = await fetch(`${base}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html })
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob;
  } catch {
    return null;
  }
}

function buildHtmlShell(inner: string) {
  // Inline critical CSS so server-side rendering matches the on-screen preview
  return `<!doctype html><html><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      @page { size: 8.5in 11in; margin: 0; }
      :root { --pad: 12px; }
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; font-family: 'Libre Franklin', Arial, sans-serif; }
      .map-frame { position: relative; background: #fff; border: 1px solid #d1d5db; }
      .map-title { text-align: center; font-weight: 600; padding: 4px 0; background: #fff; border-top: 1px solid #e5e7eb; }
      .north { position: absolute; top: 8px; right: 8px; z-index: 5; }
      .scalebar { position: absolute; left: 8px; bottom: 8px; z-index: 5; background: rgba(255,255,255,0.9); padding: 2px 6px; border-radius: 3px; border: 1px solid #d1d5db; font-size: 11px; }
      .pdf-page { width: 816px; height: 1056px; margin: 0 auto; background: #fff; color: #111827; position: relative; border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
      .pdf-inner { padding: 48px; padding-bottom: 54px; }
      .pdf-header { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
      .pdf-divider { height: 1px; background: #e5e7eb; margin-bottom: 8px; }
      .pdf-caption { text-align: center; font-size: 14px; margin-top: 4px; }
      .pdf-footer { position: absolute; left: 48px; right: 48px; bottom: 24px; font-size: 10px; color: #374151; text-align: center; }
      .small-note { font-size: 11px; color: #4b5563; }
      .pdf-map { position: relative; height: 410px; border: 1px solid #d1d5db; background: #e5e7eb; overflow: hidden; }
    </style>
  </head><body>${inner}</body></html>`;
}

function cloneWithRasterizedMaps(rootEl: HTMLElement): { clone: HTMLElement; replacedCount: number } {
  // Snapshot original canvases to data URLs (may fail if tainted)
  const originalCanvases = Array.from(rootEl.querySelectorAll('canvas')) as HTMLCanvasElement[];
  const snapshots: (string | null)[] = originalCanvases.map(c => {
    try {
      return c.toDataURL('image/png');
    } catch {
      return null;
    }
  });

  const clone = rootEl.cloneNode(true) as HTMLElement;
  const cloneCanvases = Array.from(clone.querySelectorAll('canvas')) as HTMLCanvasElement[];
  let replacedCount = 0;
  for (let i = 0; i < cloneCanvases.length; i++) {
    const dataUrl = snapshots[i];
    if (!dataUrl) continue;
    const canvasEl = cloneCanvases[i];
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.width = canvasEl.style.width || '100%';
    img.style.height = canvasEl.style.height || '100%';
    canvasEl.replaceWith(img);
    replacedCount++;
  }
  return { clone, replacedCount };
}

export async function exportPdf({ rootEl, filenameHint }:{ rootEl: HTMLElement; filenameHint?: string; }){
  // Give tiles time to settle
  await sleep(250);
  const { clone, replacedCount } = cloneWithRasterizedMaps(rootEl);
  const html = buildHtmlShell(`<div class="pdf-page">${clone.outerHTML}</div>`);

  // Try server Puppeteer for crisp text
  // Only attempt server export when we successfully rasterized canvases; otherwise use client fallback
  const serverBlob = replacedCount > 0 ? await tryServerExport(html) : null;
  if (serverBlob) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(serverBlob);
    a.href = url;
    a.download = buildFilename(filenameHint);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  // Fallback: client-side render
  const canvas = await html2canvas(rootEl, { scale: 2, useCORS: true });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  // Draw full-bleed, margins are already in layout
  pdf.addImage(imgData, 'PNG', 0, 0, 8.5, 11);
  pdf.save(buildFilename(filenameHint));
}

function buildFilename(hint?: string) {
  const date = new Date();
  const y = String(date.getFullYear());
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  const safe = (hint || 'Address').replace(/[^a-z0-9]+/gi,'_').slice(0,60);
  return `SWPPP_AppendixA_Maps_${y}${m}${d}_${safe}.pdf`;
}
