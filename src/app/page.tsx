"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  BadgePercent,
  Clock3,
  Filter,
  Loader2,
  LogOut,
  MapPinned,
  Minus,
  Navigation,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  User,
} from "lucide-react";
import { authClient, reliableSignOut } from "@/lib/auth-client";
import { geocodeAddress } from "@/lib/integrations/geocoding";
import { useDonationsRealtime } from "@/lib/integrations/realtime";
import { WebsiteAiAssistant } from "@/components/platform/common/website-ai-assistant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const ConsumerNearbyMap = dynamic(() => import("@/components/consumer-nearby-map"), {
  ssr: false,
});

const PostPaymentTrackerMap = dynamic(() => import("@/components/post-payment-tracker-map"), {
  ssr: false,
});

const LocationPickerMap = dynamic(() => import("@/components/location-picker-map"), {
  ssr: false,
});

type ScreenMode = "consumer" | "supplier" | "volunteer";
type FoodType = "veg" | "non_veg";
type SellerType = "individual" | "caterer";
type Unit = "meals" | "kg";
type SupplierFoodCategory = "veg" | "non_veg" | "dairy" | "bakery" | "rice" | "seafood";
type PackagingCondition = "sealed" | "good" | "average" | "damaged";
type StorageCondition = "refrigerated" | "insulated" | "room_temp" | "outdoor";
type SpoilageLabel = "Fresh" | "Use Soon" | "Urgent Pickup";
type SupplierPublishMode = "standard" | "emergency" | "bulk";

interface SupplierBulkItemDraft {
  id: string;
  foodName: string;
  quantity: number;
  foodCategory: SupplierFoodCategory;
  cookedAt: string;
  packagingCondition: PackagingCondition;
  storageCondition: StorageCondition;
}

interface FoodListing {
  id: string;
  dish: string;
  sellerName: string;
  supplierUserId: string | null;
  sellerType: SellerType;
  foodType: FoodType;
  distanceKm: number;
  unitPrice: number;
  unit: Unit;
  deliveryAvailable: boolean;
  location: {
    lat: number;
    lng: number;
  };
}

interface SupplierPaymentProfile {
  userId: string;
  qrImageUrl: string;
  updatedAt: string;
}

interface SupplierPaymentReference {
  supplierId: string;
  sellerName: string;
  qrImageUrl: string | null;
  message: string;
}

interface SupplierRiskPreview {
  score: number;
  label: SpoilageLabel;
  recommendedPickupWindowMinutes: number;
  reasons: string[];
  weather: {
    temperatureC: number;
    humidityPct: number;
  };
  travel: {
    durationMinutes: number;
    distanceKm: number;
  };
}

interface SupplierListingRecord {
  id: string;
  foodName: string;
  foodCategory: string;
  quantity: number;
  spoilageScore: number;
  spoilageLabel: string;
  recommendedPickupWindowMinutes: number;
  isEmergency: boolean;
  priorityLevel: string;
  priorityState: string;
  expectedResponseMinutes: number | null;
  emergencyExpiresAt: string | null;
  status: string;
  createdAt: string;
}

interface EmergencyDispatchCandidate {
  userId: string;
  displayName: string;
  etaMinutes: number;
}

interface SupplierEmergencyResult {
  priorityLevel: string;
  priorityState: string;
  expectedResponseMinutes: number | null;
  safeWindowMinutes: number;
  assignedVolunteer: EmergencyDispatchCandidate | null;
  assignedReceiver: EmergencyDispatchCandidate | null;
  topVolunteers: EmergencyDispatchCandidate[];
  topReceivers: EmergencyDispatchCandidate[];
  notification: {
    attempted: number;
    sent: number;
    failed: number;
    mode: "fcm" | "queued" | "disabled";
  };
}

interface SupplierBulkResult {
  strategy: string;
  status: string;
  safeWindowMinutes: number;
  totalQuantity: number;
  unallocatedQuantity: number;
  expectedResponseMinutes: number | null;
  assignedVolunteer: EmergencyDispatchCandidate | null;
  allocations: Array<{
    receiverId: string;
    receiverName: string;
    allocatedQuantity: number;
    etaMinutes: number;
    allocationType: "full" | "split";
  }>;
}

interface RankedConsumerFeedItem {
  rank: number;
  rankScore: number;
  listingId: string;
  supplierUserId: string;
  supplierName: string;
  foodName: string;
  quantity: number;
  foodCategory: string;
  pickupLat: number;
  pickupLng: number;
  routeDistanceKm: number;
  routeDurationMinutes: number;
  spoilageScore: number;
  reasons?: {
    quantityScore?: number;
    suitabilityScore?: number;
    freshnessScore?: number;
    urgencyScore?: number;
    travelScore?: number;
  };
}

interface ReceiverNeedRequest {
  id: string;
  need_title: string;
  required_meals: number;
  food_preference: string;
  meal_slot: string;
  urgency_level: string;
  status: string;
  window_start_at: string;
  window_end_at: string;
}

interface ReceiverCrisisSignal {
  active: boolean;
  severity: "normal" | "elevated" | "critical";
  reason: string;
  mode: "balanced" | "survival-first";
  source: Array<"weather" | "manual-zone" | "receiver-override">;
}

interface InboundTrackingSnapshot {
  stage: "pickup_confirmed" | "en_route" | "nearing_arrival" | "delayed";
  stageLabel: string;
  pickupCompleted: boolean;
  etaMinutes: number;
  distanceKm: number;
  assignedVolunteer: {
    userId: string | null;
    displayName: string;
  };
  suitability: {
    spoilageRiskScore: number;
    warningLevel: "low" | "medium" | "high";
    warnings: string[];
  };
  lastUpdatedAt: string;
}

interface SupplierNeedPrompt {
  id: string;
  prompt_score: number;
  distance_km: number | null;
  recent_listing_count: number | null;
  avg_quantity: number | null;
  prompt_status: string;
  sent_at: string;
  need: {
    need_title: string;
    required_meals: number;
    food_preference: string;
    meal_slot: string;
    urgency_level: string;
    window_start_at: string;
    window_end_at: string;
    location_address: string | null;
  } | null;
}

interface VolunteerTaskFeedItem {
  taskId: string;
  listingId: string;
  title: string;
  supplierName: string;
  pickupAddress: string | null;
  quantity: number;
  transportMode: "bike" | "scooter" | "van" | "truck";
  carryingCapacityKg: number;
  route: {
    volunteerToPickupMinutes: number;
    volunteerToPickupKm: number;
    pickupToReceiverMinutes: number;
    pickupToReceiverKm: number;
    totalMinutes: number;
  };
  urgency: {
    emergency: boolean;
    remainingWindowMinutes: number;
    spoilageScore: number;
  };
  score: number;
  rank: number;
  reasons: {
    urgency: number;
    feasibility: number;
    loadFit: number;
    distance: number;
    spoilageSensitivity: number;
    expectedImpact: number;
    tooHeavyForVehicle: boolean;
  };
}

type VolunteerWorkflowStatus = "accepted" | "arrived_supplier" | "collected" | "in_transit" | "delivered";

interface VolunteerWeatherAdvisory {
  condition: string;
  temperatureC: number;
  windSpeedMs: number;
  rainMm1h: number;
  severity: "normal" | "elevated" | "critical";
  advisory: string;
}

interface VolunteerPooledTask {
  pooledTaskId: string;
  title: string;
  score: number;
  totalQuantity: number;
  estimatedTotalMinutes: number;
  stopOrder: Array<{ listingId: string; supplierName: string; quantity: number; stopNumber: number }>;
  subStages: string[];
}

interface SupplierAnalyticsSnapshot {
  metrics: {
    mealsContributed: number;
    successfulPickups: number;
    averageResponseMinutes: number;
    peopleServed: number;
    wastePreventedKg: number;
    co2ReductionKg: number;
  };
  trustProfile: {
    score: number;
    level: string;
  };
}

interface ReceiverAnalyticsSnapshot {
  metrics: {
    totalNeeds: number;
    activeNeeds: number;
    matchedNeeds: number;
    avgMealsPerNeed: number;
    avgPromptReach: number;
  };
  charts: {
    needTrend: Array<{ day: string; count: number }>;
    urgencyBreakdown: Array<{ label: string; value: number }>;
    foodPreferenceBreakdown: Array<{ label: string; value: number }>;
    inboundRiskBreakdown: Array<{ level: string; count: number }>;
  };
}

interface VolunteerAnalyticsSnapshot {
  metrics: {
    totalEvents: number;
    acceptedCount: number;
    deliveredCount: number;
    proofCount: number;
    avgEventsPerTask: number;
  };
  charts: {
    dailyActivity: Array<{ day: string; count: number }>;
    statusBreakdown: Array<{ label: string; value: number }>;
    routeBandBreakdown: Array<{ band: string; count: number }>;
  };
}

interface LifecycleTimelineItem {
  id?: string;
  event_type?: string;
  actor_role?: string;
  status_after?: string | null;
  listing_id?: string | null;
  occurred_at?: string;
}

interface ListingRecommendation {
  rank: number;
  score: number;
  source: "receiver-matching" | "local";
  detail: string;
}

interface TrackingOrder {
  id: string;
  listing: FoodListing;
  quantity: number;
  totalAmount: number;
  paidAt: number;
}

interface Coordinate {
  lat: number;
  lng: number;
}

type CartMap = Record<string, number>;
type StockMap = Record<string, number>;

interface CommerceState {
  cart: CartMap;
  stock: StockMap;
}

type CommerceAction =
  | { type: "reserve"; listingId: string }
  | { type: "release"; listingId: string }
  | { type: "registerStock"; listingId: string; quantity: number }
  | { type: "hydrate"; payload: CommerceState }
  | { type: "checkout" };

const COMMERCE_STORAGE_KEY = "feedo-commerce-state-v1";
const RECEIVER_CRISIS_OVERRIDE_STORAGE_KEY = "feedo-receiver-crisis-override-v1";

const seedListings: FoodListing[] = [
  {
    id: "f-101",
    dish: "Veg Biryani",
    sellerName: "Ananya Home Kitchen",
    supplierUserId: null,
    sellerType: "individual",
    foodType: "veg",
    distanceKm: 0.9,
    unitPrice: 70,
    unit: "meals",
    deliveryAvailable: false,
    location: { lat: 12.9721, lng: 77.593 },
  },
  {
    id: "f-102",
    dish: "Paneer Curry Combo",
    sellerName: "Metro Caterers",
    supplierUserId: null,
    sellerType: "caterer",
    foodType: "veg",
    distanceKm: 1.4,
    unitPrice: 95,
    unit: "meals",
    deliveryAvailable: true,
    location: { lat: 12.9754, lng: 77.5998 },
  },
  {
    id: "f-103",
    dish: "Chicken Pulao Pack",
    sellerName: "City Cloud Kitchen",
    supplierUserId: null,
    sellerType: "caterer",
    foodType: "non_veg",
    distanceKm: 2.1,
    unitPrice: 120,
    unit: "meals",
    deliveryAvailable: true,
    location: { lat: 12.9673, lng: 77.6052 },
  },
  {
    id: "f-104",
    dish: "Mixed Veg Meal Box",
    sellerName: "Ravi Family Kitchen",
    supplierUserId: null,
    sellerType: "individual",
    foodType: "veg",
    distanceKm: 2.5,
    unitPrice: 60,
    unit: "meals",
    deliveryAvailable: false,
    location: { lat: 12.9647, lng: 77.5894 },
  },
  {
    id: "f-105",
    dish: "Egg Fried Rice",
    sellerName: "Evening Rescue Hub",
    supplierUserId: null,
    sellerType: "caterer",
    foodType: "non_veg",
    distanceKm: 3.1,
    unitPrice: 75,
    unit: "meals",
    deliveryAvailable: true,
    location: { lat: 12.9812, lng: 77.6081 },
  },
];

const seedStock: StockMap = {
  "f-101": 18,
  "f-102": 24,
  "f-103": 14,
  "f-104": 12,
  "f-105": 20,
};

function commerceReducer(state: CommerceState, action: CommerceAction): CommerceState {
  if (action.type === "reserve") {
    const available = state.stock[action.listingId] ?? 0;
    if (available <= 0) return state;

    return {
      cart: {
        ...state.cart,
        [action.listingId]: (state.cart[action.listingId] ?? 0) + 1,
      },
      stock: {
        ...state.stock,
        [action.listingId]: available - 1,
      },
    };
  }

  if (action.type === "release") {
    const inCart = state.cart[action.listingId] ?? 0;
    if (inCart <= 0) return state;

    const nextCart = { ...state.cart };
    if (inCart === 1) {
      delete nextCart[action.listingId];
    } else {
      nextCart[action.listingId] = inCart - 1;
    }

    return {
      cart: nextCart,
      stock: {
        ...state.stock,
        [action.listingId]: (state.stock[action.listingId] ?? 0) + 1,
      },
    };
  }

  if (action.type === "registerStock") {
    return {
      ...state,
      stock: {
        ...state.stock,
        [action.listingId]: action.quantity,
      },
    };
  }

  if (action.type === "hydrate") {
    return action.payload;
  }

  if (action.type === "checkout") {
    return {
      ...state,
      cart: {},
    };
  }

  return state;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceBetweenKm(from: Coordinate, to: Coordinate) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const haversineTerm =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversineTerm), Math.sqrt(1 - haversineTerm));
}

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function createBulkItemDraft(): SupplierBulkItemDraft {
  return {
    id: `bulk-item-${crypto.randomUUID()}`,
    foodName: "",
    quantity: 30,
    foodCategory: "veg",
    cookedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString().slice(0, 16),
    packagingCondition: "good",
    storageCondition: "room_temp",
  };
}

function formatRelativeTime(isoValue: string) {
  const timestamp = new Date(isoValue).getTime();
  if (!Number.isFinite(timestamp)) return "just now";

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function humanizeEventKey(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FeedoLogo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <defs>
        <linearGradient id="feedo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0f766e" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="32" height="32" rx="11" fill="url(#feedo-gradient)" />
      <path d="M12 22c3-2 5-6 5-10 3 2 5 6 5 10" stroke="#ecfdf5" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M17 10v14" stroke="#ecfdf5" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [isClientHydrated, setIsClientHydrated] = useState(false);
  const [mode, setMode] = useState<ScreenMode>("consumer");
  const [isVolunteerAvailable, setIsVolunteerAvailable] = useState(true);
  const [volunteerMessage, setVolunteerMessage] = useState<string | null>(null);
  const [volunteerTransportMode, setVolunteerTransportMode] = useState<"bike" | "scooter" | "van" | "truck">("bike");
  const [volunteerCarryingCapacityKg, setVolunteerCarryingCapacityKg] = useState(18);
  const [volunteerPreferredZones, setVolunteerPreferredZones] = useState("Central Bengaluru");
  const [volunteerLocation, setVolunteerLocation] = useState<Coordinate | null>(null);
  const [volunteerTaskFeed, setVolunteerTaskFeed] = useState<VolunteerTaskFeedItem[]>([]);
  const [volunteerPooledTasks, setVolunteerPooledTasks] = useState<VolunteerPooledTask[]>([]);
  const [volunteerWeatherAdvisory, setVolunteerWeatherAdvisory] = useState<VolunteerWeatherAdvisory | null>(null);
  const [volunteerWorkflowStatusByTask, setVolunteerWorkflowStatusByTask] = useState<Record<string, VolunteerWorkflowStatus>>({});
  const [volunteerWorkflowNoteByTask, setVolunteerWorkflowNoteByTask] = useState<Record<string, string>>({});
  const [volunteerWorkflowProofByTask, setVolunteerWorkflowProofByTask] = useState<Record<string, File | null>>({});
  const [volunteerWorkflowBusyByTask, setVolunteerWorkflowBusyByTask] = useState<Record<string, boolean>>({});
  const [isVolunteerTaskFeedLoading, setIsVolunteerTaskFeedLoading] = useState(false);
  const [listings, setListings] = useState<FoodListing[]>(seedListings);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"recommended" | "distance" | "price">("recommended");
  const [rankedConsumerFeed, setRankedConsumerFeed] = useState<RankedConsumerFeedItem[]>([]);
  const [, setRankedConsumerFeedSource] = useState<string>("fallback");
  const [receiverCrisisSignal, setReceiverCrisisSignal] = useState<ReceiverCrisisSignal | null>(null);
  const [receiverCrisisOverride, setReceiverCrisisOverride] = useState<"auto" | "force_on">("auto");
  const [, setIsRankedConsumerLoading] = useState(false);
  const [consumerNeedTitle, setConsumerNeedTitle] = useState("30 meals tonight");
  const [consumerNeedMeals, setConsumerNeedMeals] = useState(30);
  const [consumerNeedFoodPreference, setConsumerNeedFoodPreference] = useState<"any" | "veg" | "non_veg" | "dairy" | "bakery" | "rice" | "seafood">("veg");
  const [consumerNeedMealSlot, setConsumerNeedMealSlot] = useState<"tonight" | "breakfast" | "lunch" | "dinner" | "custom">("tonight");
  const [consumerNeedUrgency, setConsumerNeedUrgency] = useState<"low" | "medium" | "high" | "critical">("high");
  const [consumerNeedWindowStart, setConsumerNeedWindowStart] = useState("");
  const [consumerNeedWindowEnd, setConsumerNeedWindowEnd] = useState("");
  const [consumerNeedNote, setConsumerNeedNote] = useState("");
  const [receiverNeedHistory, setReceiverNeedHistory] = useState<ReceiverNeedRequest[]>([]);
  const [isPostingConsumerNeed, setIsPostingConsumerNeed] = useState(false);
  const [consumerNeedMessage, setConsumerNeedMessage] = useState<string | null>(null);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [maxPriceFilter, setMaxPriceFilter] = useState(150);
  const [maxDistanceFilter, setMaxDistanceFilter] = useState(5);
  const [foodTypeFilter, setFoodTypeFilter] = useState<"all" | FoodType>("all");
  const [sellerTypeFilter, setSellerTypeFilter] = useState<"all" | SellerType>("all");
  const [deliveryOnlyFilter, setDeliveryOnlyFilter] = useState(false);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  const [supplierForm, setSupplierForm] = useState({
    foodName: "",
    quantity: 20,
    foodCategory: "veg" as SupplierFoodCategory,
    cookedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString().slice(0, 16),
    packagingCondition: "good" as PackagingCondition,
    storageCondition: "room_temp" as StorageCondition,
    pickupAddress: "",
    pickupLocation: null as Coordinate | null,
    price: 0,
  });
  const [supplierMessage, setSupplierMessage] = useState<string | null>(null);
  const [isPublishingSupplierListing, setIsPublishingSupplierListing] = useState(false);
  const [supplierPublishMode, setSupplierPublishMode] = useState<SupplierPublishMode>("standard");
  const [supplierEmergencyWindowMinutes, setSupplierEmergencyWindowMinutes] = useState(60);
  const [supplierEmergencyResult, setSupplierEmergencyResult] = useState<SupplierEmergencyResult | null>(null);
  const [supplierBulkEventName, setSupplierBulkEventName] = useState("Wedding or Event Surplus");
  const [supplierBulkItems, setSupplierBulkItems] = useState<SupplierBulkItemDraft[]>([createBulkItemDraft()]);
  const [supplierBulkWindowMinutes, setSupplierBulkWindowMinutes] = useState(120);
  const [supplierBulkResult, setSupplierBulkResult] = useState<SupplierBulkResult | null>(null);
  const [isPublishingBulkEvent, setIsPublishingBulkEvent] = useState(false);
  const [isTriggeringEmergencyListing, setIsTriggeringEmergencyListing] = useState(false);
  const [isResolvingSupplierAddress, setIsResolvingSupplierAddress] = useState(false);
  const [supplierRiskPreview, setSupplierRiskPreview] = useState<SupplierRiskPreview | null>(null);
  const [isSupplierRiskLoading, setIsSupplierRiskLoading] = useState(false);
  const [supplierListings, setSupplierListings] = useState<SupplierListingRecord[]>([]);
  const [supplierNeedPrompts, setSupplierNeedPrompts] = useState<SupplierNeedPrompt[]>([]);
  const [isLoadingSupplierNeedPrompts, setIsLoadingSupplierNeedPrompts] = useState(false);
  const [supplierPaymentProfile, setSupplierPaymentProfile] = useState<SupplierPaymentProfile | null>(null);
  const [supplierAnalytics, setSupplierAnalytics] = useState<SupplierAnalyticsSnapshot | null>(null);
  const [receiverAnalytics, setReceiverAnalytics] = useState<ReceiverAnalyticsSnapshot | null>(null);
  const [volunteerAnalytics, setVolunteerAnalytics] = useState<VolunteerAnalyticsSnapshot | null>(null);
  const [isRoleAnalyticsLoading, setIsRoleAnalyticsLoading] = useState(false);
  const [workspaceTimeline, setWorkspaceTimeline] = useState<LifecycleTimelineItem[]>([]);
  const [isWorkspaceTimelineLoading, setIsWorkspaceTimelineLoading] = useState(false);
  const [supplierQrDraft, setSupplierQrDraft] = useState<string | null>(null);
  const [supplierQrFileName, setSupplierQrFileName] = useState<string>("");
  const [supplierQrMessage, setSupplierQrMessage] = useState<string | null>(null);
  const [isSavingSupplierQr, setIsSavingSupplierQr] = useState(false);

  const [paymentReferences, setPaymentReferences] = useState<SupplierPaymentReference[]>([]);
  const [isPaying, setIsPaying] = useState(false);

  const [trackingOrder, setTrackingOrder] = useState<TrackingOrder | null>(null);
  const [trackingLocation, setTrackingLocation] = useState<Coordinate | null>(null);
  const [trackingRoutePoints, setTrackingRoutePoints] = useState<Array<[number, number]>>([]);
  const [trackingDistanceKm, setTrackingDistanceKm] = useState<number | null>(null);
  const [trackingEtaMinutes, setTrackingEtaMinutes] = useState<number | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [arrivedAtPickup, setArrivedAtPickup] = useState(false);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [inboundTracking, setInboundTracking] = useState<InboundTrackingSnapshot | null>(null);
  const [isInboundTrackingLoading, setIsInboundTrackingLoading] = useState(false);

  const lastRouteFetchAtRef = useRef(0);
  const lastRouteOriginRef = useRef<Coordinate | null>(null);
  const lastInboundStageRef = useRef<InboundTrackingSnapshot["stage"] | null>(null);

  const receiverAuthHeaders = useMemo(() => {
    if (!session?.user?.id) return {} as Record<string, string>;

    return {
      "x-feedo-user-id": session.user.id,
      "x-feedo-user-name": session.user.name ?? "Receiver",
    };
  }, [session?.user?.id, session?.user?.name]);

  const workspaceLifecycleRole = useMemo(() => {
    if (mode === "consumer") return "receiver";
    if (mode === "supplier") return "supplier";
    return "volunteer";
  }, [mode]);

  const [commerceState, dispatch] = useReducer(commerceReducer, {
    cart: {},
    stock: seedStock,
  });
  const stockRef = useRef(commerceState.stock);

  useEffect(() => {
    stockRef.current = commerceState.stock;
  }, [commerceState.stock]);

  useEffect(() => {
    setIsClientHydrated(true);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setWorkspaceTimeline([]);
      return;
    }

    let cancelled = false;

    const loadWorkspaceTimeline = async () => {
      setIsWorkspaceTimelineLoading(true);
      try {
        const response = await fetch(`/api/lifecycle?limit=6&actorRole=${workspaceLifecycleRole}`, {
          cache: "no-store",
          headers: receiverAuthHeaders,
        });
        if (!response.ok) throw new Error("Lifecycle feed unavailable");

        const payload = (await response.json()) as { timeline?: LifecycleTimelineItem[] };
        if (cancelled) return;
        setWorkspaceTimeline(Array.isArray(payload.timeline) ? payload.timeline : []);
      } catch {
        if (!cancelled) setWorkspaceTimeline([]);
      } finally {
        if (!cancelled) setIsWorkspaceTimelineLoading(false);
      }
    };

    void loadWorkspaceTimeline();
    const interval = window.setInterval(() => {
      void loadWorkspaceTimeline();
    }, 120000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [receiverAuthHeaders, session?.user?.id, workspaceLifecycleRole]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedCommerce = window.localStorage.getItem(COMMERCE_STORAGE_KEY);
    if (savedCommerce) {
      try {
        const parsed = JSON.parse(savedCommerce) as CommerceState;
        if (parsed.cart && parsed.stock) {
          dispatch({ type: "hydrate", payload: parsed });
        }
      } catch {
        // keep defaults
      }
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== COMMERCE_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as CommerceState;
        if (parsed.cart && parsed.stock) {
          dispatch({ type: "hydrate", payload: parsed });
        }
      } catch {
        // ignore invalid payload
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COMMERCE_STORAGE_KEY, JSON.stringify(commerceState));
  }, [commerceState]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = window.localStorage.getItem(RECEIVER_CRISIS_OVERRIDE_STORAGE_KEY);
    if (saved === "force_on" || saved === "auto") {
      setReceiverCrisisOverride(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RECEIVER_CRISIS_OVERRIDE_STORAGE_KEY, receiverCrisisOverride);
  }, [receiverCrisisOverride]);

  useEffect(() => {
    if (!session?.user?.id) return;

    let cancelled = false;
    const loadSupplierPaymentProfile = async () => {
      try {
        const response = await fetch("/api/payment-profile", { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json()) as { profile?: SupplierPaymentProfile | null };
        if (!cancelled) {
          setSupplierPaymentProfile(payload.profile ?? null);
        }
      } catch {
        if (!cancelled) {
          setSupplierPaymentProfile(null);
        }
      }
    };

    void loadSupplierPaymentProfile();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const loadSupplierListings = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const response = await fetch("/api/food/listings?status=active", { cache: "no-store" });
      if (!response.ok) return;

      const payload = (await response.json()) as { listings?: SupplierListingRecord[] };
      setSupplierListings(payload.listings ?? []);
    } catch {
      // ignore non-blocking listing refresh failure
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || mode !== "supplier") return;
    void loadSupplierListings();
  }, [loadSupplierListings, mode, session?.user?.id]);

  const loadRankedConsumerFeed = useCallback(async () => {
    if (!session?.user?.id) return;

    setIsRankedConsumerLoading(true);
    try {
      const params = new URLSearchParams();
      if (receiverCrisisOverride === "force_on") {
        params.set("crisisOverride", "force_on");
      }

      const feedUrl = params.size ? `/api/receiver/feed?${params.toString()}` : "/api/receiver/feed";

      const response = await fetch(feedUrl, {
        cache: "no-store",
        headers: receiverAuthHeaders,
      });

      if (!response.ok) {
        setRankedConsumerFeed([]);
        setRankedConsumerFeedSource("fallback");
        return;
      }

      const payload = (await response.json()) as {
        source?: string;
        rankedFeed?: RankedConsumerFeedItem[];
        crisis?: ReceiverCrisisSignal;
      };

      const rankedFeed = Array.isArray(payload.rankedFeed) ? payload.rankedFeed : [];
      setRankedConsumerFeed(rankedFeed);
      setRankedConsumerFeedSource(payload.source ?? "matching");
      setReceiverCrisisSignal(payload.crisis ?? null);

      if (rankedFeed.length) {
        setListings((current) => {
          const byId = new Map(current.map((item) => [item.id, item]));

          for (const item of rankedFeed) {
            const existing = byId.get(item.listingId);
            const listingFoodType: FoodType = item.foodCategory === "non_veg" || item.foodCategory === "seafood" ? "non_veg" : "veg";

            byId.set(item.listingId, {
              id: item.listingId,
              dish: item.foodName,
              sellerName: item.supplierName,
              supplierUserId: item.supplierUserId,
              sellerType: "caterer",
              foodType: listingFoodType,
              distanceKm: Number(item.routeDistanceKm.toFixed(1)),
              unitPrice: existing?.unitPrice ?? 0,
              unit: "meals",
              deliveryAvailable: existing?.deliveryAvailable ?? false,
              location: {
                lat: item.pickupLat,
                lng: item.pickupLng,
              },
            });

            if (stockRef.current[item.listingId] == null) {
              dispatch({ type: "registerStock", listingId: item.listingId, quantity: Math.max(1, item.quantity) });
            }
          }

          return [...byId.values()];
        });
      }
    } catch {
      setRankedConsumerFeed([]);
      setRankedConsumerFeedSource("fallback");
      setReceiverCrisisSignal(null);
    } finally {
      setIsRankedConsumerLoading(false);
    }
  }, [receiverAuthHeaders, receiverCrisisOverride, session?.user?.id]);

  const loadSupplierNeedPrompts = useCallback(async () => {
    if (!session?.user?.id) return;

    setIsLoadingSupplierNeedPrompts(true);
    try {
      const response = await fetch("/api/supplier/need-prompts", { cache: "no-store" });
      if (!response.ok) {
        setSupplierNeedPrompts([]);
        return;
      }

      const payload = (await response.json()) as {
        prompts?: SupplierNeedPrompt[];
      };

      setSupplierNeedPrompts(Array.isArray(payload.prompts) ? payload.prompts : []);
    } catch {
      setSupplierNeedPrompts([]);
    } finally {
      setIsLoadingSupplierNeedPrompts(false);
    }
  }, [session?.user?.id]);

  const saveVolunteerProfile = useCallback(async () => {
    if (!session?.user?.id) return;

    const preferredZones = volunteerPreferredZones
      .split(",")
      .map((zone) => zone.trim())
      .filter(Boolean)
      .slice(0, 12);

    try {
      await fetch("/api/volunteer/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...receiverAuthHeaders,
        },
        body: JSON.stringify({
          transportMode: volunteerTransportMode,
          carryingCapacityKg: Math.max(5, volunteerCarryingCapacityKg),
          preferredZones,
          active: isVolunteerAvailable,
          location: volunteerLocation ?? undefined,
        }),
      });
    } catch {
      // Profile save is best effort for ranking quality.
    }
  }, [isVolunteerAvailable, receiverAuthHeaders, session?.user?.id, volunteerCarryingCapacityKg, volunteerLocation, volunteerPreferredZones, volunteerTransportMode]);

  const loadVolunteerTaskFeed = useCallback(async () => {
    if (!session?.user?.id || mode !== "volunteer") return;

    setIsVolunteerTaskFeedLoading(true);
    try {
      const params = new URLSearchParams();
      if (volunteerLocation) {
        params.set("lat", volunteerLocation.lat.toString());
        params.set("lng", volunteerLocation.lng.toString());
      }

      const taskUrl = params.size ? `/api/volunteer/tasks?${params.toString()}` : "/api/volunteer/tasks";
      const response = await fetch(taskUrl, {
        cache: "no-store",
        headers: receiverAuthHeaders,
      });

      if (!response.ok) {
        setVolunteerTaskFeed([]);
        return;
      }

      const payload = (await response.json()) as {
        profile?: {
          transportMode?: "bike" | "scooter" | "van" | "truck";
          carryingCapacityKg?: number;
          active?: boolean;
          preferredZones?: string[];
        };
        weather?: VolunteerWeatherAdvisory;
        pooledTasks?: VolunteerPooledTask[];
        tasks?: VolunteerTaskFeedItem[];
      };

      const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      setVolunteerTaskFeed(tasks);
      setVolunteerWeatherAdvisory(payload.weather ?? null);
      setVolunteerPooledTasks(Array.isArray(payload.pooledTasks) ? payload.pooledTasks : []);

      if (payload.profile?.transportMode) {
        setVolunteerTransportMode(payload.profile.transportMode);
      }

      if (typeof payload.profile?.carryingCapacityKg === "number") {
        setVolunteerCarryingCapacityKg(Math.max(5, Math.round(payload.profile.carryingCapacityKg)));
      }

      if (typeof payload.profile?.active === "boolean") {
        setIsVolunteerAvailable(payload.profile.active);
      }

      if (Array.isArray(payload.profile?.preferredZones) && payload.profile.preferredZones.length) {
        setVolunteerPreferredZones(payload.profile.preferredZones.join(", "));
      }
    } catch {
      setVolunteerTaskFeed([]);
      setVolunteerPooledTasks([]);
      setVolunteerWeatherAdvisory(null);
    } finally {
      setIsVolunteerTaskFeedLoading(false);
    }
  }, [mode, receiverAuthHeaders, session?.user?.id, volunteerLocation]);

  const submitVolunteerWorkflowUpdate = useCallback(
    async (task: VolunteerTaskFeedItem) => {
      if (!session?.user?.id) return;

      const status = volunteerWorkflowStatusByTask[task.taskId] ?? "accepted";
      const proofFile = volunteerWorkflowProofByTask[task.taskId];
      const proofNote = (volunteerWorkflowNoteByTask[task.taskId] ?? "").trim();

      setVolunteerWorkflowBusyByTask((current) => ({ ...current, [task.taskId]: true }));
      setVolunteerMessage(null);

      try {
        const proofImageDataUrl = proofFile ? await readImageAsDataUrl(proofFile) : undefined;
        const response = await fetch("/api/volunteer/workflow", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...receiverAuthHeaders,
          },
          body: JSON.stringify({
            taskId: task.taskId,
            listingId: task.listingId,
            status,
            subStage: `single_${status}`,
            proofImageDataUrl,
            proofNote: proofNote || undefined,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setVolunteerMessage(payload?.error ?? "Unable to update workflow stage.");
          return;
        }

        setVolunteerMessage(`Workflow updated for ${task.title}: ${status.replace("_", " ")}.`);
        setVolunteerWorkflowProofByTask((current) => ({ ...current, [task.taskId]: null }));
        await loadVolunteerTaskFeed();
      } catch {
        setVolunteerMessage("Unable to update workflow stage.");
      } finally {
        setVolunteerWorkflowBusyByTask((current) => ({ ...current, [task.taskId]: false }));
      }
    },
    [
      loadVolunteerTaskFeed,
      receiverAuthHeaders,
      session?.user?.id,
      volunteerWorkflowNoteByTask,
      volunteerWorkflowProofByTask,
      volunteerWorkflowStatusByTask,
    ],
  );

  const loadReceiverNeedHistory = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const response = await fetch("/api/receiver/needs", {
        cache: "no-store",
        headers: receiverAuthHeaders,
      });
      if (!response.ok) {
        setReceiverNeedHistory([]);
        return;
      }

      const payload = (await response.json()) as { needs?: ReceiverNeedRequest[] };
      setReceiverNeedHistory(Array.isArray(payload.needs) ? payload.needs : []);
    } catch {
      setReceiverNeedHistory([]);
    }
  }, [receiverAuthHeaders, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || mode !== "consumer") return;

    const now = new Date();
    now.setMinutes(now.getMinutes() + 60, 0, 0);
    const end = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    setConsumerNeedWindowStart((current) => current || now.toISOString().slice(0, 16));
    setConsumerNeedWindowEnd((current) => current || end.toISOString().slice(0, 16));

    const syncReceiverPreferences = async () => {
      const fallbackLocation = listings[0]?.location ?? { lat: 12.9716, lng: 77.5946 };
      await fetch("/api/receiver/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...receiverAuthHeaders,
        },
        body: JSON.stringify({
          role: "recipient",
          displayName: session.user.name ?? "Consumer Receiver",
          capacity: Math.max(20, consumerNeedMeals),
          requiredMeals: Math.max(20, consumerNeedMeals),
          acceptedFoodCategories: ["veg", "non_veg", "dairy", "bakery", "rice", "seafood"],
          maxTravelMinutes: 70,
          location: fallbackLocation,
          active: true,
        }),
      }).catch(() => {
        // Best-effort preference sync.
      });
    };

    void Promise.all([syncReceiverPreferences(), loadRankedConsumerFeed(), loadReceiverNeedHistory()]);

    const timer = window.setInterval(() => {
      void loadRankedConsumerFeed();
      void loadReceiverNeedHistory();
    }, 120000);

    return () => {
      window.clearInterval(timer);
    };
  }, [consumerNeedMeals, listings, loadRankedConsumerFeed, loadReceiverNeedHistory, mode, receiverAuthHeaders, session?.user?.id, session?.user?.name]);

  useEffect(() => {
    if (!session?.user?.id || mode !== "supplier") return;

    void loadSupplierNeedPrompts();
    const timer = window.setInterval(() => {
      void loadSupplierNeedPrompts();
    }, 120000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadSupplierNeedPrompts, mode, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    let cancelled = false;
    const loadRoleAnalytics = async () => {
      setIsRoleAnalyticsLoading(true);
      try {
        if (mode === "supplier") {
          const response = await fetch("/api/supplier/analytics", { cache: "no-store" });
          if (response.ok) {
            const payload = (await response.json()) as SupplierAnalyticsSnapshot;
            if (!cancelled) setSupplierAnalytics(payload);
          }
          return;
        }

        if (mode === "consumer") {
          const response = await fetch("/api/receiver/analytics", {
            cache: "no-store",
            headers: receiverAuthHeaders,
          });
          if (response.ok) {
            const payload = (await response.json()) as ReceiverAnalyticsSnapshot;
            if (!cancelled) setReceiverAnalytics(payload);
          }
          return;
        }

        const response = await fetch("/api/volunteer/analytics", {
          cache: "no-store",
          headers: receiverAuthHeaders,
        });
        if (response.ok) {
          const payload = (await response.json()) as VolunteerAnalyticsSnapshot;
          if (!cancelled) setVolunteerAnalytics(payload);
        }
      } catch {
        // Analytics are non-blocking.
      } finally {
        if (!cancelled) setIsRoleAnalyticsLoading(false);
      }
    };

    void loadRoleAnalytics();
    return () => {
      cancelled = true;
    };
  }, [mode, receiverAuthHeaders, session?.user?.id]);

  useEffect(() => {
    if (mode !== "volunteer") return;
    if (typeof window === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setVolunteerLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setVolunteerLocation((current) => current ?? { lat: 12.9716, lng: 77.5946 });
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 120000 },
    );
  }, [mode]);

  useEffect(() => {
    if (!session?.user?.id || mode !== "volunteer") return;

    void saveVolunteerProfile();
    void loadVolunteerTaskFeed();
    const timer = window.setInterval(() => {
      void loadVolunteerTaskFeed();
    }, 120000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isVolunteerAvailable, loadVolunteerTaskFeed, mode, saveVolunteerProfile, session?.user?.id, volunteerCarryingCapacityKg, volunteerPreferredZones, volunteerTransportMode]);

  const postConsumerNeed = async () => {
    if (!session?.user?.id) {
      setConsumerNeedMessage("Sign in is required to post needs.");
      return;
    }

    const startAt = new Date(consumerNeedWindowStart);
    const endAt = new Date(consumerNeedWindowEnd);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      setConsumerNeedMessage("Invalid need window. End must be after start.");
      return;
    }

    const fallbackLocation = listings[0]?.location ?? { lat: 12.9716, lng: 77.5946 };

    setIsPostingConsumerNeed(true);
    setConsumerNeedMessage(null);
    try {
      const response = await fetch("/api/receiver/needs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...receiverAuthHeaders,
        },
        body: JSON.stringify({
          needTitle: consumerNeedTitle.trim() || `${consumerNeedMeals} meals needed`,
          requiredMeals: Math.max(1, consumerNeedMeals),
          foodPreference: consumerNeedFoodPreference,
          mealSlot: consumerNeedMealSlot,
          crisisOverride: receiverCrisisOverride,
          windowStartAt: startAt.toISOString(),
          windowEndAt: endAt.toISOString(),
          urgencyLevel: consumerNeedUrgency,
          note: consumerNeedNote.trim() || undefined,
          location: {
            lat: fallbackLocation.lat,
            lng: fallbackLocation.lng,
            address: "Consumer pickup zone",
          },
          radiusKm: Math.max(4, maxDistanceFilter),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        matching?: { targetedSupplierCount?: number };
        crisis?: { active?: boolean; severity?: string };
        emergencyDispatch?: { sent?: number; queued?: number; attempted?: number };
      } | null;

      if (!response.ok) {
        setConsumerNeedMessage(payload?.error ?? "Unable to post receiver need.");
        return;
      }

      setConsumerNeedNote("");
      const targetedCount = payload?.matching?.targetedSupplierCount ?? 0;
      const crisisSent = payload?.emergencyDispatch?.sent ?? 0;
      const crisisQueued = payload?.emergencyDispatch?.queued ?? 0;

      setConsumerNeedMessage(
        payload?.crisis?.active
          ? `Need posted in crisis mode. Prompted ${targetedCount} suppliers; emergency alerts sent ${crisisSent}, queued ${crisisQueued}.`
          : `Need posted. Prompted ${targetedCount} likely suppliers.`,
      );
      await Promise.all([loadReceiverNeedHistory(), loadRankedConsumerFeed()]);
    } catch {
      setConsumerNeedMessage("Need posting failed. Please retry.");
    } finally {
      setIsPostingConsumerNeed(false);
    }
  };

  const recommendationByListingId = useMemo(() => {
    const map = new Map<string, ListingRecommendation>();

    for (const entry of rankedConsumerFeed) {
      const reason = entry.reasons
        ? `Fit ${entry.reasons.quantityScore ?? 0}% · Suitability ${entry.reasons.suitabilityScore ?? 0}% · Travel ${entry.routeDurationMinutes}m`
        : `Travel ${entry.routeDurationMinutes}m · Distance ${entry.routeDistanceKm.toFixed(1)} km`;

      map.set(entry.listingId, {
        rank: entry.rank,
        score: entry.rankScore,
        source: "receiver-matching",
        detail: reason,
      });
    }

    const localScored = listings.map((listing) => {
      const distanceScore = Math.max(0, 1 - listing.distanceKm / Math.max(1, maxDistanceFilter));
      const priceScore = Math.max(0, 1 - listing.unitPrice / Math.max(1, maxPriceFilter));
      const deliveryBoost = listing.deliveryAvailable ? 0.08 : 0;
      const score = Math.round(Math.min(1, distanceScore * 0.55 + priceScore * 0.37 + deliveryBoost) * 100);
      return { listingId: listing.id, score };
    });

    localScored.sort((a, b) => b.score - a.score);
    let nextRank = map.size + 1;

    for (const item of localScored) {
      if (map.has(item.listingId)) continue;

      map.set(item.listingId, {
        rank: nextRank,
        score: item.score,
        source: "local",
        detail: "Fallback recommendation based on distance, price, and availability.",
      });
      nextRank += 1;
    }

    return map;
  }, [listings, maxDistanceFilter, maxPriceFilter, rankedConsumerFeed]);

  useEffect(() => {
    if (!session?.user?.id || mode !== "supplier") return;
    if (supplierPublishMode === "bulk") {
      setSupplierRiskPreview(null);
      return;
    }
    if (!supplierForm.foodName.trim() || !supplierForm.pickupLocation) {
      setSupplierRiskPreview(null);
      return;
    }

    const cookedAtDate = new Date(supplierForm.cookedAt);
    if (Number.isNaN(cookedAtDate.getTime())) {
      setSupplierRiskPreview(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSupplierRiskLoading(true);

      try {
        const response = await fetch("/api/food/risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            foodCategory: supplierForm.foodCategory,
            cookedAt: cookedAtDate.toISOString(),
            packagingCondition: supplierForm.packagingCondition,
            storageCondition: supplierForm.storageCondition,
            pickupLocation: supplierForm.pickupLocation,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          setSupplierRiskPreview(null);
          return;
        }

        const payload = (await response.json()) as SupplierRiskPreview;
        setSupplierRiskPreview(payload);
      } catch {
        setSupplierRiskPreview(null);
      } finally {
        setIsSupplierRiskLoading(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [
    mode,
    session?.user?.id,
    supplierPublishMode,
    supplierForm.cookedAt,
    supplierForm.foodCategory,
    supplierForm.foodName,
    supplierForm.packagingCondition,
    supplierForm.pickupLocation,
    supplierForm.storageCondition,
  ]);

  useEffect(() => {
    if (!session?.user?.id || mode !== "supplier") return;

    const intervalId = window.setInterval(async () => {
      try {
        await fetch("/api/food/listings/recalculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        await loadSupplierListings();
      } catch {
        // background refresh is best-effort
      }
    }, 180000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadSupplierListings, mode, session?.user?.id]);

  const resolveSupplierPickupAddress = async () => {
    const query = supplierForm.pickupAddress.trim();
    if (!query) {
      setSupplierMessage("Enter pickup address text before resolving location.");
      return;
    }

    setIsResolvingSupplierAddress(true);
    setSupplierMessage(null);

    try {
      const candidates = await geocodeAddress(query);
      if (!candidates.length) {
        setSupplierMessage("No location match found. Try a more specific address.");
        return;
      }

      const top = candidates[0];
      setSupplierForm((current) => ({
        ...current,
        pickupAddress: top.displayName,
        pickupLocation: { lat: top.lat, lng: top.lng },
      }));
      setSupplierMessage("Pickup address resolved. You can adjust the pin on map.");
    } catch {
      setSupplierMessage("Could not resolve pickup address right now.");
    } finally {
      setIsResolvingSupplierAddress(false);
    }
  };

  useEffect(() => {
    if (!trackingOrder) return;

    setTrackingError(null);
    setArrivedAtPickup(false);
    setReviewStars(0);
    setReviewSubmitted(false);
    setTrackingRoutePoints([]);
    setTrackingDistanceKm(null);
    setTrackingEtaMinutes(null);
    setInboundTracking(null);
    lastRouteFetchAtRef.current = 0;
    lastRouteOriginRef.current = null;
    lastInboundStageRef.current = null;

    if (typeof window === "undefined" || !navigator.geolocation) {
      setTrackingError("Live location is unavailable on this device.");
      setTrackingLocation({ lat: 12.9716, lng: 77.5946 });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setTrackingLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setTrackingError("Location permission denied. Using fallback location.");
        setTrackingLocation((current) => current ?? { lat: 12.9716, lng: 77.5946 });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [trackingOrder]);

  useEffect(() => {
    if (!trackingOrder || !trackingLocation) return;

    const destination = trackingOrder.listing.location;
    const directDistanceKm = distanceBetweenKm(trackingLocation, destination);
    const roundedDirectDistance = Number(directDistanceKm.toFixed(2));
    setTrackingDistanceKm(roundedDirectDistance);

    if (directDistanceKm <= 0.12) {
      setArrivedAtPickup(true);
    }

    const now = Date.now();
    const movedSinceLastFetch = lastRouteOriginRef.current
      ? distanceBetweenKm(lastRouteOriginRef.current, trackingLocation)
      : Number.POSITIVE_INFINITY;

    if (now - lastRouteFetchAtRef.current < 20000 && movedSinceLastFetch < 0.12) {
      return;
    }

    lastRouteFetchAtRef.current = now;
    lastRouteOriginRef.current = trackingLocation;

    let cancelled = false;
    const updateLiveRoute = async () => {
      const params = new URLSearchParams({
        startLat: trackingLocation.lat.toString(),
        startLng: trackingLocation.lng.toString(),
        endLat: destination.lat.toString(),
        endLng: destination.lng.toString(),
      });

      try {
        const response = await fetch(`/api/logistics/route?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Route unavailable");
        }

        const route = (await response.json()) as {
          points?: Array<[number, number]>;
          distanceKm?: number;
          durationMinutes?: number;
        };

        if (cancelled) return;

        setTrackingRoutePoints(route.points ?? []);
        setTrackingDistanceKm(
          typeof route.distanceKm === "number" ? Number(route.distanceKm.toFixed(2)) : roundedDirectDistance,
        );
        setTrackingEtaMinutes(
          typeof route.durationMinutes === "number"
            ? Math.max(1, route.durationMinutes)
            : Math.max(1, Math.round((roundedDirectDistance / 18) * 60)),
        );
        setTrackingError(null);
      } catch {
        if (cancelled) return;
        setTrackingEtaMinutes(Math.max(1, Math.round((roundedDirectDistance / 18) * 60)));
        setTrackingError((current) => current ?? "Live route updates are delayed. Distance is based on direct location.");
      }
    };

    void updateLiveRoute();
    return () => {
      cancelled = true;
    };
  }, [receiverAuthHeaders, trackingLocation, trackingOrder]);

  const loadInboundTracking = useCallback(async () => {
    if (!trackingOrder || !trackingLocation) {
      setInboundTracking(null);
      return;
    }

    setIsInboundTrackingLoading(true);
    try {
      const params = new URLSearchParams({
        listingId: trackingOrder.listing.id,
        startLat: trackingLocation.lat.toString(),
        startLng: trackingLocation.lng.toString(),
        endLat: trackingOrder.listing.location.lat.toString(),
        endLng: trackingOrder.listing.location.lng.toString(),
      });

      if (lastInboundStageRef.current) {
        params.set("previousStage", lastInboundStageRef.current);
      }

      const response = await fetch(`/api/receiver/inbound-tracking?${params.toString()}`, {
        cache: "no-store",
        headers: receiverAuthHeaders,
      });
      if (!response.ok) {
        setInboundTracking(null);
        return;
      }

      const payload = (await response.json()) as InboundTrackingSnapshot;
      setInboundTracking(payload);
      lastInboundStageRef.current = payload.stage;
    } catch {
      setInboundTracking(null);
    } finally {
      setIsInboundTrackingLoading(false);
    }
  }, [receiverAuthHeaders, trackingLocation, trackingOrder]);

  useDonationsRealtime(() => {
    if (!trackingOrder) return;
    void loadInboundTracking();
  });

  useEffect(() => {
    if (!trackingOrder || !trackingLocation) return;

    void loadInboundTracking();
    const timer = window.setInterval(() => {
      void loadInboundTracking();
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadInboundTracking, trackingLocation, trackingOrder]);

  const handleLogout = async () => {
    await reliableSignOut("/auth/sign-in");
    router.refresh();
  };

  const consumerListings = useMemo(() => {
    const bySearchAndFilter = listings.filter((listing) => {
      const searchMatch = listing.dish.toLowerCase().includes(searchText.toLowerCase());
      const priceMatch = listing.unitPrice <= maxPriceFilter;
      const distanceMatch = listing.distanceKm <= maxDistanceFilter;
      const foodMatch = foodTypeFilter === "all" || listing.foodType === foodTypeFilter;
      const sellerMatch = sellerTypeFilter === "all" || listing.sellerType === sellerTypeFilter;
      const deliveryMatch = !deliveryOnlyFilter || listing.deliveryAvailable;

      return searchMatch && priceMatch && distanceMatch && foodMatch && sellerMatch && deliveryMatch;
    });

    return [...bySearchAndFilter].sort((a, b) => {
      if (sortBy === "recommended") {
        const aScore = recommendationByListingId.get(a.id)?.score ?? 0;
        const bScore = recommendationByListingId.get(b.id)?.score ?? 0;
        if (aScore !== bScore) return bScore - aScore;
        return a.distanceKm - b.distanceKm;
      }
      if (sortBy === "distance") return a.distanceKm - b.distanceKm;
      return a.unitPrice - b.unitPrice;
    });
  }, [
    deliveryOnlyFilter,
    foodTypeFilter,
    listings,
    maxDistanceFilter,
    maxPriceFilter,
    recommendationByListingId,
    searchText,
    sellerTypeFilter,
    sortBy,
  ]);

  const cartItems = useMemo(() => {
    return Object.entries(commerceState.cart)
      .map(([listingId, quantity]) => {
        const listing = listings.find((item) => item.id === listingId);
        if (!listing) return null;
        return {
          listing,
          quantity,
          lineTotal: listing.unitPrice * quantity,
        };
      })
      .filter((item): item is { listing: FoodListing; quantity: number; lineTotal: number } => Boolean(item));
  }, [commerceState.cart, listings]);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const volunteerQueue = volunteerTaskFeed;

  const subTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [cartItems],
  );
  const convenienceFee = useMemo(() => (subTotal > 0 ? 12 : 0), [subTotal]);
  const totalAmount = useMemo(() => subTotal + convenienceFee, [subTotal, convenienceFee]);

  const reserveListing = (listingId: string) => {
    dispatch({ type: "reserve", listingId });
  };

  const releaseListing = (listingId: string) => {
    dispatch({ type: "release", listingId });
  };

  const handleSupplierQrFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSupplierQrDraft(null);
      setSupplierQrFileName("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setSupplierQrMessage("Please upload an image file.");
      setSupplierQrDraft(null);
      setSupplierQrFileName("");
      return;
    }

    if (file.size > 2_000_000) {
      setSupplierQrMessage("QR image should be under 2 MB.");
      setSupplierQrDraft(null);
      setSupplierQrFileName("");
      return;
    }

    try {
      const imageDataUrl = await readImageAsDataUrl(file);
      if (!imageDataUrl.startsWith("data:image/")) {
        setSupplierQrMessage("Unsupported image format. Please upload a valid image.");
        setSupplierQrDraft(null);
        setSupplierQrFileName("");
        return;
      }

      setSupplierQrDraft(imageDataUrl);
      setSupplierQrFileName(file.name);
      setSupplierQrMessage("QR ready to upload. Save to update your supplier profile.");
    } catch {
      setSupplierQrMessage("Unable to read QR image. Please try another file.");
      setSupplierQrDraft(null);
      setSupplierQrFileName("");
    }
  };

  const saveSupplierQrProfile = async () => {
    if (!supplierQrDraft) {
      setSupplierQrMessage("Choose a QR image first.");
      return;
    }

    setIsSavingSupplierQr(true);
    setSupplierQrMessage(null);

    try {
      const response = await fetch("/api/payment-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ qrImageUrl: supplierQrDraft }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to save supplier QR profile.");
      }

      const payload = (await response.json()) as { profile?: SupplierPaymentProfile | null };
      setSupplierPaymentProfile(payload.profile ?? null);
      setSupplierQrDraft(null);
      setSupplierQrFileName("");
      setSupplierQrMessage("Supplier QR profile updated.");
    } catch (error) {
      setSupplierQrMessage(error instanceof Error ? error.message : "Unable to save supplier QR profile.");
    } finally {
      setIsSavingSupplierQr(false);
    }
  };

  const resolveSupplierPaymentReferences = async () => {
    const uniqueSupplierMap = new Map<string, FoodListing>();
    const fallbackReferences: SupplierPaymentReference[] = [];

    for (const item of cartItems) {
      const supplierId = item.listing.supplierUserId;
      if (!supplierId) {
        fallbackReferences.push({
          supplierId: item.listing.id,
          sellerName: item.listing.sellerName,
          qrImageUrl: null,
          message: "Supplier payment QR is not available yet.",
        });
        continue;
      }

      if (!uniqueSupplierMap.has(supplierId)) {
        uniqueSupplierMap.set(supplierId, item.listing);
      }
    }

    const referencesFromApi = await Promise.all(
      Array.from(uniqueSupplierMap.entries()).map(async ([supplierId, listing]) => {
        try {
          const response = await fetch(`/api/payment-profile?supplierId=${encodeURIComponent(supplierId)}`, {
            cache: "no-store",
          });

          if (!response.ok) {
            throw new Error("Payment reference unavailable");
          }

          const payload = (await response.json()) as { profile?: SupplierPaymentProfile | null };
          if (!payload.profile?.qrImageUrl) {
            return {
              supplierId,
              sellerName: listing.sellerName,
              qrImageUrl: null,
              message: "Supplier has not uploaded a payment QR yet.",
            } satisfies SupplierPaymentReference;
          }

          return {
            supplierId,
            sellerName: listing.sellerName,
            qrImageUrl: payload.profile.qrImageUrl,
            message: "Payment URL unlocked after pay action.",
          } satisfies SupplierPaymentReference;
        } catch {
          return {
            supplierId,
            sellerName: listing.sellerName,
            qrImageUrl: null,
            message: "Unable to load supplier payment reference right now.",
          } satisfies SupplierPaymentReference;
        }
      }),
    );

    return [...referencesFromApi, ...fallbackReferences];
  };

  const handlePayNow = async () => {
    if (!cartItems.length) {
      setPaymentMessage("Add items to cart before payment.");
      return;
    }

    setIsPaying(true);
    setPaymentMessage(null);

    try {
      const references = await resolveSupplierPaymentReferences();
      setPaymentReferences(references);

      const [primaryItem] = [...cartItems].sort((a, b) => a.listing.distanceKm - b.listing.distanceKm);
      if (primaryItem) {
        setTrackingOrder({
          id: `order-${Date.now()}`,
          listing: primaryItem.listing,
          quantity: primaryItem.quantity,
          totalAmount,
          paidAt: Date.now(),
        });
      }

      dispatch({ type: "checkout" });
      setIsCartOpen(false);
      setMode("consumer");
      setPaymentMessage("Payment initiated. Supplier payment reference is now visible in the tracking view.");
    } catch {
      setPaymentMessage("Unable to start payment right now. Please try again.");
    } finally {
      setIsPaying(false);
    }
  };

  const submitSupplierListing = async () => {
    if (!supplierForm.foodName.trim()) {
      setSupplierMessage("Food name is required.");
      return;
    }

    if (supplierForm.quantity <= 0) {
      setSupplierMessage("Quantity must be greater than 0.");
      return;
    }

    if (!session?.user?.id) {
      setSupplierMessage("Please sign in again to publish listings.");
      return;
    }

    if (!supplierForm.pickupLocation) {
      setSupplierMessage("Pickup location is required. Resolve address or pin map location.");
      return;
    }

    const cookedAtDate = new Date(supplierForm.cookedAt);
    if (Number.isNaN(cookedAtDate.getTime())) {
      setSupplierMessage("Provide a valid cooked time.");
      return;
    }

    if (!supplierPaymentProfile?.qrImageUrl) {
      setSupplierMessage("Upload your supplier GPay QR in Payment Profile before publishing listings.");
      return;
    }

    setIsPublishingSupplierListing(true);
    setSupplierMessage(null);
    setSupplierEmergencyResult(null);
    setSupplierBulkResult(null);

    try {
      const response = await fetch("/api/food/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          foodName: supplierForm.foodName.trim(),
          quantity: Math.floor(supplierForm.quantity),
          foodCategory: supplierForm.foodCategory,
          cookedAt: cookedAtDate.toISOString(),
          packagingCondition: supplierForm.packagingCondition,
          storageCondition: supplierForm.storageCondition,
          pickupAddress: supplierForm.pickupAddress.trim() || undefined,
          pickupLocation: supplierForm.pickupLocation,
          price: Math.max(0, supplierForm.price),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to publish listing.");
      }

      const payload = (await response.json()) as {
        listing?: {
          id: string;
          foodName: string;
          supplierName: string;
          supplierUserId: string;
          foodCategory: string;
          pickupLat: number;
          pickupLng: number;
          price: number;
          quantity: number;
          spoilageScore: number;
          spoilageLabel: string;
          recommendedPickupWindowMinutes: number;
        };
        risk?: {
          score: number;
          label: SpoilageLabel;
          recommendedPickupWindowMinutes: number;
        };
      };

      const saved = payload.listing;
      if (!saved) {
        throw new Error("Listing save returned no data.");
      }

      const listingFoodType: FoodType = saved.foodCategory === "non_veg" || saved.foodCategory === "seafood" ? "non_veg" : "veg";
      const newListing: FoodListing = {
        id: saved.id,
        dish: saved.foodName,
        sellerName: saved.supplierName,
        supplierUserId: saved.supplierUserId,
        sellerType: "individual",
        foodType: listingFoodType,
        distanceKm: Number((Math.random() * 4.2 + 0.6).toFixed(1)),
        unitPrice: saved.price,
        unit: "meals",
        deliveryAvailable: false,
        location: {
          lat: saved.pickupLat,
          lng: saved.pickupLng,
        },
      };

      setListings((current) => [newListing, ...current]);
      dispatch({ type: "registerStock", listingId: saved.id, quantity: saved.quantity });

      setSupplierForm((current) => ({
        ...current,
        foodName: "",
        quantity: 20,
        price: 0,
      }));

      setSupplierMessage(
        `Listing published. Risk: ${payload.risk?.label ?? saved.spoilageLabel} (${payload.risk?.score ?? saved.spoilageScore}/100). Max pickup window ${payload.risk?.recommendedPickupWindowMinutes ?? saved.recommendedPickupWindowMinutes} min.`,
      );
      await loadSupplierListings();
      setMode("consumer");
    } catch (error) {
      setSupplierMessage(error instanceof Error ? error.message : "Unable to publish listing.");
    } finally {
      setIsPublishingSupplierListing(false);
    }
  };

  const submitEmergencySupplierListing = async () => {
    if (!supplierForm.foodName.trim()) {
      setSupplierMessage("Food name is required for emergency circulation.");
      return;
    }

    if (supplierForm.quantity <= 0) {
      setSupplierMessage("Quantity must be greater than 0.");
      return;
    }

    if (!session?.user?.id) {
      setSupplierMessage("Please sign in again to publish emergency listing.");
      return;
    }

    if (!supplierForm.pickupLocation) {
      setSupplierMessage("Pickup location is required. Resolve address or pin map location.");
      return;
    }

    const cookedAtDate = new Date(supplierForm.cookedAt);
    if (Number.isNaN(cookedAtDate.getTime())) {
      setSupplierMessage("Provide a valid cooked time.");
      return;
    }

    if (!supplierPaymentProfile?.qrImageUrl) {
      setSupplierMessage("Upload your supplier GPay QR in Payment Profile before emergency circulation.");
      return;
    }

    setIsTriggeringEmergencyListing(true);
    setSupplierMessage(null);
    setSupplierEmergencyResult(null);
    setSupplierBulkResult(null);

    try {
      const response = await fetch("/api/food/emergency", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          foodName: supplierForm.foodName.trim(),
          quantity: Math.floor(supplierForm.quantity),
          foodCategory: supplierForm.foodCategory,
          cookedAt: cookedAtDate.toISOString(),
          packagingCondition: supplierForm.packagingCondition,
          storageCondition: supplierForm.storageCondition,
          pickupAddress: supplierForm.pickupAddress.trim() || undefined,
          pickupLocation: supplierForm.pickupLocation,
          price: Math.max(0, supplierForm.price),
          safeWindowMinutes: supplierEmergencyWindowMinutes,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to trigger emergency circulation.");
      }

      const payload = (await response.json()) as {
        listing?: {
          id: string;
          foodName: string;
          supplierName: string;
          supplierUserId: string;
          foodCategory: string;
          pickupLat: number;
          pickupLng: number;
          price: number;
          quantity: number;
          spoilageScore: number;
          spoilageLabel: string;
          recommendedPickupWindowMinutes: number;
        };
        emergency?: SupplierEmergencyResult;
      };

      const saved = payload.listing;
      if (!saved) {
        throw new Error("Emergency listing save returned no data.");
      }

      const listingFoodType: FoodType = saved.foodCategory === "non_veg" || saved.foodCategory === "seafood" ? "non_veg" : "veg";
      const newListing: FoodListing = {
        id: saved.id,
        dish: saved.foodName,
        sellerName: saved.supplierName,
        supplierUserId: saved.supplierUserId,
        sellerType: "individual",
        foodType: listingFoodType,
        distanceKm: Number((Math.random() * 4.2 + 0.6).toFixed(1)),
        unitPrice: saved.price,
        unit: "meals",
        deliveryAvailable: false,
        location: {
          lat: saved.pickupLat,
          lng: saved.pickupLng,
        },
      };

      setListings((current) => [newListing, ...current]);
      dispatch({ type: "registerStock", listingId: saved.id, quantity: saved.quantity });

      setSupplierEmergencyResult(payload.emergency ?? null);
      setSupplierMessage(
        payload.emergency?.priorityState === "expired_no_feasible_route"
          ? "Emergency listing created but expired automatically because no responder can reach within the safe window."
          : `Emergency circulation started at HIGH priority. Expected response in ${payload.emergency?.expectedResponseMinutes ?? "--"} min.`,
      );

      setSupplierForm((current) => ({
        ...current,
        foodName: "",
        quantity: 20,
        price: 0,
      }));

      await loadSupplierListings();
    } catch (error) {
      setSupplierMessage(error instanceof Error ? error.message : "Unable to trigger emergency circulation.");
    } finally {
      setIsTriggeringEmergencyListing(false);
    }
  };

  const updateSupplierBulkItem = <K extends keyof SupplierBulkItemDraft>(
    itemId: string,
    field: K,
    value: SupplierBulkItemDraft[K],
  ) => {
    setSupplierBulkItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    );
  };

  const addSupplierBulkItem = () => {
    setSupplierBulkItems((current) => [...current, createBulkItemDraft()]);
  };

  const removeSupplierBulkItem = (itemId: string) => {
    setSupplierBulkItems((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((item) => item.id !== itemId);
    });
  };

  const submitBulkSupplierEvent = async () => {
    if (!session?.user?.id) {
      setSupplierMessage("Please sign in again to publish bulk events.");
      return;
    }

    if (!supplierPaymentProfile?.qrImageUrl) {
      setSupplierMessage("Upload your supplier GPay QR in Payment Profile before bulk publishing.");
      return;
    }

    if (!supplierForm.pickupLocation) {
      setSupplierMessage("Pickup location is required. Resolve address or pin map location.");
      return;
    }

    const validItems = supplierBulkItems
      .map((item) => ({
        ...item,
        foodName: item.foodName.trim(),
        quantity: Math.max(1, Math.floor(item.quantity)),
      }))
      .filter((item) => item.foodName.length >= 2);

    if (!validItems.length) {
      setSupplierMessage("Add at least one valid dish for the bulk event.");
      return;
    }

    const invalidCookedAt = validItems.some((item) => Number.isNaN(new Date(item.cookedAt).getTime()));
    if (invalidCookedAt) {
      setSupplierMessage("One or more dishes have an invalid cooked time.");
      return;
    }

    setIsPublishingBulkEvent(true);
    setSupplierMessage(null);
    setSupplierEmergencyResult(null);
    setSupplierBulkResult(null);

    try {
      const response = await fetch("/api/food/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventName: supplierBulkEventName.trim() || "Bulk Surplus Event",
          pickupAddress: supplierForm.pickupAddress.trim() || undefined,
          pickupLocation: supplierForm.pickupLocation,
          safeWindowMinutes: supplierBulkWindowMinutes,
          pricePerMeal: Math.max(0, supplierForm.price),
          items: validItems.map((item) => ({
            foodName: item.foodName,
            quantity: item.quantity,
            foodCategory: item.foodCategory,
            cookedAt: new Date(item.cookedAt).toISOString(),
            packagingCondition: item.packagingCondition,
            storageCondition: item.storageCondition,
          })),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to publish bulk donation event.");
      }

      const payload = (await response.json()) as {
        listings?: Array<{
          id: string;
          foodName: string;
          supplierName: string;
          supplierUserId: string;
          foodCategory: string;
          pickupLat: number;
          pickupLng: number;
          price: number;
          quantity: number;
          spoilageScore: number;
          spoilageLabel: string;
          recommendedPickupWindowMinutes: number;
        }>;
        logistics?: SupplierBulkResult;
      };

      const newListings = (payload.listings ?? []).map((saved) => {
        const listingFoodType: FoodType =
          saved.foodCategory === "non_veg" || saved.foodCategory === "seafood" ? "non_veg" : "veg";

        dispatch({ type: "registerStock", listingId: saved.id, quantity: saved.quantity });

        return {
          id: saved.id,
          dish: saved.foodName,
          sellerName: saved.supplierName,
          supplierUserId: saved.supplierUserId,
          sellerType: "individual" as const,
          foodType: listingFoodType,
          distanceKm: Number((Math.random() * 4.2 + 0.6).toFixed(1)),
          unitPrice: saved.price,
          unit: "meals" as const,
          deliveryAvailable: false,
          location: {
            lat: saved.pickupLat,
            lng: saved.pickupLng,
          },
        } satisfies FoodListing;
      });

      if (newListings.length) {
        setListings((current) => [...newListings, ...current]);
      }

      setSupplierBulkResult(payload.logistics ?? null);
      setSupplierMessage(
        payload.logistics?.status === "expired"
          ? "Bulk event created, but no feasible receiver was reachable within the safe window."
          : `Bulk event published with ${validItems.length} items. Strategy: ${payload.logistics?.strategy ?? "split"}.`,
      );

      setSupplierBulkItems([createBulkItemDraft()]);
      await loadSupplierListings();
    } catch (error) {
      setSupplierMessage(error instanceof Error ? error.message : "Unable to publish bulk donation event.");
    } finally {
      setIsPublishingBulkEvent(false);
    }
  };

  const showRouteGuardLoader = !isClientHydrated || isSessionPending;

  if (showRouteGuardLoader) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_5%_5%,#dcfce7_0%,#f8fafc_42%,#e0f2fe_100%)] text-slate-900">
        <section className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
          <Loader2 className="size-10 animate-spin text-emerald-700" />
          <p className="mt-4 text-lg font-semibold text-slate-900">Loading your workspace...</p>
          <p className="mt-1 text-sm text-slate-600">Preparing the next page and session state.</p>
        </section>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_5%_5%,#fef3c7_0%,#f8fafc_42%,#e2e8f0_100%)] text-slate-900">
        <section className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10">
          <div className="w-full overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.15)]">
            <div className="grid gap-8 p-8 md:grid-cols-[1.1fr_0.9fr] md:p-12">
              <div className="space-y-4">
                <p className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-300">
                  <Sparkles className="size-3.5" /> Feedo Marketplace
                </p>
                <h1 className="text-3xl font-black leading-tight md:text-5xl">
                  Rescue good food. Buy smart. Cut waste together.
                </h1>
                <p className="text-sm text-slate-600 md:text-base">
                  Discover nearby surplus meals from homes and caterers, reserve in seconds, and reduce food waste with every order.
                </p>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 md:text-sm">
                  Consumer, Supplier, and Volunteer workflows are available after sign-in with dedicated tabs inside the main workspace.
                </p>
                <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3 md:text-sm">
                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="font-semibold text-slate-900">Step 1:</span> Sign in or create account.</p>
                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="font-semibold text-slate-900">Step 2:</span> Choose Consumer, Supplier, or Volunteer tab.</p>
                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-2"><span className="font-semibold text-slate-900">Step 3:</span> Start rescue operations in real time.</p>
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button className="gap-2" onClick={() => router.push("/auth/sign-in")}>
                    Sign in <ArrowRight className="size-4" />
                  </Button>
                  <Button variant="outline" onClick={() => router.push("/auth/sign-up")}>
                    Create account
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Project Goal</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">Reduce food waste by connecting consumers and suppliers in real time.</p>
                  <p className="mt-1 text-xs text-amber-800">Unified flows for order, publish, pickup, and delivery.</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Food Saved</p>
                  <p className="mt-2 text-3xl font-black text-emerald-800">12,480+</p>
                  <p className="text-xs text-emerald-700">meals rescued by community</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                  <p className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-amber-300">
                    <BadgePercent className="size-3.5" /> Less than 50% market price!
                  </p>
                  <p className="mt-2 text-xs text-slate-600 md:text-sm">Suppliers publish discounted surplus, consumers reserve instantly, and volunteers complete the final-mile pickup.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-100 via-cyan-100 to-blue-100 text-slate-900 relative overflow-hidden">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-emerald-300/45 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-44 -right-40 h-[26rem] w-[26rem] rounded-full bg-cyan-300/45 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/3 h-80 w-80 rounded-full bg-blue-300/35 blur-3xl" />

      {/* Image-backed atmosphere layers */}
      <div className="pointer-events-none absolute inset-0 opacity-65">
        <Image src="/bg/food-network.svg" alt="" fill sizes="100vw" className="object-cover" priority />
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-35">
        <Image src="/bg/grain-overlay.svg" alt="" fill sizes="100vw" className="object-cover" />
      </div>
      
      {/* Background line pattern */}
      <div className="absolute inset-0 opacity-[0.08]" style={{
        backgroundImage: `linear-gradient(0deg, transparent 24%, rgba(6,95,70,0.1) 25%, rgba(6,95,70,0.1) 26%, transparent 27%, transparent 74%, rgba(6,95,70,0.1) 75%, rgba(6,95,70,0.1) 76%, transparent 77%, transparent),
        linear-gradient(90deg, transparent 24%, rgba(6,95,70,0.1) 25%, rgba(6,95,70,0.1) 26%, transparent 27%, transparent 74%, rgba(6,95,70,0.1) 75%, rgba(6,95,70,0.1) 76%, transparent 77%, transparent)`,
        backgroundSize: '50px 50px'
      }} />
      
      <div className="relative z-10">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <FeedoLogo />
            <div>
              <p className="text-lg font-black leading-none flex items-center gap-1">Feedo <span>🍲</span></p>
              <p className="text-xs text-slate-500">Food rescue & fairness marketplace</p>
            </div>

            <div className="ml-2 flex items-center rounded-full border border-slate-300 bg-slate-100 p-1 text-sm">
              <button
                onClick={() => setMode("consumer")}
                className={`rounded-full px-3 py-1.5 font-semibold transition flex items-center gap-1.5 ${
                  mode === "consumer" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                }`}
              >
                <span>🛒</span> Consumer
              </button>
              <button
                onClick={() => setMode("supplier")}
                className={`rounded-full px-3 py-1.5 font-semibold transition flex items-center gap-1.5 ${
                  mode === "supplier" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                }`}
              >
                <span>🏪</span> Supplier
              </button>
              <button
                onClick={() => setMode("volunteer")}
                className={`rounded-full px-3 py-1.5 font-semibold transition flex items-center gap-1.5 ${
                  mode === "volunteer" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                }`}
              >
                <span>🚗</span> Volunteer
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5">
              <User className="size-4 text-slate-600" />
              <span className="text-sm font-semibold">{session?.user?.name ?? "Guest"}</span>
            </div>
            <Button
              variant="outline"
              className="gap-2"
              disabled={!session}
              onClick={handleLogout}
            >
              <LogOut className="size-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 pb-12">
        <div className="grid gap-4 xl:grid-cols-[290px_1fr]">
          <aside className="space-y-3 xl:sticky xl:top-24 xl:h-fit">
            <WebsiteAiAssistant
              title="General AI Assistant"
              description="Ask anything about Feedo pages, roles, routes, orders, crisis mode, and analytics."
              placeholder="Ask a website question..."
              maxSuggestions={4}
            />

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Role Analytics Snapshot</p>
              <p className="mt-1 text-xs text-emerald-900">Detailed analytics were moved out of the main workspace panels.</p>
              <div className="mt-3 space-y-2">
                {mode === "consumer" ? (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">Total needs</p>
                      <p className="text-sm font-semibold text-slate-900">{receiverAnalytics?.metrics.totalNeeds ?? receiverNeedHistory.length}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">Matched needs</p>
                      <p className="text-sm font-semibold text-slate-900">{receiverAnalytics?.metrics.matchedNeeds ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">Prompt reach</p>
                      <p className="text-sm font-semibold text-slate-900">{receiverAnalytics?.metrics.avgPromptReach ?? 0} suppliers</p>
                    </div>
                  </>
                ) : null}

                {mode === "supplier" ? (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">Meals contributed</p>
                      <p className="text-sm font-semibold text-slate-900">{supplierAnalytics?.metrics.mealsContributed ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">Successful pickups</p>
                      <p className="text-sm font-semibold text-slate-900">{supplierAnalytics?.metrics.successfulPickups ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">Avg response</p>
                      <p className="text-sm font-semibold text-slate-900">{supplierAnalytics?.metrics.averageResponseMinutes ?? 0} min</p>
                    </div>
                  </>
                ) : null}

                {mode === "volunteer" ? (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">Accepted tasks</p>
                      <p className="text-sm font-semibold text-slate-900">{volunteerAnalytics?.metrics.acceptedCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">Delivered tasks</p>
                      <p className="text-sm font-semibold text-slate-900">{volunteerAnalytics?.metrics.deliveredCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase text-slate-500">Events per task</p>
                      <p className="text-sm font-semibold text-slate-900">{volunteerAnalytics?.metrics.avgEventsPerTask ?? 0}</p>
                    </div>
                  </>
                ) : null}

                {isRoleAnalyticsLoading ? <p className="text-xs text-emerald-800">Refreshing snapshot...</p> : null}
              </div>
              <Link href="/analytics" className="mt-3 inline-block text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                Open full analytics dashboard
              </Link>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Lifecycle Timeline</p>
              <p className="mt-1 text-xs text-blue-900">Latest cross-role events, filtered for the active mode.</p>
              <div className="mt-3 space-y-2">
                {isWorkspaceTimelineLoading ? (
                  <p className="text-xs text-blue-800">Loading activity...</p>
                ) : workspaceTimeline.length ? (
                  workspaceTimeline.slice(0, 5).map((item, index) => {
                    const eventLabel = humanizeEventKey(String(item.event_type ?? "status_updated"));
                    const eventState = item.status_after ? ` (${humanizeEventKey(item.status_after)})` : "";
                    const actor = String(item.actor_role ?? "system").toUpperCase();
                    const when = item.occurred_at ? formatRelativeTime(item.occurred_at) : "recent";
                    return (
                      <div key={item.id ?? `timeline-${index}`} className="rounded-lg border border-blue-200 bg-white px-3 py-2">
                        <p className="text-xs font-semibold text-slate-800">{eventLabel}{eventState}</p>
                        <p className="text-[11px] text-slate-600">{actor} | {when}</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-blue-900">No lifecycle events yet for this role. Trigger listing, emergency, or workflow actions to populate this panel.</p>
                )}
              </div>
            </div>
          </aside>

          <div>
        {trackingOrder ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">After payment live view</p>
                  <h2 className="text-2xl font-black text-slate-900">Track your pickup route in real time</h2>
                  <p className="text-sm text-slate-600">
                    Destination: {trackingOrder.listing.sellerName} for {trackingOrder.listing.dish}
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    setTrackingOrder(null);
                    setTrackingLocation(null);
                    setTrackingRoutePoints([]);
                    setTrackingDistanceKm(null);
                    setTrackingEtaMinutes(null);
                    setArrivedAtPickup(false);
                    setReviewStars(0);
                    setReviewSubmitted(false);
                    setInboundTracking(null);
                    lastInboundStageRef.current = null;
                  }}
                >
                  Back to marketplace
                </Button>
              </div>

              {paymentMessage ? (
                <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {paymentMessage}
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Distance left</p>
                  <p className="mt-1 text-xl font-black text-slate-900">
                    {typeof trackingDistanceKm === "number" ? `${trackingDistanceKm.toFixed(2)} km` : "Calculating..."}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">ETA</p>
                  <p className="mt-1 text-xl font-black text-slate-900">
                    {typeof trackingEtaMinutes === "number" ? `${trackingEtaMinutes} min` : "Calculating..."}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Order value</p>
                  <p className="mt-1 text-xl font-black text-slate-900">Rs. {trackingOrder.totalAmount}</p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Inbound Redistribution Status</p>
                {isInboundTrackingLoading ? (
                  <p className="mt-1 text-xs text-sky-800">Refreshing transit stage and suitability checks...</p>
                ) : inboundTracking ? (
                  <div className="mt-2 space-y-2 text-sm text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-900">Stage:</span> {inboundTracking.stageLabel}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Assigned volunteer:</span> {inboundTracking.assignedVolunteer.displayName}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Pickup completed:</span> {inboundTracking.pickupCompleted ? "Yes" : "Pending"}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-900">Suitability score:</span> {inboundTracking.suitability.spoilageRiskScore}/100
                    </p>
                    {inboundTracking.suitability.warnings.length ? (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {inboundTracking.suitability.warnings.join(" ")}
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-700">No active suitability warning at the moment.</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-600">Inbound telemetry will appear once route signals are available.</p>
                )}
              </div>

              {trackingError ? (
                <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {trackingError}
                </p>
              ) : null}

              <div className="mt-4">
                <PostPaymentTrackerMap
                  userLocation={trackingLocation}
                  destination={trackingOrder.listing.location}
                  routePoints={trackingRoutePoints}
                />
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Supplier payment URL is visible only after pressing Pay</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {paymentReferences.length ? (
                    paymentReferences.map((reference) => (
                      <div key={`${reference.supplierId}-${reference.sellerName}`} className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-sm font-bold text-slate-900">{reference.sellerName}</p>
                        <p className="mt-1 text-xs text-slate-500">{reference.message}</p>

                        {reference.qrImageUrl ? (
                          <>
                            <a
                              href={reference.qrImageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"
                            >
                              Open supplier payment URL <ArrowRight className="size-3.5" />
                            </a>
                            <Image
                              src={reference.qrImageUrl}
                              alt={`Payment QR for ${reference.sellerName}`}
                              width={112}
                              height={112}
                              unoptimized
                              className="mt-2 h-28 w-28 rounded-md border border-slate-200 object-cover"
                            />
                          </>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">QR not available for this listing yet.</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No supplier payment references for this order.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                {arrivedAtPickup ? (
                  reviewSubmitted ? (
                    <p className="text-sm font-semibold text-emerald-700">Thanks for your review. Pickup marked completed.</p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-slate-900">You have reached the location. Share your star review.</p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewStars(star)}
                            className="rounded p-1"
                            aria-label={`Set ${star} star rating`}
                          >
                            <Star
                              className={`size-5 ${reviewStars >= star ? "fill-amber-400 text-amber-500" : "text-slate-300"}`}
                            />
                          </button>
                        ))}
                      </div>
                      <Button
                        disabled={reviewStars === 0}
                        onClick={() => setReviewSubmitted(true)}
                      >
                        Submit review
                      </Button>
                    </div>
                  )
                ) : (
                  <p className="text-sm text-slate-600">Live tracking active. Review unlocks automatically once you arrive at the supplier location.</p>
                )}
              </div>
            </div>
          </div>
        ) : mode === "consumer" ? (
          <div className="space-y-4">
            {/* Section Header with Gradient Background */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-50 p-6 shadow-sm">
              <div className="absolute right-0 top-0 -mr-20 -mt-20 h-40 w-40 rounded-full bg-cyan-200 opacity-10 blur-3xl" />
              <div className="absolute left-0 bottom-0 -ml-20 -mb-20 h-40 w-40 rounded-full bg-emerald-200 opacity-10 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-3xl">🛒</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Consumer Marketplace</p>
                    <h2 className="text-xl font-black text-slate-900">Discover nearby surplus food</h2>
                  </div>
                </div>
                <p className="max-w-2xl text-sm text-slate-600">Search by dish name, sort by distance or price, and filter by your preferences. Reserve now at unbeatable prices.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Smart Demand Feed</p>
                  <p className="text-sm text-blue-900">Consumer feed is ranked by need fit, suitability, urgency, spoilage risk, and route feasibility.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-blue-800">Crisis mode</label>
                  <select
                    value={receiverCrisisOverride}
                    onChange={(event) => setReceiverCrisisOverride(event.target.value as "auto" | "force_on")}
                    className="h-8 rounded-md border border-blue-300 bg-white px-2 text-xs"
                  >
                    <option value="auto">Auto</option>
                    <option value="force_on">Force ON</option>
                  </select>
                </div>
              </div>
              {receiverCrisisSignal?.active ? (
                <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  <p className="font-semibold uppercase tracking-wide">Crisis Mode Active: Survival-first optimization enabled</p>
                  <p className="mt-1">
                    {receiverCrisisSignal.reason}. Urgent redistribution is active, prioritizing fastest safe route and highest urgency needs.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Consumer Workspace Focus</p>
              <p className="mt-1 text-sm text-slate-700">Main page panels now focus on live operations. Analytics details are available in the left sidebar and full analytics dashboard.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-500">Current listings</p>
                  <p className="text-base font-bold text-slate-900">{consumerListings.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-500">Reserved items</p>
                  <p className="text-base font-bold text-slate-900">{cartCount}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-500">Need requests</p>
                  <p className="text-base font-bold text-slate-900">{receiverNeedHistory.length}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Need Posting + Reverse Matching</p>
                  <p className="text-sm text-slate-700">Post your need window and trigger targeted supplier prompts automatically.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => void loadReceiverNeedHistory()}>Refresh Needs</Button>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <Input value={consumerNeedTitle} onChange={(event) => setConsumerNeedTitle(event.target.value)} placeholder="30 meals tonight" />
                <Input type="number" min={1} value={consumerNeedMeals} onChange={(event) => setConsumerNeedMeals(Math.max(1, Number(event.target.value) || 1))} placeholder="Meals" />
                <select
                  value={consumerNeedFoodPreference}
                  onChange={(event) => setConsumerNeedFoodPreference(event.target.value as typeof consumerNeedFoodPreference)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="any">Any</option>
                  <option value="veg">Veg</option>
                  <option value="non_veg">Non Veg</option>
                  <option value="dairy">Dairy</option>
                  <option value="bakery">Bakery</option>
                  <option value="rice">Rice</option>
                  <option value="seafood">Seafood</option>
                </select>
                <select
                  value={consumerNeedMealSlot}
                  onChange={(event) => setConsumerNeedMealSlot(event.target.value as typeof consumerNeedMealSlot)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="tonight">Tonight</option>
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="custom">Custom</option>
                </select>
                <select
                  value={consumerNeedUrgency}
                  onChange={(event) => setConsumerNeedUrgency(event.target.value as typeof consumerNeedUrgency)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <Input type="datetime-local" value={consumerNeedWindowStart} onChange={(event) => setConsumerNeedWindowStart(event.target.value)} />
                <Input type="datetime-local" value={consumerNeedWindowEnd} onChange={(event) => setConsumerNeedWindowEnd(event.target.value)} />
                <Input value={consumerNeedNote} onChange={(event) => setConsumerNeedNote(event.target.value)} placeholder="Need note for suppliers" />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => void postConsumerNeed()} disabled={isPostingConsumerNeed}>
                  {isPostingConsumerNeed ? "Posting need..." : "Post Need and Trigger Matching"}
                </Button>
                <span className="text-xs text-slate-600">Needs posted: {receiverNeedHistory.length}</span>
              </div>

              {consumerNeedMessage ? (
                <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">{consumerNeedMessage}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
                <Input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search dish name"
                  className="pl-9"
                />
              </div>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as "recommended" | "distance" | "price")}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="recommended">Sort: Recommended</option>
                <option value="distance">Sort: Distance</option>
                <option value="price">Sort: Price</option>
              </select>

              <Button variant="outline" className="gap-2" onClick={() => setIsFilterOpen(true)}>
                <Filter className="size-4" /> Filter
              </Button>

              <Button variant="outline" className="gap-2" onClick={() => setIsMapOpen(true)}>
                <MapPinned className="size-4" /> See in Map
              </Button>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-amber-300">
              <BadgePercent className="size-3.5" /> Less than 50% market price!
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {consumerListings.map((listing) => {
                const available = commerceState.stock[listing.id] ?? 0;
                const inCart = commerceState.cart[listing.id] ?? 0;
                const recommendation = recommendationByListingId.get(listing.id);
                return (
                  <article
                    key={listing.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-slate-900">{listing.dish}</p>
                        <p className="text-sm text-slate-600">{listing.sellerName}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          listing.foodType === "veg"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {listing.foodType === "veg" ? "Veg" : "Non Veg"}
                      </span>
                    </div>

                    {recommendation ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                          Recommended #{recommendation.rank}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                          Score {recommendation.score}/100
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {recommendation.source === "receiver-matching" ? "receiver matching" : "local fallback"}
                        </span>
                      </div>
                    ) : null}

                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <p className="rounded-md bg-slate-50 px-2 py-1.5">Distance: {listing.distanceKm} km</p>
                      <p className="rounded-md bg-slate-50 px-2 py-1.5">Seller: {listing.sellerType}</p>
                      <p className="rounded-md bg-slate-50 px-2 py-1.5">Price: Rs. {listing.unitPrice}/{listing.unit}</p>
                      <p className="rounded-md bg-slate-50 px-2 py-1.5">
                        Delivery: {listing.deliveryAvailable ? "Yes" : "No"}
                      </p>
                    </div>

                    {recommendation ? (
                      <p className="mt-2 text-[11px] text-slate-600">{recommendation.detail}</p>
                    ) : null}

                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Available: {available} {listing.unit}</p>
                      {inCart > 0 ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-2 py-1">
                          <button
                            onClick={() => releaseListing(listing.id)}
                            className="rounded p-1 hover:bg-slate-100"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="size-4" />
                          </button>
                          <span className="w-5 text-center text-sm font-bold">{inCart}</span>
                          <button
                            onClick={() => reserveListing(listing.id)}
                            className="rounded p-1 hover:bg-slate-100"
                            aria-label="Increase quantity"
                            disabled={available <= 0}
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => reserveListing(listing.id)}
                          disabled={available <= 0}
                          className="gap-1"
                        >
                          <Plus className="size-4" /> Add to cart
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {!consumerListings.length ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
                No results found for current search and filters.
              </div>
            ) : null}
          </div>
        ) : mode === "supplier" ? (
          <div className={`rounded-2xl border p-6 shadow-sm relative overflow-hidden ${
            supplierPublishMode === "emergency"
              ? "border-rose-200 bg-gradient-to-br from-rose-50 via-red-50 to-orange-50"
              : supplierPublishMode === "bulk"
                ? "border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-50"
                : "border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50"
          }`}>
            {/* Decorative elements */}
            <div className={`absolute right-0 top-0 -mr-16 -mt-16 h-32 w-32 rounded-full opacity-10 blur-3xl ${
              supplierPublishMode === "emergency" ? "bg-rose-300" : supplierPublishMode === "bulk" ? "bg-cyan-300" : "bg-orange-200"
            }`} />
            <div className={`absolute left-0 bottom-0 -ml-16 -mb-16 h-32 w-32 rounded-full opacity-10 blur-3xl ${
              supplierPublishMode === "emergency" ? "bg-red-300" : supplierPublishMode === "bulk" ? "bg-sky-300" : "bg-amber-200"
            }`} />
            
            <div className="relative mb-5">
              <div className="flex items-start gap-3 mb-3">
                <Store className="size-6 text-amber-700 flex-shrink-0" />
                <div className="flex-1">
                  <p className={`text-xs font-bold uppercase tracking-wider ${
                    supplierPublishMode === "emergency"
                      ? "text-rose-700"
                      : supplierPublishMode === "bulk"
                        ? "text-cyan-700"
                        : "text-amber-700"
                  }`}>Supplier Publishing</p>
                  <h2 className="text-xl font-black text-slate-900">Publish your surplus food</h2>
                  <p className="mt-1 text-sm text-slate-600">Define listing details, upload payment QR, then choose standard listing, emergency circulation, or bulk event dispatch.</p>
                </div>
                <span className="text-3xl flex-shrink-0">🍽️</span>
              </div>

              <div className="inline-flex rounded-full border border-amber-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => {
                    setSupplierPublishMode("standard");
                    setSupplierEmergencyResult(null);
                    setSupplierBulkResult(null);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    supplierPublishMode === "standard" ? "bg-amber-600 text-white" : "text-slate-700"
                  }`}
                >
                  Standard Listing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSupplierPublishMode("emergency");
                    setSupplierBulkResult(null);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    supplierPublishMode === "emergency" ? "bg-rose-600 text-white" : "text-slate-700"
                  }`}
                >
                  Emergency Pickup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSupplierPublishMode("bulk");
                    setSupplierEmergencyResult(null);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    supplierPublishMode === "bulk" ? "bg-cyan-600 text-white" : "text-slate-700"
                  }`}
                >
                  Bulk Event
                </button>
              </div>

              <div className="mt-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-700">
                  <BarChart3 className="size-4" /> Supplier analytics moved to sidebar and full analytics dashboard.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Supplier Workspace Focus</p>
              <p className="mt-1 text-sm text-slate-700">Main page now emphasizes publishing, emergency orchestration, and bulk handling. Analytics are consolidated in the sidebar and analytics page.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-500">Live listings</p>
                  <p className="text-base font-bold text-slate-900">{supplierListings.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-500">Need prompts</p>
                  <p className="text-base font-bold text-slate-900">{supplierNeedPrompts.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-500">Publish mode</p>
                  <p className="text-base font-bold text-slate-900 capitalize">{supplierPublishMode}</p>
                </div>
              </div>
            </div>

            <div className={`mb-4 rounded-xl border bg-white/70 backdrop-blur-sm p-4 ${
              supplierPublishMode === "emergency"
                ? "border-rose-200"
                : supplierPublishMode === "bulk"
                  ? "border-cyan-200"
                  : "border-amber-200"
            }`}>
              <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span>💳</span> Payment Profile (editable anytime)
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Upload your GPay/UPI QR image once. Buyers will see your payment link only after confirming purchase.
              </p>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <Input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleSupplierQrFileChange}
                    className="bg-white border border-slate-300"
                  />
                  {supplierQrFileName ? <p className="mt-1 text-xs text-emerald-700 font-medium">✓ Selected: {supplierQrFileName}</p> : null}
                </div>
                <Button type="button" variant="outline" onClick={() => void saveSupplierQrProfile()} disabled={isSavingSupplierQr}>
                  {isSavingSupplierQr ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save QR
                </Button>
              </div>

              {supplierPaymentProfile?.qrImageUrl ? (
                <div className="mt-3 flex items-center gap-3">
                  <Image
                    src={supplierPaymentProfile.qrImageUrl}
                    alt="Supplier payment QR"
                    width={96}
                    height={96}
                    unoptimized
                    className="h-24 w-24 rounded-lg border border-slate-300 object-cover shadow-sm"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">✅ Payment QR is active</p>
                    <p className="text-xs text-slate-600">Buyers can pay using this QR after purchase.</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-rose-700 font-medium">⚠️ No QR uploaded yet. Save one before publishing listings.</p>
              )}

              {supplierQrMessage ? (
                <p className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
                  <span>ℹ️</span> {supplierQrMessage}
                </p>
              ) : null}
            </div>

            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Targeted Need Prompts</p>
                  <p className="text-xs text-blue-900">Reverse matching nudges from nearby receivers needing food in specific windows.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadSupplierNeedPrompts()}>
                  Refresh
                </Button>
              </div>

              <div className="mt-3 space-y-2">
                {isLoadingSupplierNeedPrompts ? (
                  <p className="text-xs text-blue-900">Loading prompts...</p>
                ) : supplierNeedPrompts.length ? (
                  supplierNeedPrompts.slice(0, 5).map((prompt) => (
                    <article key={prompt.id} className="rounded-lg border border-blue-200 bg-white p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{prompt.need?.need_title ?? "Receiver need"}</p>
                        <span className="rounded-full bg-blue-100 px-2 py-1 font-bold text-blue-700">Score {Math.round(prompt.prompt_score)}</span>
                      </div>
                      <p className="mt-1 text-slate-600">
                        {prompt.need?.required_meals ?? 0} meals • {prompt.need?.food_preference ?? "any"} • {prompt.need?.meal_slot ?? "custom"} • {prompt.need?.urgency_level ?? "high"}
                      </p>
                      <p className="mt-1 text-slate-600">
                        Window: {prompt.need?.window_start_at ? new Date(prompt.need.window_start_at).toLocaleString() : "-"} to {prompt.need?.window_end_at ? new Date(prompt.need.window_end_at).toLocaleString() : "-"}
                      </p>
                      <p className="mt-1 text-slate-600">
                        Distance {prompt.distance_km != null ? `${prompt.distance_km.toFixed(1)} km` : "unknown"} • Avg qty {prompt.avg_quantity ?? "-"} • Recent listings {prompt.recent_listing_count ?? "-"}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="text-xs text-blue-900">No targeted need prompts yet.</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {supplierPublishMode === "bulk" ? (
                <>
                  <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                    <div className="flex items-center gap-2">
                      <span>🏷️</span> <span>Bulk Event Name</span>
                    </div>
                    <Input
                      value={supplierBulkEventName}
                      onChange={(event) => setSupplierBulkEventName(event.target.value)}
                      placeholder="e.g., Wedding Dinner Surplus"
                      className="bg-slate-900 text-white placeholder:text-slate-400 border-slate-700"
                    />
                  </label>

                  <div className="md:col-span-2 rounded-xl border border-cyan-200 bg-white/80 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">Bulk Items</p>
                      <Button type="button" variant="outline" size="sm" onClick={addSupplierBulkItem}>
                        <Plus className="size-3.5" /> Add item
                      </Button>
                    </div>
                    <div className="mt-3 space-y-3">
                      {supplierBulkItems.map((item, index) => (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-700">Dish #{index + 1}</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeSupplierBulkItem(item.id)}
                              disabled={supplierBulkItems.length <= 1}
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <Input
                              value={item.foodName}
                              onChange={(event) => updateSupplierBulkItem(item.id, "foodName", event.target.value)}
                              placeholder="Food name"
                              className="bg-slate-900 text-white placeholder:text-slate-400 border-slate-700"
                            />
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(event) =>
                                updateSupplierBulkItem(item.id, "quantity", Math.max(1, Number(event.target.value) || 1))
                              }
                              className="bg-slate-900 text-white border-slate-700"
                            />
                            <select
                              value={item.foodCategory}
                              onChange={(event) =>
                                updateSupplierBulkItem(item.id, "foodCategory", event.target.value as SupplierFoodCategory)
                              }
                              className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-white"
                            >
                              <option value="veg">Veg</option>
                              <option value="non_veg">Non Veg</option>
                              <option value="dairy">Dairy</option>
                              <option value="bakery">Bakery</option>
                              <option value="rice">Cooked Rice</option>
                              <option value="seafood">Seafood</option>
                            </select>
                            <Input
                              type="datetime-local"
                              value={item.cookedAt}
                              onChange={(event) => updateSupplierBulkItem(item.id, "cookedAt", event.target.value)}
                              className="bg-slate-900 text-white border-slate-700"
                            />
                            <select
                              value={item.packagingCondition}
                              onChange={(event) =>
                                updateSupplierBulkItem(item.id, "packagingCondition", event.target.value as PackagingCondition)
                              }
                              className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-white"
                            >
                              <option value="sealed">Sealed</option>
                              <option value="good">Good</option>
                              <option value="average">Average</option>
                              <option value="damaged">Damaged</option>
                            </select>
                            <select
                              value={item.storageCondition}
                              onChange={(event) =>
                                updateSupplierBulkItem(item.id, "storageCondition", event.target.value as StorageCondition)
                              }
                              className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-white"
                            >
                              <option value="refrigerated">Refrigerated</option>
                              <option value="insulated">Insulated Container</option>
                              <option value="room_temp">Room Temperature</option>
                              <option value="outdoor">Outdoor / Warm</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <span>🍛</span> <span>Food Name</span>
                    </div>
                    <Input
                      value={supplierForm.foodName}
                      onChange={(event) =>
                        setSupplierForm((current) => ({ ...current, foodName: event.target.value }))
                      }
                      placeholder="e.g., Dal Khichdi"
                      className="bg-slate-900 text-white placeholder:text-slate-400 border-slate-700"
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <span>📦</span> <span>Quantity (meals)</span>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={supplierForm.quantity}
                      onChange={(event) =>
                        setSupplierForm((current) => ({
                          ...current,
                          quantity: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                      className="bg-slate-900 text-white border-slate-700"
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <span>🥗</span> <span>Food Category</span>
                    </div>
                    <select
                      value={supplierForm.foodCategory}
                      onChange={(event) =>
                        setSupplierForm((current) => ({ ...current, foodCategory: event.target.value as SupplierFoodCategory }))
                      }
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-white"
                    >
                      <option value="veg">Veg</option>
                      <option value="non_veg">Non Veg</option>
                      <option value="dairy">Dairy</option>
                      <option value="bakery">Bakery</option>
                      <option value="rice">Cooked Rice</option>
                      <option value="seafood">Seafood</option>
                    </select>
                  </label>

                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <Clock3 className="size-4" /> <span>Cooked Time</span>
                    </div>
                    <Input
                      type="datetime-local"
                      value={supplierForm.cookedAt}
                      onChange={(event) =>
                        setSupplierForm((current) => ({ ...current, cookedAt: event.target.value }))
                      }
                      className="bg-slate-900 text-white border-slate-700"
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <span>📦</span> <span>Packaging Condition</span>
                    </div>
                    <select
                      value={supplierForm.packagingCondition}
                      onChange={(event) =>
                        setSupplierForm((current) => ({ ...current, packagingCondition: event.target.value as PackagingCondition }))
                      }
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-white"
                    >
                      <option value="sealed">Sealed</option>
                      <option value="good">Good</option>
                      <option value="average">Average</option>
                      <option value="damaged">Damaged</option>
                    </select>
                  </label>

                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <span>🧊</span> <span>Storage Condition</span>
                    </div>
                    <select
                      value={supplierForm.storageCondition}
                      onChange={(event) =>
                        setSupplierForm((current) => ({ ...current, storageCondition: event.target.value as StorageCondition }))
                      }
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-white"
                    >
                      <option value="refrigerated">Refrigerated</option>
                      <option value="insulated">Insulated Container</option>
                      <option value="room_temp">Room Temperature</option>
                      <option value="outdoor">Outdoor / Warm</option>
                    </select>
                  </label>
                </>
              )}

              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                <div className="flex items-center gap-2">
                  <MapPinned className="size-4" /> <span>Pickup Location</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={supplierForm.pickupAddress}
                    onChange={(event) =>
                      setSupplierForm((current) => ({ ...current, pickupAddress: event.target.value }))
                    }
                    placeholder="Enter area / full address"
                    className="flex-1 bg-slate-900 text-white placeholder:text-slate-400 border-slate-700"
                  />
                  <Button type="button" variant="outline" disabled={isResolvingSupplierAddress} onClick={() => void resolveSupplierPickupAddress()}>
                    {isResolvingSupplierAddress ? <Loader2 className="size-4 animate-spin" /> : null}
                    Resolve
                  </Button>
                </div>
                <div className="mt-2">
                  <LocationPickerMap
                    value={supplierForm.pickupLocation}
                    onChange={(value) => setSupplierForm((current) => ({ ...current, pickupLocation: value }))}
                    className="rounded-xl"
                  />
                </div>
                {supplierForm.pickupLocation ? (
                  <p className="text-xs text-slate-600">
                    Selected: {supplierForm.pickupLocation.lat.toFixed(5)}, {supplierForm.pickupLocation.lng.toFixed(5)}
                  </p>
                ) : null}
              </label>
            </div>

            <div className={`mt-4 rounded-xl border p-4 ${
              supplierPublishMode === "emergency"
                ? "border-rose-200 bg-rose-50"
                : supplierPublishMode === "bulk"
                  ? "border-cyan-200 bg-cyan-50"
                  : "border-amber-200 bg-amber-50"
            }`}>
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <div className="flex items-center gap-2">
                    <span>{supplierPublishMode === "standard" ? "💵" : "🚨"}</span>
                    <span>
                      {supplierPublishMode === "standard"
                        ? "Price per meal"
                        : supplierPublishMode === "emergency"
                          ? "Emergency safe window (minutes)"
                          : "Bulk event safe window (minutes)"}
                    </span>
                  </div>
                  {supplierPublishMode === "standard" ? (
                    <Input
                      type="number"
                      min={0}
                      value={supplierForm.price}
                      onChange={(event) => {
                        const nextValue = Math.max(0, Number(event.target.value) || 0);
                        setSupplierForm((current) => ({ ...current, price: nextValue }));
                      }}
                      className="bg-white border-slate-300"
                    />
                  ) : supplierPublishMode === "emergency" ? (
                    <Input
                      type="number"
                      min={20}
                      max={240}
                      value={supplierEmergencyWindowMinutes}
                      onChange={(event) => {
                        const nextValue = Math.max(20, Math.min(240, Number(event.target.value) || 20));
                        setSupplierEmergencyWindowMinutes(nextValue);
                      }}
                      className="bg-white border-rose-300"
                    />
                  ) : (
                    <Input
                      type="number"
                      min={30}
                      max={360}
                      value={supplierBulkWindowMinutes}
                      onChange={(event) => {
                        const nextValue = Math.max(30, Math.min(360, Number(event.target.value) || 30));
                        setSupplierBulkWindowMinutes(nextValue);
                      }}
                      className="bg-white border-cyan-300"
                    />
                  )}
                </label>

                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  {supplierPublishMode === "bulk" ? (
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">Bulk logistics preview</p>
                      <p>Each dish gets an individual spoilage score at publish time.</p>
                      <p>Allocation picks one receiver if feasible, otherwise splits by route-time and capacity.</p>
                    </div>
                  ) : isSupplierRiskLoading ? (
                    <p className="inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> Calculating live spoilage risk...</p>
                  ) : supplierRiskPreview ? (
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">Live Risk Score: {supplierRiskPreview.score}/100</p>
                      <p>
                        Status: <span className={`font-bold ${
                          supplierRiskPreview.label === "Fresh"
                            ? "text-emerald-700"
                            : supplierRiskPreview.label === "Use Soon"
                              ? "text-amber-700"
                              : "text-rose-700"
                        }`}>{supplierRiskPreview.label}</span>
                      </p>
                      <p>Recommended pickup window: {supplierRiskPreview.recommendedPickupWindowMinutes} min</p>
                      <p>
                        Weather now: {supplierRiskPreview.weather.temperatureC.toFixed(1)}C / {Math.round(supplierRiskPreview.weather.humidityPct)}%
                      </p>
                      <p>
                        Route estimate: {supplierRiskPreview.travel.durationMinutes} min ({supplierRiskPreview.travel.distanceKm.toFixed(1)} km)
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-600">Complete food + location fields to see live spoilage label.</p>
                  )}
                </div>
              </div>
              {supplierPublishMode === "standard" ? (
                <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-amber-300">
                  <BadgePercent className="size-3.5" /> Less than 50% market price!
                </p>
              ) : supplierPublishMode === "emergency" ? (
                <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  Emergency mode bypasses passive discovery and starts priority dispatch to nearest feasible volunteers and receivers by travel time.
                </p>
              ) : (
                <p className="mt-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700">
                  Bulk mode groups many dishes under one parent event and chooses either a single receiver or split allocations based on route feasibility.
                </p>
              )}
            </div>

            {supplierMessage ? (
              <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2">
                <span>✅</span> {supplierMessage}
              </div>
            ) : null}

            {supplierEmergencyResult ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-rose-700">Urgent circulation status</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  Priority: {supplierEmergencyResult.priorityLevel.toUpperCase()} • State: {supplierEmergencyResult.priorityState}
                </p>
                <p className="mt-1 text-slate-700">
                  Expected response: {supplierEmergencyResult.expectedResponseMinutes ?? "--"} min • Window: {supplierEmergencyResult.safeWindowMinutes} min
                </p>
                <p className="mt-2 text-xs text-slate-700">
                  Alerts: attempted {supplierEmergencyResult.notification.attempted}, sent {supplierEmergencyResult.notification.sent}, failed {supplierEmergencyResult.notification.failed} ({supplierEmergencyResult.notification.mode})
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-rose-200 bg-white p-2">
                    <p className="text-xs font-semibold text-slate-700">Assigned volunteer</p>
                    <p className="text-xs text-slate-600">
                      {supplierEmergencyResult.assignedVolunteer
                        ? `${supplierEmergencyResult.assignedVolunteer.displayName} (${supplierEmergencyResult.assignedVolunteer.etaMinutes} min)`
                        : "No volunteer assigned"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-white p-2">
                    <p className="text-xs font-semibold text-slate-700">Assigned receiver / NGO</p>
                    <p className="text-xs text-slate-600">
                      {supplierEmergencyResult.assignedReceiver
                        ? `${supplierEmergencyResult.assignedReceiver.displayName} (${supplierEmergencyResult.assignedReceiver.etaMinutes} min)`
                        : "No receiver assigned"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {supplierBulkResult ? (
              <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Bulk logistics status</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  Strategy: {supplierBulkResult.strategy} • State: {supplierBulkResult.status}
                </p>
                <p className="mt-1 text-slate-700">
                  Window: {supplierBulkResult.safeWindowMinutes} min • Expected response: {supplierBulkResult.expectedResponseMinutes ?? "--"} min
                </p>
                <p className="mt-1 text-slate-700">
                  Total: {supplierBulkResult.totalQuantity} meals • Unallocated: {supplierBulkResult.unallocatedQuantity}
                </p>
                {supplierBulkResult.assignedVolunteer ? (
                  <p className="mt-1 text-xs text-slate-700">
                    Volunteer: {supplierBulkResult.assignedVolunteer.displayName} ({supplierBulkResult.assignedVolunteer.etaMinutes} min)
                  </p>
                ) : null}
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {supplierBulkResult.allocations.length ? (
                    supplierBulkResult.allocations.map((allocation) => (
                      <div key={`${allocation.receiverId}-${allocation.receiverName}`} className="rounded-lg border border-cyan-200 bg-white p-2">
                        <p className="text-xs font-semibold text-slate-800">{allocation.receiverName}</p>
                        <p className="text-xs text-slate-600">
                          {allocation.allocatedQuantity} meals • ETA {allocation.etaMinutes} min • {allocation.allocationType}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-600">No receiver allocation could be made within the current safe window.</p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">Active Supplier Listings</h3>
                <Button variant="outline" size="sm" onClick={() => void loadSupplierListings()}>
                  Refresh
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {supplierListings.length ? (
                  supplierListings.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{item.foodName}</p>
                        <div className="flex flex-wrap items-center gap-1">
                          {item.isEmergency ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 font-bold text-rose-700">
                              <AlertTriangle className="size-3.5" /> HIGH PRIORITY
                            </span>
                          ) : null}
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-bold ${
                            item.spoilageLabel === "Fresh"
                              ? "bg-emerald-100 text-emerald-700"
                              : item.spoilageLabel === "Use Soon"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                          }`}>
                            {item.spoilageLabel === "Urgent Pickup" ? <AlertTriangle className="size-3.5" /> : null}
                            {item.spoilageLabel}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-slate-600">
                        Score {item.spoilageScore}/100 • Pickup window {item.recommendedPickupWindowMinutes} min • Qty {item.quantity}
                      </p>
                      {item.isEmergency ? (
                        <p className="mt-1 text-slate-600">
                          State: {item.priorityState} • Expected response {item.expectedResponseMinutes ?? "--"} min
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-600">No active supplier listings yet.</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                className={`gap-2 ${
                  supplierPublishMode === "emergency"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : supplierPublishMode === "bulk"
                      ? "bg-cyan-600 hover:bg-cyan-700"
                      : "bg-amber-600 hover:bg-amber-700"
                }`}
                onClick={() =>
                  void (supplierPublishMode === "emergency"
                    ? submitEmergencySupplierListing()
                    : supplierPublishMode === "bulk"
                      ? submitBulkSupplierEvent()
                      : submitSupplierListing())
                }
                disabled={isPublishingSupplierListing || isTriggeringEmergencyListing || isPublishingBulkEvent}
              >
                {isPublishingSupplierListing || isTriggeringEmergencyListing || isPublishingBulkEvent ? <Loader2 className="size-4 animate-spin" /> : null}
                {supplierPublishMode === "emergency"
                  ? "Trigger Emergency Circulation"
                  : supplierPublishMode === "bulk"
                    ? "Publish Bulk Event"
                    : "Publish Listing"} <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-50 p-6 shadow-sm relative overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute right-0 top-0 -mr-16 -mt-16 h-32 w-32 rounded-full bg-sky-200 opacity-10 blur-3xl" />
              <div className="absolute left-0 bottom-0 -ml-16 -mb-16 h-32 w-32 rounded-full bg-cyan-200 opacity-10 blur-3xl" />
              
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="text-4xl">🚗</div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-cyan-700">Volunteer Control Room</p>
                    <h2 className="text-2xl font-black text-slate-900">Routing & Pickup Dashboard</h2>
                    <p className="mt-1 text-sm text-slate-600">Manage your live status, track nearby pickups, and complete final-mile deliveries to earn rewards.</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button 
                    variant={isVolunteerAvailable ? "default" : "outline"} 
                    onClick={() => {
                      setIsVolunteerAvailable((current) => !current);
                      setVolunteerMessage(
                        isVolunteerAvailable
                          ? "⏸️ Volunteer mode paused. New tasks will queue until you go live again."
                          : "✅ Volunteer mode live! You can now accept nearby pickup tasks."
                      );
                    }}
                    className={isVolunteerAvailable ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                  >
                    {isVolunteerAvailable ? "🔴 Set Offline" : "🟢 Set Live"}
                  </Button>
                  <Button variant="outline" onClick={() => void loadVolunteerTaskFeed()}>
                    Refresh Feed
                  </Button>
                </div>
              </div>

              <div className="relative mt-4 grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-semibold text-slate-700">
                  Transport
                  <select
                    value={volunteerTransportMode}
                    onChange={(event) => setVolunteerTransportMode(event.target.value as "bike" | "scooter" | "van" | "truck")}
                    className="mt-1 h-9 w-full rounded-md border border-cyan-200 bg-white px-2 text-xs"
                  >
                    <option value="bike">Bike</option>
                    <option value="scooter">Scooter</option>
                    <option value="van">Van</option>
                    <option value="truck">Truck</option>
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  Carrying Capacity (kg)
                  <Input
                    type="number"
                    min={5}
                    max={500}
                    value={volunteerCarryingCapacityKg}
                    onChange={(event) => setVolunteerCarryingCapacityKg(Math.max(5, Number(event.target.value) || 5))}
                    className="mt-1 h-9 border-cyan-200 bg-white text-xs"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  Preferred Zones
                  <Input
                    value={volunteerPreferredZones}
                    onChange={(event) => setVolunteerPreferredZones(event.target.value)}
                    placeholder="Central Bengaluru, Indiranagar"
                    className="mt-1 h-9 border-cyan-200 bg-white text-xs"
                  />
                </label>
              </div>

              {volunteerMessage ? (
                <p className="mt-3 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800 flex items-start gap-2">
                  <span>ℹ️</span> {volunteerMessage}
                </p>
              ) : null}

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                  <p className="text-sm font-bold text-slate-500 flex items-center gap-1">
                    <span>📍</span> STATUS
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-900">
                    {isVolunteerAvailable ? "🟢 Live" : "⚪ Offline"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Your availability to accept tasks.</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                  <p className="text-sm font-bold text-slate-500 flex items-center gap-1">
                    <span>📦</span> NEARBY PICKUPS
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-900">{volunteerQueue.length}</p>
                  <p className="mt-1 text-xs text-slate-600">Ranked tasks based on urgency, route, load-fit, and impact.</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-amber-50 to-white p-4">
                  <p className="text-sm font-bold text-slate-500 flex items-center gap-1">
                    <span>🌦️</span> WEATHER RISK
                  </p>
                  <p className="mt-2 text-lg font-black text-slate-900">
                    {volunteerWeatherAdvisory ? volunteerWeatherAdvisory.severity.toUpperCase() : "UNKNOWN"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {volunteerWeatherAdvisory
                      ? `${volunteerWeatherAdvisory.temperatureC.toFixed(1)}C, rain ${volunteerWeatherAdvisory.rainMm1h.toFixed(1)} mm/h`
                      : "No weather feed in this cycle."}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Cart-linked requests</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{cartCount}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Quick nav</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => router.push("/map")}>Map</Button>
                    <Button size="sm" variant="outline" onClick={() => router.push("/notifications")}>Alerts</Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Volunteer Workspace Focus</p>
              <p className="mt-1 text-sm text-slate-700">Main page now prioritizes live dispatch and workflow actions. Analytics are consolidated in the sidebar and analytics dashboard.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-500">Live tasks</p>
                  <p className="text-base font-bold text-slate-900">{volunteerTaskFeed.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-500">Pooled routes</p>
                  <p className="text-base font-bold text-slate-900">{volunteerPooledTasks.length}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] uppercase text-slate-500">Availability</p>
                  <p className="text-base font-bold text-slate-900">{isVolunteerAvailable ? "Live" : "Paused"}</p>
                </div>
              </div>
            </div>

            {volunteerWeatherAdvisory ? (
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 text-sm text-amber-900">
                <p className="font-bold">Weather advisory</p>
                <p className="mt-1">{volunteerWeatherAdvisory.advisory}</p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Multi-stop pooled routes</h3>
                  <p className="text-xs text-slate-600">Suggested bundled pickups with stop order and staged completion markers.</p>
                </div>
              </div>

              {volunteerPooledTasks.length ? (
                <div className="space-y-2">
                  {volunteerPooledTasks.map((pool) => (
                    <div key={pool.pooledTaskId} className="rounded-lg border border-blue-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900">{pool.title}</p>
                        <div className="flex flex-wrap items-center gap-1 text-[11px]">
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">Score {pool.score}</span>
                          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-700">Qty {pool.totalQuantity}</span>
                          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-700">ETA {pool.estimatedTotalMinutes} min</span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                        {pool.stopOrder.map((stop) => (
                          <span key={`${pool.pooledTaskId}-${stop.listingId}`} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-800">
                            Stop {stop.stopNumber}: {stop.supplierName} ({stop.quantity})
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  No pooled bundle recommended yet. Keep location and capacity updated to unlock multi-stop opportunities.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-50 p-5 shadow-sm relative overflow-hidden">
              {/* Decorative elements */}
              <div className="absolute right-0 bottom-0 -mr-12 -mb-12 h-24 w-24 rounded-full bg-sky-200 opacity-10 blur-2xl" />
              
              <div className="relative mb-4 flex items-start gap-3">
                <span className="text-2xl">📦</span>
                <div className="flex-1">
                  <h3 className="text-lg font-black text-slate-900">Rescue Queue</h3>
                  <p className="mt-0.5 text-xs text-slate-600">Assigned pickup tasks ready to start. Click &quot;Route&quot; to begin navigation and earn points.</p>
                  {isVolunteerTaskFeedLoading ? (
                    <p className="mt-1 text-[11px] text-cyan-700">Refreshing intelligent task ranking...</p>
                  ) : null}
                </div>
              </div>
              
              <div className="space-y-2">
                {volunteerQueue.length ? (
                  volunteerQueue.map((task) => (
                    <div key={task.taskId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 to-white p-3 hover:shadow-sm transition">
                      <div className="flex items-start gap-3 flex-1">
                        <span className="text-xl">#{task.rank}</span>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{task.title}</p>
                          <p className="mt-0.5 text-xs text-slate-600"><span className="font-medium">{task.supplierName}</span></p>
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                            <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-cyan-700">Score {task.score}/100</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Pickup {task.route.volunteerToPickupKm.toFixed(1)} km</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Total {task.route.totalMinutes} min</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Qty {task.quantity}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-slate-700">Load-fit {task.reasons.loadFit}%</span>
                            {task.urgency.emergency ? <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">Emergency</span> : null}
                            {task.reasons.tooHeavyForVehicle ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">Too Heavy</span> : null}
                          </div>
                          <div className="mt-2 grid gap-2 md:grid-cols-4">
                            <label className="text-[11px] font-semibold text-slate-700">
                              Stage
                              <select
                                value={volunteerWorkflowStatusByTask[task.taskId] ?? "accepted"}
                                onChange={(event) =>
                                  setVolunteerWorkflowStatusByTask((current) => ({
                                    ...current,
                                    [task.taskId]: event.target.value as VolunteerWorkflowStatus,
                                  }))
                                }
                                className="mt-1 h-8 w-full rounded-md border border-cyan-200 bg-white px-2 text-[11px]"
                              >
                                <option value="accepted">Accepted</option>
                                <option value="arrived_supplier">Arrived at supplier</option>
                                <option value="collected">Collected</option>
                                <option value="in_transit">In transit</option>
                                <option value="delivered">Delivered</option>
                              </select>
                            </label>

                            <label className="text-[11px] font-semibold text-slate-700 md:col-span-2">
                              Proof note
                              <Input
                                value={volunteerWorkflowNoteByTask[task.taskId] ?? ""}
                                onChange={(event) =>
                                  setVolunteerWorkflowNoteByTask((current) => ({
                                    ...current,
                                    [task.taskId]: event.target.value,
                                  }))
                                }
                                placeholder="Optional handoff note"
                                className="mt-1 h-8 border-cyan-200 bg-white text-[11px]"
                              />
                            </label>

                            <label className="text-[11px] font-semibold text-slate-700">
                              Proof image
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(event) => {
                                  const file = event.target.files?.[0] ?? null;
                                  setVolunteerWorkflowProofByTask((current) => ({
                                    ...current,
                                    [task.taskId]: file,
                                  }));
                                }}
                                className="mt-1 block w-full text-[11px]"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-cyan-100 px-3 py-1.5 text-xs font-bold text-cyan-700 inline-flex items-center gap-1">
                          ⏱️ {task.route.volunteerToPickupMinutes} min to pickup
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(volunteerWorkflowBusyByTask[task.taskId])}
                          onClick={() => void submitVolunteerWorkflowUpdate(task)}
                        >
                          {volunteerWorkflowBusyByTask[task.taskId] ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          Update Stage
                        </Button>
                        <Button size="sm" className="gap-1 bg-cyan-600 hover:bg-cyan-700" onClick={() => {
                          setMode("consumer");
                          setIsMapOpen(true);
                        }}>
                          <Navigation className="size-3.5" /> Route
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                    <p className="text-3xl mb-2">🎉</p>
                    <p className="text-sm text-slate-600">No rescue tasks available right now. <span className="font-semibold">Set yourself Live</span> and wait for nearby pickups to appear!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
          </div>
        </div>
      </section>

      {!trackingOrder && mode === "consumer" ? (
        <button
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl"
        >
          <ShoppingCart className="size-4" /> Cart ({cartCount}) <ArrowRight className="size-4" />
        </button>
      ) : null}

      <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>
              Refine listings by price, distance, food type, seller type, and delivery.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Max Price: Rs. {maxPriceFilter}
              <input
                type="range"
                min={0}
                max={250}
                value={maxPriceFilter}
                onChange={(event) => setMaxPriceFilter(Number(event.target.value))}
                className="w-full"
              />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Max Distance: {maxDistanceFilter} km
              <input
                type="range"
                min={1}
                max={15}
                value={maxDistanceFilter}
                onChange={(event) => setMaxDistanceFilter(Number(event.target.value))}
                className="w-full"
              />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Veg / Non Veg
              <select
                value={foodTypeFilter}
                onChange={(event) => setFoodTypeFilter(event.target.value as "all" | FoodType)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3"
              >
                <option value="all">All</option>
                <option value="veg">Veg</option>
                <option value="non_veg">Non Veg</option>
              </select>
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Individual Cook or Caterer
              <select
                value={sellerTypeFilter}
                onChange={(event) => setSellerTypeFilter(event.target.value as "all" | SellerType)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3"
              >
                <option value="all">All</option>
                <option value="individual">Individual cook</option>
                <option value="caterer">Caterer</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={deliveryOnlyFilter}
                onChange={(event) => setDeliveryOnlyFilter(event.target.checked)}
              />
              Delivery available only
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFilterOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMapOpen} onOpenChange={setIsMapOpen}>
        <DialogContent className="max-w-5xl p-3 md:p-5">
          <DialogHeader>
            <DialogTitle>Nearby Food on Map</DialogTitle>
            <DialogDescription>
              Green markers are nearby food listings. Blue marker shows your current location.
            </DialogDescription>
          </DialogHeader>

          <ConsumerNearbyMap
            listings={consumerListings}
            cart={commerceState.cart}
            stock={commerceState.stock}
            onReserve={reserveListing}
            onRelease={releaseListing}
          />
        </DialogContent>
      </Dialog>

      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Your Cart</SheetTitle>
            <SheetDescription>
              Reserved items are reduced from available stock immediately to avoid conflicts.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-2">
            {cartItems.length ? (
              cartItems.map((item) => (
                <div key={item.listing.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="font-semibold text-slate-900">{item.listing.dish}</p>
                  <p className="text-sm text-slate-600">
                    Rs. {item.listing.unitPrice} x {item.quantity} {item.listing.unit}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-2 py-1">
                      <button onClick={() => releaseListing(item.listing.id)} className="rounded p-1 hover:bg-slate-100">
                        <Minus className="size-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button onClick={() => reserveListing(item.listing.id)} className="rounded p-1 hover:bg-slate-100">
                        <Plus className="size-4" />
                      </button>
                    </div>
                    <p className="text-sm font-bold text-slate-900">Rs. {item.lineTotal}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center text-slate-600">
                Cart is empty.
              </div>
            )}
          </div>

          <SheetFooter className="border-t border-slate-200">
            <div className="w-full space-y-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>Rs. {subTotal}</span></div>
              <div className="flex justify-between"><span>Convenience fee</span><span>Rs. {convenienceFee}</span></div>
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>Rs. {totalAmount}</span></div>

              {paymentMessage ? (
                <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  {paymentMessage}
                </p>
              ) : null}

              <Button
                className="w-full"
                disabled={!cartItems.length || isPaying}
                onClick={() => void handlePayNow()}
              >
                {isPaying ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />} 
                Pay with GPay
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      </div>
    </main>
  );
}
