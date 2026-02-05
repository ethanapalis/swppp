import type { Provider } from '../App';
import type { StyleSpecification } from 'maplibre-gl';

function osmRasterStyle(): StyleSpecification {
  // Public OSM raster tiles
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'osm-tiles', type: 'raster', source: 'osm' },
    ],
  } as StyleSpecification;
}

function esriWorldImageryStyle(): StyleSpecification {
  // Esri World Imagery raster (terms of use apply)
  return {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'esri-imagery', type: 'raster', source: 'esri' },
    ],
  } as StyleSpecification;
}

export function getStyleFor({ provider, satellite }:{ provider: Provider; satellite: boolean }){
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  // Mapbox-only rendering: serve Mapbox raster tiles via a MapLibre-compatible style
  if (provider === 'mapbox' && mapboxToken) {
    const styleId = satellite ? 'satellite-v9' : 'streets-v12';
    const tileUrl = `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${mapboxToken}`;
    return {
      version: 8,
      sources: {
        mb: {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          attribution: '© Mapbox, © OpenStreetMap contributors',
          maxzoom: 19,
        },
      },
      layers: [
        { id: 'mb-raster', type: 'raster', source: 'mb' },
      ],
    } as StyleSpecification;
  }

  // OpenStreetMap provider (and/or fallback when Mapbox token is missing)
  // Note: OSM does not provide a satellite basemap; we use Esri World Imagery when satellite is requested.
  return satellite ? esriWorldImageryStyle() : osmRasterStyle();
}
