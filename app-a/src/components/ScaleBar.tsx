import React, { useEffect, useState } from 'react';
import type { Map as MlMap } from 'maplibre-gl';

function metersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

export default function ScaleBar({ map }: { map: MlMap | null }) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!map) return;
    function update() {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const mpp = metersPerPixel(center.lat, zoom);
      // choose a nice round bar length in pixels ~ 150px
      const targetPx = 150;
      const meters = mpp * targetPx;
      // round to 1-2-5*10^n
      const nice = [1,2,5];
      let pow = Math.pow(10, Math.floor(Math.log10(meters)));
      let best = pow;
      for (const n of nice) {
        const v = n * pow;
        if (Math.abs(v - meters) < Math.abs(best - meters)) best = v;
      }
      const px = Math.round(best / mpp);
      const feet = best * 3.28084;
      const feetLabel = feet >= 1000 ? `${Math.round(feet/100)/10}k ft` : `${Math.round(feet)} ft`;
      const metersLabel = best >= 1000 ? `${Math.round(best/100)/10} km` : `${Math.round(best)} m`;
      setLabel(`${feetLabel} | ${metersLabel}`);
      const el = document.getElementById(`scalebar-fill-${map.getContainer().id}`);
      if (el) el.style.width = `${px}px`;
    }
    update();
    map.on('move', update);
    return () => { map.off('move', update); };
  }, [map]);

  return (
    <div className="scalebar" role="img" aria-label={`Scale ${label}`}>
      <div style={{width:160}}>
        <div style={{height:6, background:'#111827'}} id={`scalebar-fill-${map?.getContainer().id || 'x'}`}></div>
      </div>
      <div>{label}</div>
    </div>
  );
}
