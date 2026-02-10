// Parses many common latitude/longitude formats into decimal degrees
// Examples supported:
// - 37.322587, -122.025648
// - 37.322587 -122.025648
// - 37°19'21.3"N 122°01'32.3"W
// - N 37°19'21.3" W 122°01'32.3"
// - 37 19 21.3 N, 122 01 32.3 W
export type LatLng = { lat: number; lng: number } | null;

function dmsToDecimal(deg: number, min: number, sec: number, hemi?: string): number {
  let sign = 1;
  if (hemi) {
    const h = hemi.toUpperCase();
    if (h === 'S' || h === 'W') sign = -1;
  }
  const val = Math.abs(deg) + (Math.abs(min) / 60) + (Math.abs(sec) / 3600);
  return sign * (deg < 0 ? -val : val);
}

export function parseLatLng(input: string): LatLng {
  if (!input) return null;
  const v = input.trim().replace(/\s+/g, ' ');

  // 1) Decimal degrees with comma or space separator
  // e.g., 37.322587, -122.025648  OR  37.322587 -122.025648
  const dec = v.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*[ ,]\s*([+-]?\d+(?:\.\d+)?)\s*$/);
  if (dec) {
    const lat = parseFloat(dec[1]);
    const lng = parseFloat(dec[2]);
    if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }

  // 2) DMS with hemispheres, various syntaxes
  // Capture patterns like: 37°19'21.3"N 122°01'32.3"W  OR  N 37 19 21.3, W 122 01 32.3
  const dmsRegex = /(?:(N|S)\s*)?(\d{1,3})[^\d]+(\d{1,2})[^\d]+(\d{1,2}(?:\.\d+)?)\s*(N|S)?[ ,;]+(?:(E|W)\s*)?(\d{1,3})[^\d]+(\d{1,2})[^\d]+(\d{1,2}(?:\.\d+)?)\s*(E|W)?/i;
  const m = v.match(dmsRegex);
  if (m) {
    const latH1 = m[1];
    const latDeg = parseFloat(m[2]);
    const latMin = parseFloat(m[3]);
    const latSec = parseFloat(m[4]);
    const latH2 = m[5];

    const lngH1 = m[6];
    const lngDeg = parseFloat(m[7]);
    const lngMin = parseFloat(m[8]);
    const lngSec = parseFloat(m[9]);
    const lngH2 = m[10];

    const latH = (latH1 || latH2) || undefined;
    const lngH = (lngH1 || lngH2) || undefined;

    const lat = dmsToDecimal(latDeg, latMin, latSec, latH);
    const lng = dmsToDecimal(lngDeg, lngMin, lngSec, lngH);
    if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }

  return null;
}
