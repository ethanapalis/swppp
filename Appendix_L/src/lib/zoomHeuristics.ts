export async function chooseVicinityZoom(coords: {lat:number; lng:number}): Promise<number> {
  // Simple heuristic: start at 12; if low road density by tile size proxy (no fetch), adjust by latitude band
  // Future: sample vector tiles/landcover within 5 km.
  const base = 12;
  const lat = Math.abs(coords.lat);
  if (lat < 20) return base - 1; // sparser areas near equator at given zoom
  if (lat > 55) return base + 0; // denser projection
  return base;
}
