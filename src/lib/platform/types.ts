export type UserRole = "donor" | "recipient" | "volunteer" | "admin";

export interface LocationPoint {
  lat: number;
  lng: number;
  address: string;
  zone?: string;
}

export type DonationStatus =
  | "pending"
  | "matched"
  | "assigned"
  | "picked"
  | "delivered"
  | "expired";

export type SafetyStatus = "safe" | "pickup_soon" | "not_suitable";

export interface Donation {
  id: string;
  title: string;
  category: string;
  foodType: "cooked" | "packaged" | "raw";
  dietType: "veg" | "non_veg" | "egg";
  quantity: string;
  estimatedMeals: number;
  donor: {
    id: string;
    name: string;
    reliabilityScore: number;
  };
  status: DonationStatus;
  safetyStatus: SafetyStatus;
  readinessScore: number;
  nutritionTags: string[];
  allergens: string[];
  createdAt: string;
  expiresAt: string;
  pickupLocation: LocationPoint;
  assignedVolunteer?: string;
  assignedRecipient?: string;
  urgency: "low" | "medium" | "high" | "critical";
}

export interface Recipient {
  id: string;
  name: string;
  organization: string;
  capacity: number;
  acceptsCooked: boolean;
  acceptsPackaged: boolean;
  refrigerationAvailable: boolean;
  nutritionPreferences: string[];
  location: LocationPoint;
  open: boolean;
  verified: boolean;
}

export interface Volunteer {
  id: string;
  name: string;
  vehicleType: "bike" | "scooter" | "car" | "van";
  reliabilityScore: number;
  availabilityStatus: "available" | "assigned" | "offline";
  location: LocationPoint;
}

export interface RouteStep {
  label: string;
  etaMinutes: number;
}

export interface RouteModel {
  id: string;
  distance: number;
  duration: number;
  geometry: Array<{ lat: number; lng: number }>;
  steps: RouteStep[];
  start: LocationPoint;
  end: LocationPoint;
}

export interface NotificationModel {
  id: string;
  type: "assignment" | "match" | "urgent" | "crisis" | "delivery";
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  relatedPath: string;
}

export interface CrisisZone {
  id: string;
  zone: string;
  severity: "watch" | "high" | "critical";
  reason: string;
  impactedRecipients: number;
  lat: number;
  lng: number;
  radiusKm: number;
  active: boolean;
}
