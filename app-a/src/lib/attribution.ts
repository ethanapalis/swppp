import type { Provider } from '../App';

export function providerAttribution({ provider, satellite }:{ provider: Provider; satellite: boolean }){
  const year = new Date().getFullYear();
  if (provider === 'open') {
    const imagery = satellite ? ` Imagery © ${year} MapTiler/partners.` : '';
    return `Map data © ${year} OpenStreetMap contributors. Tiles © ${year} MapTiler.${imagery}`;
  }
  if (provider === 'mapbox') {
    const imagery = satellite ? ` Imagery © ${year} Mapbox/Maxar.` : '';
    return `Map data © ${year} Mapbox, OpenStreetMap contributors.${imagery}`;
  }
  if (provider === 'google') {
    return `Map data © ${year} Google.`;
  }
  if (provider === 'bing') {
    return `© Microsoft, © OpenStreetMap contributors, © TomTom.`;
  }
  return '';
}
