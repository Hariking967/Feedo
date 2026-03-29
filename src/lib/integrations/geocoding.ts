export interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
}

export async function geocodeAddress(query: string) {
  const response = await fetch(`/api/geo/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) return [] as GeocodeResult[];
  return (await response.json()) as GeocodeResult[];
}

export async function reverseGeocode(lat: number, lng: number) {
  const response = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
  if (!response.ok) return null;
  return (await response.json()) as { displayName: string; lat: number; lng: number };
}
