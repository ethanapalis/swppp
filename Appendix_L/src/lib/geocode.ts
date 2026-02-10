export async function geocodeAddress({ address, cityState }: { address: string; cityState?: string; }): Promise<{ coords: {lat:number; lng:number} }>{
  const q = [address, cityState || ''].filter(Boolean).join(', ');
  const key = (import.meta.env.VITE_GEOCODIO_KEY as string | undefined);
  if (!key) {
    throw new Error('Geocoding unavailable: missing VITE_GEOCODIO_KEY');
  }
  const url = new URL('https://api.geocod.io/v1.7/geocode');
  url.searchParams.set('q', q);
  url.searchParams.set('country', 'us');
  url.searchParams.set('api_key', key);
  url.searchParams.set('limit', '1');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Geocodio error ${res.status}`);
  const data = await res.json();
  const result = data?.results?.[0]?.location;
  if (!result || typeof result.lat !== 'number' || typeof result.lng !== 'number') {
    throw new Error('Address not found');
  }
  return { coords: { lat: result.lat, lng: result.lng } };
}
