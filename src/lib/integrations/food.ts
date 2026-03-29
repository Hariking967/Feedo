export async function lookupFoodByBarcode(code: string) {
  const response = await fetch(`/api/food/barcode/${encodeURIComponent(code)}`);
  if (!response.ok) return null;
  return response.json();
}
