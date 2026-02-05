import React, { useEffect, useRef, useState } from 'react';
import { Provider } from '../App';
import { parseLatLng } from '../lib/parseLatLng';
import { exportPdf } from '../lib/exportPdf';

type Props = {
  address: string;
  onAddress: (v: string) => void;
  cityState: string;
  onCityState: (v: string) => void;
  lat: string; lng: string;
  onLat: (v: string) => void; onLng: (v: string) => void;
  provider: Provider; onProvider: (p: Provider) => void;
  satelliteSite: boolean; onSatelliteSite: (v: boolean) => void;
  satelliteVicinity: boolean; onSatelliteVicinity: (v: boolean) => void;
  zoomSite: number; onZoomSite: (n: number) => void;
  zoomVicinity: number; onZoomVicinity: (n: number) => void;
  onPreview: () => void;
  status?: string;
  captchaOk: boolean; onCaptchaOk: (v: boolean) => void;
};

export default function AddressForm(props: Props) {
  const { address, cityState, onAddress, onCityState, lat, lng, onLat, onLng, provider, onProvider, satelliteSite, onSatelliteSite, satelliteVicinity, onSatelliteVicinity, zoomSite, onZoomSite, zoomVicinity, onZoomVicinity, onPreview, status, captchaOk, onCaptchaOk } = props;
  const [suggestions, setSuggestions] = useState<Array<{id:string; place_name:string}>>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);

  const [latLngText, setLatLngText] = useState((lat && lng) ? `${lat}, ${lng}` : '');
  const [latLngError, setLatLngError] = useState<string>('');

  useEffect(() => {
    setLatLngText((lat && lng) ? `${lat}, ${lng}` : '');
  }, [lat, lng]);

  useEffect(() => {
    const q = address.trim();
    if (!q || q.length < 3) { setSuggestions([]); setIsSuggesting(false); return; }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const token = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined);
        if (!token) { setSuggestions([]); setIsSuggesting(false); return; }
        const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`);
        url.searchParams.set('access_token', token);
        url.searchParams.set('autocomplete', 'true');
        url.searchParams.set('limit', '5');
        url.searchParams.set('country', 'US');
        url.searchParams.set('types', 'address,place');
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('autocomplete failed');
        const data = await res.json();
        const feats = Array.isArray(data?.features) ? data.features : [];
        const s = feats.map((f:any) => ({ id: String(f.id), place_name: String(f.place_name) }));
        setSuggestions(s);
        setIsSuggesting(true);
      } catch {
        setSuggestions([]);
        setIsSuggesting(false);
      }
    }, 200);
    return () => { window.clearTimeout(debounceRef.current); };
  }, [address]);
  return (
    <div className="form-grid">
      <div className="group">
        <div className="row" style={{ gap: 4 }}>
          <label>FULL ADDRESS</label>
          <div style={{ position:'relative' }}>
            <textarea
              className="native-reset input-lg"
              rows={1}
              value={address}
              onChange={e=>onAddress(e.target.value)}
              placeholder="1730 N First St, San Jose, CA 95112"
              onFocus={()=>{ if (suggestions.length) setIsSuggesting(true); }}
              onBlur={()=>{ setTimeout(()=>setIsSuggesting(false), 120); }}
            />
            {isSuggesting && suggestions.length > 0 ? (
              <div style={{ position:'absolute', zIndex: 20, left:0, right:0, top: '100%', marginTop:4, background:'#fff', border:'1px solid #e5e7eb', borderRadius:6, boxShadow:'0 6px 16px rgba(0,0,0,0.08)' }}>
                {suggestions.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="native-reset"
                    onMouseDown={e=>e.preventDefault()}
                    onClick={()=>{ onAddress(s.place_name); setSuggestions([]); setIsSuggesting(false); }}
                    style={{ width:'100%', textAlign:'left', padding:'8px 10px', background:'transparent', border:'none', cursor:'pointer' }}
                  >
                    {s.place_name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ gap: 0 }}></div>
        <div className="row" style={{ gap: 4 }}>
          <label>
            LAT / LONG <span style={{ color:'#9ca3af', fontWeight: 400 }}>(optional, overrides address)</span>
          </label>
          <input
            className="native-reset input-lg latlong-input"
            value={latLngText}
            onChange={e => {
              setLatLngText(e.target.value);
              setLatLngError('');
            }}
            onBlur={() => {
              const v = latLngText.trim();
              if (!v) {
                onLat('');
                onLng('');
                setLatLngError('');
                return;
              }
              const parsed = parseLatLng(v);
              if (!parsed) {
                setLatLngError('Invalid lat/long');
                return;
              }
              onLat(String(parsed.lat));
              onLng(String(parsed.lng));
              setLatLngText(`${parsed.lat}, ${parsed.lng}`);
              setLatLngError('');
            }}
            placeholder={`37.322587, -122.025648 or 37°19'21.3"N 122°01'32.3"W`}
          />
        </div>
      </div>

      <div className="group">
        <div className="row">
          <label>MAP SETTINGS</label>
          <select className="provider-select" value={provider} onChange={e=>onProvider(e.target.value as Provider)}>
            <option value="mapbox">Mapbox</option>
            <option value="open">OpenStreetMap</option>
          </select>
        </div>
        <div style={{ gap: 0 }}></div>
        <div className="row" style={{ marginBottom: 12 }}>
          <label>BASEMAP</label>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <div>
              <div style={{ fontSize: 14, color:'#3B414B', marginBottom:6 }}>Project Site</div>
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <input id="sat-site" type="checkbox" checked={satelliteSite} onChange={e=>onSatelliteSite(e.target.checked)} />
                <label htmlFor="sat-site" style={{ fontSize: 14, color: '#3B414B' }}>Satellite</label>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 14, color:'#3B414B', marginBottom:6 }}>Vicinity</div>
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <input id="sat-vic" type="checkbox" checked={satelliteVicinity} onChange={e=>onSatelliteVicinity(e.target.checked)} />
                <label htmlFor="sat-vic" style={{ fontSize: 14, color: '#3B414B' }}>Satellite</label>
              </div>
            </div>
          </div>
        </div>
        <div className="row">
          <label>ZOOM PRESETS</label>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <div>
              <div style={{ fontSize: 14, color:'#3B414B', marginBottom:6 }}>Project Site</div>
              <input type="number" step="0.2" value={zoomSite} onChange={e=>onZoomSite(parseFloat(e.target.value))} />
            </div>
            <div>
              <div style={{ fontSize: 14, color:'#3B414B', marginBottom:6 }}>Vicinity</div>
              <input type="number" step="0.2" value={zoomVicinity} onChange={e=>onZoomVicinity(parseFloat(e.target.value))} />
            </div>
          </div>
        </div>
      </div>
      <div className="row" style={{display:'grid', gap:8, marginLeft:12}}>
        <div style={{display:'grid', gap:6}}>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <button className="btn btn-primary" onClick={onPreview} disabled={!captchaOk} title={!captchaOk ? 'Complete captcha to enable' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}>
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"></path>
              </svg>
              Preview
            </button>
            <button
              className="btn btn-export"
              disabled={!captchaOk}
              title={!captchaOk ? 'Complete captcha to enable' : undefined}
              onClick={async ()=>{
                const el = document.getElementById('pdf-page');
                if (el) {
                  await exportPdf({ rootEl: el as HTMLElement, filenameHint: address });
                }
              }}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6}}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export PDF
            </button>
          </div>
          {latLngError ? <div style={{color:'#b91c1c', fontSize:12}}>{latLngError}</div> : null}
          {status ? <div style={{color:'#6b7280', fontSize:12}}>{status}</div> : null}
        </div>
      </div>
      <div className="row">
        <div className="small-note" style={{ color:'#6b7280', fontSize:10, textAlign:'right' }}>Ethan Apalis, 2026</div>
      </div>
    </div>
  );
}
