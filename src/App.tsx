import React, { useMemo, useState } from 'react';
import AddressForm from './components/AddressForm';
import MapPanel from './components/MapPanel';
import PdfPreview from './components/PdfPreview';
import { geocodeAddress } from './lib/geocode';
import { providerAttribution } from './lib/attribution';

export type Provider = 'open' | 'mapbox' | 'google' | 'bing';

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
