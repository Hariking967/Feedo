export type FoodCategory = "protein-rich" | "balanced-meals" | "high-carb";

export type DeliveryStatus = "pending" | "assigned" | "picked" | "delivered";

export type VehicleProfile = "bike" | "scooter" | "van";

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface DonorListing {
  id: string;
  foodType: "cooked" | "packaged";
  category: FoodCategory;
  quantityKg: number;
  expiresInMinutes: number;
  prepTime: string;
  location: GeoPoint;
  donorReliability: number;
}

export interface RecipientNode {
  id: string;
  name: string;
  location: GeoPoint;
  capacityMeals: number;
  acceptedFoodTypes: Array<"cooked" | "packaged">;
  acceptedCategories: FoodCategory[];
  refrigeration: boolean;
  openNow: boolean;
}

export interface VolunteerNode {
  id: string;
  name: string;
  location: GeoPoint;
  vehicleType: VehicleProfile;
  capacityKg: number;
  reliability: number;
  available: boolean;
}

export interface RouteLeg {
  points: Array<[number, number]>;
  distanceKm: number;
  durationMinutes: number;
}

export interface CrisisState {
  active: boolean;
  severity: "normal" | "elevated" | "critical";
  reason: string;
  radiusMultiplier: number;
}

export interface AssignmentDecision {
  recipient: RecipientNode;
  volunteer: VolunteerNode;
  pickupRoute: RouteLeg | null;
  deliveryRoute: RouteLeg | null;
  totalEtaMinutes: number;
  assignmentScore: number;
}

export interface VolunteerTask {
  id: string;
  listingId: string;
  volunteerId: string;
  status: DeliveryStatus;
  updatedAt: number;
  acceptedAt?: number;
  escalated?: boolean;
  proofImageUrl?: string;
}

export interface MatrixNode {
  id: string;
  location: GeoPoint;
  kind: "volunteer" | "donor" | "recipient";
}

export interface MatrixPayload {
  nodes: MatrixNode[];
}

export interface MatrixResult {
  nodeIds: string[];
  distanceMatrixKm: number[][];
  durationMatrixMinutes: number[][];
  source: "openrouteservice" | "osrm";
}

export interface LegPlan {
  fromId: string;
  toId: string;
  distanceKm: number;
  durationMinutes: number;
}

export interface MultiStopPlan {
  sequence: string[];
  legs: LegPlan[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
}

export interface RoutingNotification {
  id: string;
  level: "info" | "warning" | "critical";
  message: string;
  createdAt: number;
}
