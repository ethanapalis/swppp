import React, { useEffect, useRef } from 'react';
import { MapFrame } from './MapPanel';
import type { Provider } from '../App';

export default function PdfPreview({ address, coords, provider, satelliteSite, satelliteVicinity, zoomSite, zoomVicinity, attribution }:{
  address: string;
  coords: {lat:number; lng:number} | null;
  provider: Provider;
  satelliteSite: boolean;
  satelliteVicinity: boolean;
  zoomSite: number;
  zoomVicinity: number;
  attribution: string;
}){
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div className="pdf-page" id="pdf-page" ref={ref}>
        <div className="pdf-inner">
          <div className="pdf-header">Project: {address || '—'}</div>
          <div className="pdf-divider" />

          {/* Upper half: Project Site */}
          <div className="pdf-map" style={{marginBottom:4}}>
            <MapFrame id="pdf-map-site" coords={coords} zoom={zoomSite} provider={provider} satellite={satelliteSite} title="" height={410} />
          </div>
          <div className="pdf-caption">Project Site</div>

          {/* Lower half: Vicinity Map */}
          <div className="pdf-map" style={{marginTop:12, marginBottom:4}}>
            <MapFrame id="pdf-map-vicinity" coords={coords} zoom={zoomVicinity} provider={provider} satellite={satelliteVicinity} title="" height={410} />
          </div>
          <div className="pdf-caption">Vicinity Map</div>
        </div>
        <div className="pdf-footer">
          <span>{attribution} Images pulled from {provider.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
