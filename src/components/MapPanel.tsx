import React, { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MlMap } from 'maplibre-gl';
import NorthArrow from './NorthArrow';
import ScaleBar from './ScaleBar';
import { getStyleFor } from '../lib/mapStyles';
import type { Provider } from '../App';

type MapFrameProps = {
  id: string;
  coords: {lat:number; lng:number} | null;
  zoom: number;
  provider: Provider;
  satellite: boolean;
  title: string;
  height?: number;
};

export function MapFrame(props: MapFrameProps) {
  const { id, coords, zoom, provider, satellite, title, height } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!coords) return;
    const style = getStyleFor({ provider, satellite });
    const m = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [coords.lng, coords.lat],
      zoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      preserveDrawingBuffer: true,
    });
    setMap(m);
    return () => { m.remove(); setMap(null); };
  }, [coords?.lat, coords?.lng, provider, satellite]);

  useEffect(() => {
    if (!map || !coords) return;
    map.jumpTo({center: [coords.lng, coords.lat], zoom});
  }, [zoom, coords?.lat, coords?.lng, map]);

  return (
    <div className="map-frame">
      <div ref={containerRef} id={id} style={{height: height ?? 360, position:'relative'}}>
        {!coords ? (
          <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280', fontSize:14, textAlign:'center', padding:'0 16px'}}>
            Enter a full address or Lat/Long to preview
          </div>
        ) : null}
      </div>
      <NorthArrow />
      <ScaleBar map={map} />
      {title ? <div className="map-title">{title}</div> : null}
    </div>
  );
}

export default function MapPanel({ coords, provider, satelliteSite, satelliteVicinity, zoomSite, zoomVicinity }:{
  coords: {lat:number; lng:number} | null;
  provider: Provider;
  satelliteSite: boolean;
  satelliteVicinity: boolean;
  zoomSite: number;
  zoomVicinity: number;
}) {
  return (
    <div className="map-row">
      <MapFrame id="map-site" coords={coords} zoom={zoomSite} provider={provider} satellite={satelliteSite} title="Project Site" />
      <MapFrame id="map-vicinity" coords={coords} zoom={zoomVicinity} provider={provider} satellite={satelliteVicinity} title="Vicinity Map" />
    </div>
  );
}
