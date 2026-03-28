import type { CrisisState, DonorListing } from "../types/logistics";

export function computeRescueReadinessScore(listing: DonorListing, crisis: CrisisState) {
  const expiryPressure = Math.max(0, 1 - listing.expiresInMinutes / 300);
  const foodRisk = listing.foodType === "cooked" ? 1 : 0.5;
  const quantityBoost = Math.min(1, listing.quantityKg / 25);
  const reliabilityBoost = listing.donorReliability;
  const crisisBoost = crisis.active ? 0.25 : 0;

  const weighted =
    expiryPressure * 0.4 +
    foodRisk * 0.2 +
    quantityBoost * 0.15 +
    reliabilityBoost * 0.25 +
    crisisBoost;

  return Math.round(Math.min(1, weighted) * 100);
}

export function foodSafetyScreen(listing: DonorListing): "safe" | "urgent" | "not-suitable" {
  if (listing.expiresInMinutes <= 20) return "not-suitable";
  if (listing.foodType === "cooked" && listing.expiresInMinutes <= 75) return "urgent";
  if (listing.foodType === "packaged" && listing.expiresInMinutes <= 45) return "urgent";
  return "safe";
}
