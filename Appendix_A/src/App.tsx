import React, { useMemo, useState } from 'react';
import AddressForm from './components/AddressForm';
import MapPanel from './components/MapPanel';
import PdfPreview from './components/PdfPreview';
import { geocodeAddress } from './lib/geocode';
import { providerAttribution } from './lib/attribution';

export type Provider = 'open' | 'mapbox' | 'google' | 'bing';

function TurnstileWidget({ onOk, onStatus }:{ onOk: (ok: boolean) => void; onStatus?: (msg: string) => void }) {
  const siteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const renderedRef = React.useRef(false);

  React.useEffect(() => {
    if (!siteKey) return;
    if (renderedRef.current) return;
    if (!boxRef.current) return;

    const w = window as any;
    const ensureRender = () => {
      if (renderedRef.current) return;
      if (!boxRef.current) return;
      try {
        const widgetId = w.turnstile?.render(boxRef.current, {
          sitekey: siteKey,
          theme: 'light',
          callback: async (token: string) => {
            try {
              const devBase = (import.meta.env.VITE_SERVER_BASE_URL as string | undefined);
              const verifyUrl = devBase ? `${devBase}/turnstile/verify` : `${window.location.origin}/api/turnstile/verify`;
              const res = await fetch(verifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
              });
              const data: any = await res.json().catch(() => ({}));
              const ok = Boolean(data?.ok);
              onOk(ok);
              if (onStatus) onStatus(ok ? '' : 'Captcha verification failed');
            } catch {
              onOk(false);
              if (onStatus) onStatus('Captcha verification failed');
            }
          },
          'error-callback': () => { onOk(false); if (onStatus) onStatus('Captcha verification failed'); },
          'expired-callback': () => { onOk(false); if (onStatus) onStatus('Captcha expired'); },
        });
        if (widgetId) renderedRef.current = true;
      } catch {
        onOk(false);
      }
    };

    const existing = document.querySelector('script[data-turnstile]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', ensureRender, { once: true });
      ensureRender();
    } else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-turnstile', '1');
      s.addEventListener('load', ensureRender, { once: true });
      document.head.appendChild(s);
    }
  }, [siteKey, onOk]);

  if (!siteKey) {
    return (
      <label style={{display:'flex', gap:8, alignItems:'center', justifyContent:'center'}}>
        <input type="checkbox" onChange={e=>onOk(e.target.checked)} />
        <span>I'm not a robot</span>
      </label>
    );
  }
  return <div ref={boxRef} />;
}

export default function App() {
  const [address, setAddress] = useState('');
  const [cityState, setCityState] = useState('');
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [coords, setCoords] = useState<{lat:number; lng:number} | null>(null);
  const [provider, setProvider] = useState<Provider>('mapbox');
  const [satelliteSite, setSatelliteSite] = useState(true);
  const [satelliteVicinity, setSatelliteVicinity] = useState(true);
  const [zoomSite, setZoomSite] = useState(17.5);
  const [zoomVicinity, setZoomVicinity] = useState(12);
  const [status, setStatus] = useState<string>('');
  const [captchaOk, setCaptchaOk] = useState(false);

  const attribution = useMemo(() => providerAttribution({provider, satellite: (satelliteSite || satelliteVicinity)}), [provider, satelliteSite, satelliteVicinity]);

  async function handlePreview() {
    setStatus('');
    if (!captchaOk) { setStatus('Please complete the captcha before previewing.'); return; }
    // If lat/lng provided, use them; else geocode
    if (lat && lng) {
      const la = parseFloat(lat); const lo = parseFloat(lng);
      if (Number.isFinite(la) && Number.isFinite(lo)) {
        setCoords({lat: la, lng: lo});
        return;
      } else {
        setStatus('Invalid lat/long');
        return;
      }
    }
    if (!address.trim()) { setStatus('Enter an address or lat/long.'); return; }
    try {
      setStatus('Geocoding…');
      const res = await geocodeAddress({ address, cityState });
      setCoords(res.coords);
      if (res.suggestedVicinityZoom) setZoomVicinity(res.suggestedVicinityZoom);
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Geocoding failed');
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-title">SWPPP Appendix A Generator</div>
        <div className="form-grid">
          <AddressForm
            address={address}
            onAddress={setAddress}
            cityState={cityState}
            onCityState={setCityState}
            lat={lat}
            lng={lng}
            onLat={setLat}
            onLng={setLng}
            provider={provider}
            onProvider={setProvider}
            satelliteSite={satelliteSite}
            onSatelliteSite={setSatelliteSite}
            satelliteVicinity={satelliteVicinity}
            onSatelliteVicinity={setSatelliteVicinity}
            zoomSite={zoomSite}
            onZoomSite={setZoomSite}
            zoomVicinity={zoomVicinity}
            onZoomVicinity={setZoomVicinity}
            onPreview={handlePreview}
            status={status}
            captchaOk={captchaOk}
            onCaptchaOk={setCaptchaOk}
          />
        </div>
        <div className="sidebar-bottom">
          <TurnstileWidget onOk={setCaptchaOk} onStatus={setStatus} />
        </div>
      </aside>
      <main className="content">
        <div className="preview">
          <PdfPreview
            address={address}
            coords={coords}
            provider={provider}
            satelliteSite={satelliteSite}
            satelliteVicinity={satelliteVicinity}
            zoomSite={zoomSite}
            zoomVicinity={zoomVicinity}
            attribution={attribution}
          />
        </div>
      </main>
    </div>
  );
}
