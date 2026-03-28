import { haversineDistanceKm } from "./distance";
import type {
  AssignmentDecision,
  CrisisState,
  DonorListing,
  RecipientNode,
  VolunteerNode,
} from "../types/logistics";

const BASE_RADIUS_KM = 8;

export function pickBestRecipient(
  listing: DonorListing,
  recipientList: RecipientNode[],
  crisis: CrisisState,
) {
  const maxRadius = BASE_RADIUS_KM * crisis.radiusMultiplier;

  return recipientList
    .filter((recipient) => recipient.openNow)
    .filter((recipient) => recipient.capacityMeals > listing.quantityKg * 2)
    .filter((recipient) => recipient.acceptedFoodTypes.includes(listing.foodType))
    .filter((recipient) => recipient.acceptedCategories.includes(listing.category))
    .map((recipient) => ({
      recipient,
      distanceKm: haversineDistanceKm(listing.location, recipient.location),
    }))
    .filter((candidate) => candidate.distanceKm <= maxRadius)
    .sort((a, b) => a.distanceKm - b.distanceKm)[0]?.recipient;
}

export function pickBestVolunteer(
  listing: DonorListing,
  volunteers: VolunteerNode[],
  recipient: RecipientNode,
) {
  return volunteers
    .filter((volunteer) => volunteer.available)
    .filter((volunteer) => volunteer.capacityKg >= listing.quantityKg)
    .map((volunteer) => {
      const donorDistance = haversineDistanceKm(volunteer.location, listing.location);
      const recipientDistance = haversineDistanceKm(listing.location, recipient.location);
      const vehicleFactor = volunteer.vehicleType === "van" ? 1 : volunteer.vehicleType === "scooter" ? 0.85 : 0.75;
      const score =
        volunteer.reliability * 0.45 +
        (1 / (1 + donorDistance + recipientDistance)) * 0.35 +
        vehicleFactor * 0.2;

      return { volunteer, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.volunteer;
}

export function createAssignmentDecision(
  listing: DonorListing,
  recipients: RecipientNode[],
  volunteers: VolunteerNode[],
  crisis: CrisisState,
): Omit<AssignmentDecision, "pickupRoute" | "deliveryRoute" | "totalEtaMinutes"> | null {
  const recipient = pickBestRecipient(listing, recipients, crisis);
  if (!recipient) return null;

  const volunteer = pickBestVolunteer(listing, volunteers, recipient);
  if (!volunteer) return null;

  const donorDistance = haversineDistanceKm(volunteer.location, listing.location);
  const deliveryDistance = haversineDistanceKm(listing.location, recipient.location);

  return {
    recipient,
    volunteer,
    assignmentScore: Math.round((1 / (1 + donorDistance + deliveryDistance)) * 1000) / 10,
  };
}
