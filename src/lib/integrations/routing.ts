export async function fetchDirections(start: { lat: number; lng: number }, end: { lat: number; lng: number }) {
  const params = new URLSearchParams({
    startLat: String(start.lat),
    startLng: String(start.lng),
    endLat: String(end.lat),
    endLng: String(end.lng),
  });

  const response = await fetch(`/api/routing/directions?${params.toString()}`);
  if (!response.ok) return null;
  return response.json();
}

export async function fetchMatrix(points: Array<{ lat: number; lng: number; id: string }>) {
  const response = await fetch("/api/routing/matrix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points }),
  });

  if (!response.ok) return null;
  return response.json();
}
