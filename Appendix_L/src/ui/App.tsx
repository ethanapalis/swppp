import React, { useState } from 'react';
import AddressForm from './components/AddressForm';
import PdfPreview from './components/PdfPreview';

type FactorResult = {
  value: string;
  popupText: string;
  screenshotBase64: string;
};

export default function App() {
  const [searchText, setSearchText] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [showLatLongOnPdf, setShowLatLongOnPdf] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [flashSeq, setFlashSeq] = useState(0);

  const [ls, setLs] = useState<FactorResult | null>(null);
  const [k, setK] = useState<FactorResult | null>(null);

  async function handlePreview() {
    setStatus('');
    setLs(null);
    setK(null);

    const addressText = searchText.trim();
    if (!addressText) {
      setStatus('Enter an address.');
      return;
    }

    try {
      const reqKey = addressText;

      setStatus('Fetching LS and K values…');
      const res = await fetch(`/api/fetch-factors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressText, includeImages: false }),
      });
      const rawText = await res.text().catch(() => '');
      const data: any = (() => {
        try { return rawText ? JSON.parse(rawText) : {}; } catch { return {}; }
      })();
      if (!res.ok) {
        const detail = data?.error || rawText || res.statusText || 'Request failed';
        setStatus(`Fetch failed (${res.status}): ${String(detail)}`);
        return;
      }

      setLs(data?.ls || null);
      setK(data?.k || null);

      const lsVal = data?.ls?.value;
      const kVal = data?.k?.value;
      const lsMissing = lsVal === null || lsVal === undefined || String(lsVal).trim() === '';
      const kMissing = kVal === null || kVal === undefined || String(kVal).trim() === '';
      if (lsMissing || kMissing) {
        setStatus('Fetched values, but could not parse one or more factor values.');
      } else {
        setFlashSeq(s => s + 1);
        setStatus('Fetching map images…');
      }

      // Background fetch for images to keep UI responsive.
      void (async () => {
        try {
          const resImg = await fetch(`/api/fetch-factors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addressText: reqKey, includeImages: true }),
          });
          const rawImg = await resImg.text().catch(() => '');
          const imgData: any = (() => {
            try { return rawImg ? JSON.parse(rawImg) : {}; } catch { return {}; }
          })();
          if (!resImg.ok) {
            const detail = imgData?.error || rawImg || resImg.statusText || 'Request failed';
            setStatus(`Image fetch failed (${resImg.status}): ${String(detail)}`);
            return;
          }

          // Only apply if the user hasn't changed the input since the request started.
          if (searchText.trim() !== reqKey) return;

          setLs(imgData?.ls || null);
          setK(imgData?.k || null);
          setStatus('');
        } catch (e: any) {
          setStatus(`Image fetch failed: ${e?.message || String(e)}`);
        }
      })();
    } catch (e: any) {
      setStatus(`Fetch failed: ${e?.message || String(e)}`);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-title">SWPPP Appendix L Generator</div>
        <div className="form-grid">
          <AddressForm
            searchText={searchText}
            onSearchText={setSearchText}
            showLatLongOnPdf={showLatLongOnPdf}
            onShowLatLongOnPdf={setShowLatLongOnPdf}
            projectTitle={projectTitle}
            onProjectTitle={setProjectTitle}
            placeholder={status === 'Fetching map images…' ? 'Fetching map images…' : 'Enter Lat / Long'}
            onPreview={handlePreview}
            status={status}
          />
        </div>
        <div className="small-note" style={{ color:'#6b7280', fontSize:10, textAlign:'right', marginTop: 8 }}>Ethan Apalis, 2026</div>
      </aside>
      <main className="content">
        <div className="preview">
          <PdfPreview
            projectTitle={projectTitle}
            address={searchText}
            showLatLongOnPdf={showLatLongOnPdf}
            flashSeq={flashSeq}
            loadingMapPreviews={status === 'Fetching map images…'}
            ls={ls}
            k={k}
          />
        </div>
      </main>
    </div>
  );
}
