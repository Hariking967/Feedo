import type {
  CrisisState,
  DonorListing,
  MatrixNode,
  MatrixResult,
  RecipientNode,
  VolunteerNode,
} from "../types/logistics";

const BASE_RADIUS_KM = 8;

function matrixCell(matrix: MatrixResult, fromId: string, toId: string) {
  const from = matrix.nodeIds.indexOf(fromId);
  const to = matrix.nodeIds.indexOf(toId);
  if (from < 0 || to < 0) return Number.POSITIVE_INFINITY;
  return matrix.durationMatrixMinutes[from][to];
}

export function buildAssignmentMatrixNodes(
  listing: DonorListing,
  recipients: RecipientNode[],
  volunteers: VolunteerNode[],
): MatrixNode[] {
  const donorNode: MatrixNode = {
    id: listing.id,
    kind: "donor",
    location: listing.location,
  };

  const recipientNodes: MatrixNode[] = recipients.map((recipient) => ({
    id: recipient.id,
    kind: "recipient",
    location: recipient.location,
  }));

  const volunteerNodes: MatrixNode[] = volunteers.map((volunteer) => ({
    id: volunteer.id,
    kind: "volunteer",
    location: volunteer.location,
  }));

  return [donorNode, ...recipientNodes, ...volunteerNodes];
}

export function selectMatrixAssignment(
  listing: DonorListing,
  recipients: RecipientNode[],
  volunteers: VolunteerNode[],
  crisis: CrisisState,
  matrix: MatrixResult,
) {
  const maxRadius = BASE_RADIUS_KM * crisis.radiusMultiplier;

  let best:
    | {
        recipient: RecipientNode;
        volunteer: VolunteerNode;
        totalMinutes: number;
        score: number;
      }
    | null = null;

  for (const recipient of recipients) {
    if (!recipient.openNow) continue;
    if (recipient.capacityMeals <= listing.quantityKg * 2) continue;
    if (!recipient.acceptedFoodTypes.includes(listing.foodType)) continue;
    if (!recipient.acceptedCategories.includes(listing.category)) continue;

    for (const volunteer of volunteers) {
      if (!volunteer.available) continue;
      if (volunteer.capacityKg < listing.quantityKg) continue;

      const toDonor = matrixCell(matrix, volunteer.id, listing.id);
      const toRecipient = matrixCell(matrix, listing.id, recipient.id);
      const totalMinutes = toDonor + toRecipient;

      if (!Number.isFinite(totalMinutes)) continue;

      // Approximate radius constraint from travel time envelope.
      if (totalMinutes > maxRadius * 7.5) continue;

      const reliabilityBoost = volunteer.reliability * 18 + listing.donorReliability * 8;
      const refrigerationBoost = recipient.refrigeration ? 7 : 0;
      const urgencyPenalty = listing.expiresInMinutes < 90 ? 0 : 8;
      const score = Math.max(0, 200 - totalMinutes + reliabilityBoost + refrigerationBoost - urgencyPenalty);

      if (!best || score > best.score) {
        best = {
          recipient,
          volunteer,
          totalMinutes,
          score: Math.round(score * 10) / 10,
        };
      }
    }
  }

  return best;
}
