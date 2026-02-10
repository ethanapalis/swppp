import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function tryServerExport(html: string): Promise<Blob | null> {
  const baseEnv = (import.meta.env.VITE_SERVER_BASE_URL as string | undefined);
  const base = (baseEnv && baseEnv.trim()) ? baseEnv : '';
  try {
    const h = await fetch(`${base}/health`).then(r=>r.text()).catch(()=>null);
    if (h !== 'ok') return null;
    const res = await fetch(`${base}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html })
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

function buildHtmlShell(inner: string) {
  return `<!doctype html><html><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { size: 8.5in 11in; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; font-family: Arial, sans-serif; }
      .pdf-page { width: 816px; height: 1056px; margin: 0 auto; background: #fff; color: #111827; position: relative; border: 1px solid #e5e7eb; }
      .pdf-inner { padding: 48px; padding-bottom: 54px; display: grid; gap: 16px; }
      .pdf-header { font-weight: 700; margin-bottom: 8px; }
      .pdf-map { height: 410px; border: 1px solid #d1d5db; background: #f3f4f6; display: flex; align-items: center; justify-content: center; color: #6b7280; }
      .pdf-footer { position: absolute; left: 48px; right: 48px; bottom: 24px; font-size: 10px; color: #374151; text-align: center; }
    </style>
  </head><body>${inner}</body></html>`;
}

export async function exportPdf({ rootEl, filenameHint }:{ rootEl: HTMLElement; filenameHint?: string; }){
  await sleep(100);
  const html = buildHtmlShell(rootEl.outerHTML);

  const serverBlob = await tryServerExport(html);
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

  const canvas = await html2canvas(rootEl, { scale: 2, useCORS: true });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: 'letter' });
  pdf.addImage(imgData, 'PNG', 0, 0, 8.5, 11);
  pdf.save(buildFilename(filenameHint));
}

function buildFilename(hint?: string) {
  const date = new Date();
  const y = String(date.getFullYear());
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  const safe = (hint || 'Project').replace(/[^a-z0-9]+/gi,'_').slice(0,60);
  return `Appendix_L_${y}-${m}-${d}_${safe}.pdf`;
}
