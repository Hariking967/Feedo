"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/platform/layout/dashboard-shell";
import { StatCard } from "@/components/platform/common/stat-card";
import { DonationCard } from "@/components/platform/dashboard/donation-card";
import { MatchCard } from "@/components/platform/dashboard/match-card";
import { VolunteerTaskCard } from "@/components/platform/dashboard/volunteer-task-card";
import { RouteSummaryCard } from "@/components/platform/dashboard/route-summary-card";
import { CapacityPanel } from "@/components/platform/dashboard/capacity-panel";
import { AnalyticsChartCard } from "@/components/platform/analytics/analytics-chart-card";
import { TimelineCard } from "@/components/platform/common/timeline-card";
import { SearchAndFilterBar } from "@/components/platform/common/search-and-filter-bar";
import { MapPanel } from "@/components/platform/map/map-panel";
import {
  notifications,
  donations as initialDonations,
  recipients,
  volunteers,
  activeRoute,
  crisisZones,
  impactSeries,
} from "@/lib/platform/mock-data";
import type { Donation, RouteModel } from "@/lib/platform/types";
import type { CrisisState } from "@/modules/home/types/logistics";
import { fetchDonations, saveDonations } from "@/lib/platform/service";
import { useDonationsRealtime } from "@/lib/integrations/realtime";
import { geocodeAddress } from "@/lib/integrations/geocoding";
import { fetchDirections } from "@/lib/integrations/routing";
import { registerPushToken } from "@/lib/integrations/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { NotificationItem } from "@/components/platform/common/notification-item";
import { CrisisBanner } from "@/components/platform/crisis/crisis-banner";
import { LoadingState } from "@/components/platform/common/loading-state";
import { ErrorState } from "@/components/platform/common/error-state";
import { EmptyState } from "@/components/platform/common/empty-state";
import { InstructionCallout } from "@/components/platform/common/instruction-callout";
import { ScoreRing } from "@/components/platform/common/score-ring";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings2, List, ClipboardList, History, CheckCircle2, Truck, Navigation } from "lucide-react";

const LocationPickerMap = dynamic(
  () => import("@/components/location-picker-map"),
  {
    ssr: false,
  },
);

export type DashboardRole = "donor" | "recipient" | "volunteer" | "analytics";

interface NgoWantedItem {
  id: string;
  name: string;
  quantity: number;
  favorite: boolean;
  createdAt: number;
}

interface NgoRequestedOrder {
  id: string;
  donationId: string;
  title: string;
  donorName: string;
  quantity: number;
  pickupLocation: Donation["pickupLocation"];
  requestedAt: number;
  favorite: boolean;
  status: "requested" | "assigned" | "delivered";
}

interface VolunteerRouteOption {
  id: string;
  label: string;
  strategy: "distance" | "urgency" | "balanced";
  orders: NgoRequestedOrder[];
  totalDistanceKm: number;
  etaMinutes: number;
  qualityScore: number;
  geometry: Array<{ lat: number; lng: number }>;
}

interface RankedReceiverFeedItem {
  rank: number;
  rankScore: number;
  listingId: string;
  supplierUserId: string;
  supplierName: string;
  foodName: string;
  quantity: number;
  foodCategory: string;
  pickupAddress: string | null;
  pickupLat: number;
  pickupLng: number;
  spoilageScore: number;
  spoilageLabel: string;
  recommendedPickupWindowMinutes: number;
  timeRemainingMinutes: number;
  routeDurationMinutes: number;
  routeDistanceKm: number;
  priorityState: string;
  status: string;
  isFeasible: boolean;
  reasons: {
    quantityScore: number;
    suitabilityScore: number;
    freshnessScore: number;
    urgencyScore: number;
    travelScore: number;
    wantedMatch: boolean;
    acceptsCategory: boolean;
  };
}

interface ReceiverNeedRequest {
  id: string;
  need_title: string;
  required_meals: number;
  food_preference: string;
  meal_slot: string;
  window_start_at: string;
  window_end_at: string;
  urgency_level: string;
  location_address: string | null;
  status: string;
  created_at: string;
}

interface SupplierNeedPrompt {
  id: string;
  need_request_id: string;
  prompt_score: number;
  distance_km: number | null;
  recent_listing_count: number | null;
  avg_quantity: number | null;
  prompt_status: string;
  sent_at: string;
  need: {
    id: string;
    receiver_name: string;
    need_title: string;
    required_meals: number;
    food_preference: string;
    meal_slot: string;
    window_start_at: string;
    window_end_at: string;
    urgency_level: string;
    note: string | null;
    location_address: string | null;
    status: string;
  } | null;
}

const NGO_WANTED_KEY = "frp.ngo.wanted.v1";
const NGO_FAVORITES_KEY = "frp.ngo.favorites.v1";
const NGO_ORDERS_KEY = "frp.ngo.orders.v1";
const CRISIS_MODE_STORAGE_KEY = "frp.crisis-mode.enabled.v1";
const CRISIS_MIN_RADIUS_MULTIPLIER = 2.2;
const CRISIS_MIN_PRIORITY_WEIGHT = 1.4;
const CRISIS_MIN_BASE_RADIUS_KM = 12;
const CRISIS_AUTO_ACCEPT_LIMIT = 3;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function calcReadiness(
  estimatedMeals: number,
  minutesToExpire: number,
  refrigeration: boolean,
) {
  const normalizedMeals = clampNumber(estimatedMeals / 120, 0, 1);
  const freshnessFactor = clampNumber(minutesToExpire / 240, 0, 1);
  const urgencyPenalty =
    minutesToExpire <= 30 ? 0.24 : minutesToExpire <= 60 ? 0.14 : 0.04;
  const refrigerationBonus = refrigeration ? 0.08 : 0;

  const composite =
    normalizedMeals * 0.32 +
    freshnessFactor * 0.56 +
    refrigerationBonus -
    urgencyPenalty;

  return Math.round(clampNumber(composite, 0, 1) * 100);
}

function safetyFromMinutes(minutesToExpire: number): Donation["safetyStatus"] {
  if (minutesToExpire <= 20) return "not_suitable";
  if (minutesToExpire <= 45) return "pickup_soon";
  return "safe";
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return earthRadiusKm * y;
}

function estimateRouteDistance(
  start: { lat: number; lng: number },
  pickupPoints: Array<{ lat: number; lng: number }>,
  end: { lat: number; lng: number },
) {
  let total = 0;
  let current = start;

  for (const point of pickupPoints) {
    total += haversineKm(current, point);
    current = point;
  }

  total += haversineKm(current, end);
  return Number(total.toFixed(2));
}

function byNearestNeighbor(
  orders: NgoRequestedOrder[],
  start: { lat: number; lng: number },
  count: number,
) {
  const remaining = [...orders];
  const selected: NgoRequestedOrder[] = [];
  let current = start;

  while (remaining.length && selected.length < count) {
    remaining.sort(
      (a, b) =>
        haversineKm(current, a.pickupLocation) -
        haversineKm(current, b.pickupLocation),
    );
    const [next] = remaining.splice(0, 1);
    selected.push(next);
    current = next.pickupLocation;
  }

  return selected;
}

function routeDistanceFromOrders(
  start: { lat: number; lng: number },
  orders: NgoRequestedOrder[],
  end: { lat: number; lng: number },
) {
  return Number(
    estimateRouteDistance(
      start,
      orders.map((order) => ({
        lat: order.pickupLocation.lat,
        lng: order.pickupLocation.lng,
      })),
      end,
    ).toFixed(2),
  );
}

function optimizeOrdersWithTwoOpt(
  orders: NgoRequestedOrder[],
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
) {
  if (orders.length <= 2) return orders;

  let best = [...orders];
  let bestDistance = routeDistanceFromOrders(start, best, end);
  let improved = true;
  let iterations = 0;

  while (improved && iterations < 35) {
    improved = false;
    iterations += 1;

    for (let i = 0; i < best.length - 1; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const candidateDistance = routeDistanceFromOrders(
          start,
          candidate,
          end,
        );

        if (candidateDistance + 0.05 < bestDistance) {
          best = candidate;
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
  }

  return best;
}

function urgencyRankForOrder(
  order: NgoRequestedOrder,
  donation: Donation | undefined,
) {
  const urgencyBoost =
    donation?.urgency === "critical"
      ? 4
      : donation?.urgency === "high"
        ? 3
        : donation?.urgency === "medium"
          ? 2
          : 1;
  const ageMinutes = Math.max(
    1,
    Math.round((Date.now() - order.requestedAt) / 60000),
  );
  const ageBoost = clampNumber(ageMinutes / 30, 0, 4);
  const favoriteBoost = order.favorite ? 1.6 : 0;
  return urgencyBoost + ageBoost + favoriteBoost;
}

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function deterministicFoodScore(
  donation: Donation,
  distanceKm: number,
  crisisActive: boolean,
) {
  const urgency =
    donation.urgency === "critical"
      ? 1
      : donation.urgency === "high"
        ? 0.85
        : donation.urgency === "medium"
          ? 0.6
          : 0.4;
  const safety =
    donation.safetyStatus === "safe"
      ? 1
      : donation.safetyStatus === "pickup_soon"
        ? 0.65
        : 0.25;
  const distance = clampNumber(1 - distanceKm / 18, 0, 1);
  const reliability = clampNumber(
    (donation.donor.reliabilityScore ?? 0) / 100,
    0,
    1,
  );
  const crisisBoost = crisisActive ? 0.08 : 0;

  const total =
    urgency * 0.35 +
    safety * 0.25 +
    distance * 0.2 +
    reliability * 0.2 +
    crisisBoost;

  return Math.round(clampNumber(total, 0, 1) * 100);
}

export function RoleDashboard({ role }: { role: DashboardRole }) {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [routeModel, setRouteModel] = useState<RouteModel>(activeRoute);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [geoSuggestion, setGeoSuggestion] = useState<string | null>(null);
  const [pushReady, setPushReady] = useState<boolean | null>(null);
  const [pickupConfirmed, setPickupConfirmed] = useState(false);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const [latestAssessment, setLatestAssessment] = useState<{
    readinessScore: number;
    safetyStatus: Donation["safetyStatus"];
  } | null>(null);
  const [crisisModeEnabled, setCrisisModeEnabled] = useState(false);
  const [crisisAutoAcceptEnabled, setCrisisAutoAcceptEnabled] = useState(true);
  const [priorityWeight, setPriorityWeight] = useState(1.1);
  const [baseAcceptanceRangeKm, setBaseAcceptanceRangeKm] = useState(8);
  const [nearbyCrisis, setNearbyCrisis] = useState<CrisisState | null>(null);
  const [selectedTaskDonationId, setSelectedTaskDonationId] = useState<
    string | null
  >(null);
  const [ngoFavorites, setNgoFavorites] = useState<string[]>([]);
  const [ngoWantedItems, setNgoWantedItems] = useState<NgoWantedItem[]>([]);
  const [ngoRequestedOrders, setNgoRequestedOrders] = useState<
    NgoRequestedOrder[]
  >([]);
  const [ngoCart, setNgoCart] = useState<Record<string, number>>({});
  const [ngoStock, setNgoStock] = useState<Record<string, number>>({});
  const [wantedName, setWantedName] = useState("");
  const [wantedQuantity, setWantedQuantity] = useState(10);
  const [selectedStopCount, setSelectedStopCount] = useState(1);
  const [selectedRouteOptionId, setSelectedRouteOptionId] = useState<
    string | null
  >(null);
  const [rankedReceiverFeed, setRankedReceiverFeed] = useState<
    RankedReceiverFeedItem[]
  >([]);
  const [isRankedFeedLoading, setIsRankedFeedLoading] = useState(false);
  const [rankedFeedSource, setRankedFeedSource] = useState<string>("fallback");
  const [needTitle, setNeedTitle] = useState("30 meals tonight");
  const [needMeals, setNeedMeals] = useState(30);
  const [needFoodPreference, setNeedFoodPreference] = useState<
    "any" | "veg" | "non_veg" | "dairy" | "bakery" | "rice" | "seafood"
  >("veg");
  const [needMealSlot, setNeedMealSlot] = useState<
    "tonight" | "breakfast" | "lunch" | "dinner" | "custom"
  >("tonight");
  const [needUrgency, setNeedUrgency] = useState<
    "low" | "medium" | "high" | "critical"
  >("high");
  const [needNote, setNeedNote] = useState("");
  const [needWindowStart, setNeedWindowStart] = useState("");
  const [needWindowEnd, setNeedWindowEnd] = useState("");
  const [isPostingNeed, setIsPostingNeed] = useState(false);
  const [needPostMessage, setNeedPostMessage] = useState<string | null>(null);
  const [receiverNeeds, setReceiverNeeds] = useState<ReceiverNeedRequest[]>([]);
  const [supplierNeedPrompts, setSupplierNeedPrompts] = useState<
    SupplierNeedPrompt[]
  >([]);
  const [isLoadingSupplierPrompts, setIsLoadingSupplierPrompts] =
    useState(false);

  const [form, setForm] = useState({
    title: "",
    category: "Meal Packs",
    foodType: "cooked",
    dietType: "veg",
    quantity: "",
    estimatedMeals: "",
    prepTime: "",
    expiresInMinutes: "",
    refrigerationRequired: false,
    allergens: "",
    description: "",
    pickupAddress: "",
    imageUrl: "",
    lat: "12.9716",
    lng: "77.5946",
  });

  const crisisRadiusMultiplier = useMemo(() => {
    if (!crisisModeEnabled) return 1;
    return Math.max(
      CRISIS_MIN_RADIUS_MULTIPLIER,
      nearbyCrisis?.radiusMultiplier ?? CRISIS_MIN_RADIUS_MULTIPLIER,
    );
  }, [crisisModeEnabled, nearbyCrisis?.radiusMultiplier]);

  const rankedFeedByListingId = useMemo(() => {
    const map = new Map<string, RankedReceiverFeedItem>();
    for (const item of rankedReceiverFeed) {
      map.set(item.listingId, item);
    }
    return map;
  }, [rankedReceiverFeed]);

  const rankedFeedDonations = useMemo(() => {
    return rankedReceiverFeed.map((item) => {
      const donationStatus: Donation["status"] =
        item.status === "partial"
          ? "matched"
          : [
                "pending",
                "matched",
                "assigned",
                "picked",
                "delivered",
                "expired",
              ].includes(item.status)
            ? (item.status as Donation["status"])
            : "pending";

      const urgency: Donation["urgency"] =
        item.timeRemainingMinutes <= 20
          ? "critical"
          : item.timeRemainingMinutes <= 45
            ? "high"
            : item.timeRemainingMinutes <= 90
              ? "medium"
              : "low";

      const safetyStatus: Donation["safetyStatus"] =
        item.timeRemainingMinutes <= 20
          ? "not_suitable"
          : item.timeRemainingMinutes <= 45
            ? "pickup_soon"
            : "safe";

      return {
        id: item.listingId,
        title: item.foodName,
        category: item.foodCategory,
        foodType: "cooked",
        dietType: item.foodCategory === "non_veg" ? "non_veg" : "veg",
        quantity: `${item.quantity} portions`,
        estimatedMeals: item.quantity,
        donor: {
          id: item.supplierUserId,
          name: item.supplierName,
          reliabilityScore: Math.max(
            55,
            100 - Math.round(item.spoilageScore * 0.35),
          ),
        },
        status: donationStatus,
        safetyStatus,
        readinessScore: item.rankScore,
        nutritionTags: [
          item.priorityState,
          `Spoilage ${item.spoilageLabel}`,
          `Travel ${item.routeDurationMinutes}m`,
        ],
        allergens: [],
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + Math.max(item.timeRemainingMinutes, 1) * 60000,
        ).toISOString(),
        pickupLocation: {
          lat: item.pickupLat,
          lng: item.pickupLng,
          address: item.pickupAddress ?? "Supplier pickup location",
        },
        assignedRecipient: undefined,
        assignedVolunteer: undefined,
        urgency,
      } satisfies Donation;
    });
  }, [rankedReceiverFeed]);

  const filteredDonations = useMemo(() => {
    return donations.filter((item) => {
      const matchesSearch = `${item.title} ${item.category} ${item.donor.name}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesFilter =
        filter === "all" || item.status === filter || item.urgency === filter;
      return matchesSearch && matchesFilter;
    });
  }, [donations, search, filter]);

  const reloadDonations = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await fetchDonations();
      setDonations(result.length ? result : initialDonations);
      setLoadError(null);
    } catch {
      setLoadError("Failed to load operational feed.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadDonations();
  }, [reloadDonations]);

  useDonationsRealtime(() => {
    void reloadDonations();
  });

  const loadRankedReceiverFeed = useCallback(async () => {
    if (role !== "recipient") return;

    setIsRankedFeedLoading(true);

    try {
      const params = new URLSearchParams();
      if (crisisModeEnabled) {
        params.set("crisisOverride", "force_on");
      }
      const url = params.toString()
        ? `/api/receiver/feed?${params.toString()}`
        : "/api/receiver/feed";
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Ranked feed unavailable");
      }

      const payload = (await response.json()) as {
        source?: string;
        rankingMode?: string;
        crisis?: {
          active?: boolean;
          severity?: CrisisState["severity"];
          reason?: string;
        };
        rankedFeed?: RankedReceiverFeedItem[];
      };

      setRankedReceiverFeed(
        Array.isArray(payload.rankedFeed) ? payload.rankedFeed : [],
      );
      const modeLabel = payload.rankingMode
        ? `${payload.source ?? "matching"} (${payload.rankingMode})`
        : (payload.source ?? "matching");
      setRankedFeedSource(modeLabel);
      if (payload.crisis?.active) {
        setNearbyCrisis((current) => ({
          active: true,
          severity: payload.crisis?.severity ?? current?.severity ?? "elevated",
          reason:
            payload.crisis?.reason ??
            current?.reason ??
            "Crisis weighting active",
          radiusMultiplier:
            current?.radiusMultiplier ?? CRISIS_MIN_RADIUS_MULTIPLIER,
        }));
      }
    } catch {
      setRankedReceiverFeed([]);
      setRankedFeedSource("fallback");
    } finally {
      setIsRankedFeedLoading(false);
    }
  }, [crisisModeEnabled, role]);

  const loadReceiverNeeds = useCallback(async () => {
    if (role !== "recipient") return;

    try {
      const response = await fetch("/api/receiver/needs", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Need history unavailable");
      }

      const payload = (await response.json()) as {
        needs?: ReceiverNeedRequest[];
      };

      setReceiverNeeds(Array.isArray(payload.needs) ? payload.needs : []);
    } catch {
      setReceiverNeeds([]);
    }
  }, [role]);

  const submitReceiverNeed = useCallback(async () => {
    if (role !== "recipient") return;

    const recipient = recipients[0];
    if (!recipient) {
      setNeedPostMessage(
        "Receiver profile unavailable. Cannot post need right now.",
      );
      return;
    }

    if (!needWindowStart || !needWindowEnd) {
      setNeedPostMessage("Select both start and end window times.");
      return;
    }

    const startAt = new Date(needWindowStart);
    const endAt = new Date(needWindowEnd);
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      endAt <= startAt
    ) {
      setNeedPostMessage("Invalid time window. End must be after start.");
      return;
    }

    setIsPostingNeed(true);
    setNeedPostMessage(null);

    const resolvedCrisisRadiusMultiplier = crisisModeEnabled
      ? Math.max(
          CRISIS_MIN_RADIUS_MULTIPLIER,
          nearbyCrisis?.radiusMultiplier ?? CRISIS_MIN_RADIUS_MULTIPLIER,
        )
      : 1;

    try {
      const response = await fetch("/api/receiver/needs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          needTitle: needTitle.trim() || `${needMeals} meals needed`,
          requiredMeals: Math.max(1, needMeals),
          foodPreference: needFoodPreference,
          mealSlot: needMealSlot,
          windowStartAt: startAt.toISOString(),
          windowEndAt: endAt.toISOString(),
          urgencyLevel: needUrgency,
          note: needNote.trim() || undefined,
          location: {
            lat: recipient.location.lat,
            lng: recipient.location.lng,
            address: recipient.location.address,
          },
          radiusKm: Number(
            (
              baseAcceptanceRangeKm *
              resolvedCrisisRadiusMultiplier *
              priorityWeight
            ).toFixed(1),
          ),
          crisisOverride: crisisModeEnabled ? "force_on" : "auto",
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        matching?: {
          targetedSupplierCount?: number;
        };
      } | null;

      if (!response.ok) {
        setNeedPostMessage(payload?.error ?? "Unable to post need request.");
        return;
      }

      setNeedPostMessage(
        `Need posted. Prompted ${payload?.matching?.targetedSupplierCount ?? 0} likely suppliers.`,
      );
      setNeedNote("");
      await Promise.all([loadReceiverNeeds(), loadRankedReceiverFeed()]);
    } catch {
      setNeedPostMessage("Need posting failed. Please retry.");
    } finally {
      setIsPostingNeed(false);
    }
  }, [
    baseAcceptanceRangeKm,
    crisisModeEnabled,
    loadRankedReceiverFeed,
    loadReceiverNeeds,
    nearbyCrisis?.radiusMultiplier,
    needFoodPreference,
    needMealSlot,
    needMeals,
    needNote,
    needTitle,
    needUrgency,
    needWindowEnd,
    needWindowStart,
    priorityWeight,
    role,
  ]);

  const loadSupplierNeedPrompts = useCallback(async () => {
    if (role !== "donor") return;

    setIsLoadingSupplierPrompts(true);

    try {
      const response = await fetch("/api/supplier/need-prompts", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Prompt feed unavailable");
      }

      const payload = (await response.json()) as {
        prompts?: SupplierNeedPrompt[];
      };

      setSupplierNeedPrompts(
        Array.isArray(payload.prompts) ? payload.prompts : [],
      );
    } catch {
      setSupplierNeedPrompts([]);
    } finally {
      setIsLoadingSupplierPrompts(false);
    }
  }, [role]);

  useEffect(() => {
    if (role !== "recipient") return;

    void loadRankedReceiverFeed();
    void loadReceiverNeeds();
    const timer = window.setInterval(() => {
      void loadRankedReceiverFeed();
      void loadReceiverNeeds();
    }, 45000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadRankedReceiverFeed, loadReceiverNeeds, role]);

  useEffect(() => {
    if (role !== "recipient") return;

    const start = new Date();
    start.setMinutes(start.getMinutes() + 60, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

    setNeedWindowStart((current) => current || toDateTimeLocalValue(start));
    setNeedWindowEnd((current) => current || toDateTimeLocalValue(end));
  }, [role]);

  useEffect(() => {
    if (role !== "donor") return;

    void loadSupplierNeedPrompts();
    const timer = window.setInterval(() => {
      void loadSupplierNeedPrompts();
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadSupplierNeedPrompts, role]);

  useEffect(() => {
    if (role !== "recipient") return;

    const defaultRecipient = recipients[0];
    if (!defaultRecipient) return;

    const wantedItems = ngoWantedItems.map((item) => item.name).filter(Boolean);
    const requiredMeals = Math.max(
      defaultRecipient.capacity,
      ngoWantedItems.reduce((sum, item) => sum + Math.max(0, item.quantity), 0),
    );
    const radiusMultiplier = crisisRadiusMultiplier;
    const effectiveRadius = Number(
      (baseAcceptanceRangeKm * radiusMultiplier * priorityWeight).toFixed(1),
    );

    const savePreferences = async () => {
      await fetch("/api/receiver/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "recipient",
          displayName: defaultRecipient.name,
          capacity: defaultRecipient.capacity,
          requiredMeals,
          acceptedFoodCategories: [
            "veg",
            "non_veg",
            "dairy",
            "bakery",
            "rice",
            "seafood",
          ],
          nutritionPreferences: defaultRecipient.nutritionPreferences,
          wantedItems,
          maxTravelMinutes: Math.max(20, Math.round(effectiveRadius * 6.2)),
          location: {
            lat: defaultRecipient.location.lat,
            lng: defaultRecipient.location.lng,
          },
          active: true,
        }),
      });
    };

    void savePreferences();
  }, [
    baseAcceptanceRangeKm,
    crisisRadiusMultiplier,
    ngoWantedItems,
    priorityWeight,
    role,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedCrisisMode = window.localStorage.getItem(
        CRISIS_MODE_STORAGE_KEY,
      );
      if (savedCrisisMode === "1") {
        setCrisisModeEnabled(true);
      }

      const savedWanted = window.localStorage.getItem(NGO_WANTED_KEY);
      if (savedWanted) {
        const parsed = JSON.parse(savedWanted) as NgoWantedItem[];
        setNgoWantedItems(Array.isArray(parsed) ? parsed : []);
      }

      const savedFavorites = window.localStorage.getItem(NGO_FAVORITES_KEY);
      if (savedFavorites) {
        const parsed = JSON.parse(savedFavorites) as string[];
        setNgoFavorites(Array.isArray(parsed) ? parsed : []);
      }

      const savedOrders = window.localStorage.getItem(NGO_ORDERS_KEY);
      if (savedOrders) {
        const parsed = JSON.parse(savedOrders) as NgoRequestedOrder[];
        setNgoRequestedOrders(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setNgoWantedItems([]);
      setNgoFavorites([]);
      setNgoRequestedOrders([]);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === NGO_ORDERS_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as NgoRequestedOrder[];
          setNgoRequestedOrders(Array.isArray(parsed) ? parsed : []);
        } catch {
          setNgoRequestedOrders([]);
        }
      }

      if (event.key === CRISIS_MODE_STORAGE_KEY && event.newValue) {
        setCrisisModeEnabled(event.newValue === "1");
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(NGO_WANTED_KEY, JSON.stringify(ngoWantedItems));
  }, [ngoWantedItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      NGO_FAVORITES_KEY,
      JSON.stringify(ngoFavorites),
    );
  }, [ngoFavorites]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      NGO_ORDERS_KEY,
      JSON.stringify(ngoRequestedOrders),
    );
  }, [ngoRequestedOrders]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      CRISIS_MODE_STORAGE_KEY,
      crisisModeEnabled ? "1" : "0",
    );
  }, [crisisModeEnabled]);

  useEffect(() => {
    let mounted = true;
    const setupNotifications = async () => {
      const ok = await registerPushToken();
      if (mounted) setPushReady(ok);
    };
    void setupNotifications();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const recipient = recipients[0];
    if (!recipient) return;

    let mounted = true;
    const loadNearbyCrisis = async () => {
      try {
        const params = new URLSearchParams({
          lat: String(recipient.location.lat),
          lng: String(recipient.location.lng),
          demandSpike: crisisModeEnabled ? "0.8" : "0.3",
        });
        const response = await fetch(
          `/api/logistics/crisis?${params.toString()}`,
        );
        if (!response.ok) return;
        const state = (await response.json()) as CrisisState;
        if (mounted) setNearbyCrisis(state);
      } catch {
        if (mounted) {
          setNearbyCrisis({
            active: false,
            severity: "normal",
            reason: "Crisis feed unavailable",
            radiusMultiplier: 1,
          });
        }
      }
    };

    void loadNearbyCrisis();
    const timer = window.setInterval(loadNearbyCrisis, 60000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [crisisModeEnabled]);

  useEffect(() => {
    if (!donations.length) return;
    void saveDonations(donations);
  }, [donations]);

  const activeDonations = useMemo(
    () =>
      donations.filter(
        (item) => item.status !== "delivered" && item.status !== "expired",
      ),
    [donations],
  );

  useEffect(() => {
    if (!crisisModeEnabled) return;
    setPriorityWeight((current) =>
      Math.max(current, CRISIS_MIN_PRIORITY_WEIGHT),
    );
    setBaseAcceptanceRangeKm((current) =>
      Math.max(current, CRISIS_MIN_BASE_RADIUS_KM),
    );
    setCrisisAutoAcceptEnabled(true);
  }, [crisisModeEnabled]);

  const effectiveAcceptanceRangeKm = useMemo(() => {
    return Number(
      (baseAcceptanceRangeKm * crisisRadiusMultiplier * priorityWeight).toFixed(
        1,
      ),
    );
  }, [baseAcceptanceRangeKm, crisisRadiusMultiplier, priorityWeight]);

  const inRangeDonations = useMemo(() => {
    const recipient = recipients[0];
    if (!recipient) return donations;
    return donations.filter((donation) => {
      const distance = haversineKm(recipient.location, donation.pickupLocation);
      return distance <= effectiveAcceptanceRangeKm;
    });
  }, [donations, effectiveAcceptanceRangeKm]);

  const favoriteWantedTerms = useMemo(
    () =>
      ngoWantedItems
        .filter((item) => item.favorite)
        .map((item) => item.name.toLowerCase()),
    [ngoWantedItems],
  );

  const ngoMarketplaceDonations = useMemo(() => {
    if (role === "recipient" && rankedFeedDonations.length) {
      return rankedFeedDonations;
    }

    const recipient = recipients[0];
    if (!recipient) return [] as Donation[];

    return inRangeDonations
      .filter(
        (item) => item.status !== "delivered" && item.status !== "expired",
      )
      .sort((a, b) => {
        const aRanked = rankedFeedByListingId.get(a.id);
        const bRanked = rankedFeedByListingId.get(b.id);
        if (aRanked && bRanked && aRanked.rankScore !== bRanked.rankScore) {
          return bRanked.rankScore - aRanked.rankScore;
        }

        const aRequestedMatch = favoriteWantedTerms.some((term) =>
          a.title.toLowerCase().includes(term),
        );
        const bRequestedMatch = favoriteWantedTerms.some((term) =>
          b.title.toLowerCase().includes(term),
        );
        if (aRequestedMatch !== bRequestedMatch)
          return aRequestedMatch ? -1 : 1;

        const aFavorite = ngoFavorites.includes(a.id);
        const bFavorite = ngoFavorites.includes(b.id);
        if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;

        const aDistance = haversineKm(recipient.location, a.pickupLocation);
        const bDistance = haversineKm(recipient.location, b.pickupLocation);

        const urgencyBoost = (donation: Donation) => {
          if (!crisisModeEnabled) {
            return donation.urgency === "critical"
              ? 2.5
              : donation.urgency === "high"
                ? 1.4
                : 0.4;
          }
          return donation.urgency === "critical"
            ? 5
            : donation.urgency === "high"
              ? 3.2
              : 1;
        };

        const freshnessBoost = (donation: Donation) =>
          donation.safetyStatus === "not_suitable"
            ? -4
            : donation.safetyStatus === "pickup_soon"
              ? 1.2
              : 0.6;

        const aScore =
          urgencyBoost(a) +
          freshnessBoost(a) +
          (aFavorite ? 1 : 0) +
          (aRequestedMatch ? 1.2 : 0) +
          (crisisModeEnabled ? Math.max(0, priorityWeight - 1) * 2 : 0) -
          aDistance * (crisisModeEnabled ? 0.48 : 0.25);
        const bScore =
          urgencyBoost(b) +
          freshnessBoost(b) +
          (bFavorite ? 1 : 0) +
          (bRequestedMatch ? 1.2 : 0) +
          (crisisModeEnabled ? Math.max(0, priorityWeight - 1) * 2 : 0) -
          bDistance * (crisisModeEnabled ? 0.48 : 0.25);

        if (Math.abs(aScore - bScore) > 0.1) {
          return bScore - aScore;
        }

        return aDistance - bDistance;
      });
  }, [
    crisisModeEnabled,
    favoriteWantedTerms,
    inRangeDonations,
    ngoFavorites,
    priorityWeight,
    rankedFeedByListingId,
    rankedFeedDonations,
    role,
  ]);

  useEffect(() => {
    setNgoStock((current) => {
      const next = { ...current };
      for (const item of ngoMarketplaceDonations) {
        if (next[item.id] == null) {
          next[item.id] = Math.max(1, item.estimatedMeals);
        }
      }
      return next;
    });
  }, [ngoMarketplaceDonations]);

  const ngoOutstandingOrders = useMemo(
    () => ngoRequestedOrders.filter((item) => item.status === "requested"),
    [ngoRequestedOrders],
  );

  const ngoAssignedOrders = useMemo(
    () => ngoRequestedOrders.filter((item) => item.status === "assigned"),
    [ngoRequestedOrders],
  );

  const ngoDeliveredOrders = useMemo(
    () => ngoRequestedOrders.filter((item) => item.status === "delivered"),
    [ngoRequestedOrders],
  );

  const ngoDeliveryHistory = useMemo(
    () =>
      [...ngoDeliveredOrders]
        .sort((a, b) => b.requestedAt - a.requestedAt)
        .slice(0, 10),
    [ngoDeliveredOrders],
  );

  const volunteerOrderHistory = useMemo(
    () =>
      [...ngoRequestedOrders]
        .filter((item) => item.status !== "requested")
        .sort((a, b) => b.requestedAt - a.requestedAt)
        .slice(0, 12),
    [ngoRequestedOrders],
  );

  const openNgoOrders = ngoOutstandingOrders;

  useEffect(() => {
    setSelectedStopCount((current) => {
      if (!openNgoOrders.length) return 1;
      if (current < 1) return 1;
      if (current > openNgoOrders.length) return openNgoOrders.length;
      return current;
    });
  }, [openNgoOrders.length]);

  const volunteerRouteOptions = useMemo(() => {
    const volunteer = volunteers[0];
    const recipient = recipients[0];
    if (!volunteer || !recipient || !openNgoOrders.length)
      return [] as VolunteerRouteOption[];

    const stopCount = Math.max(
      1,
      Math.min(selectedStopCount, openNgoOrders.length),
    );
    const start = { lat: volunteer.location.lat, lng: volunteer.location.lng };
    const end = { lat: recipient.location.lat, lng: recipient.location.lng };

    const donationById = new Map(
      donations.map((donation) => [donation.id, donation]),
    );

    const nearestSeed = byNearestNeighbor(openNgoOrders, start, stopCount);
    const urgencySeed = [...openNgoOrders]
      .sort(
        (a, b) =>
          urgencyRankForOrder(b, donationById.get(b.donationId)) -
          urgencyRankForOrder(a, donationById.get(a.donationId)),
      )
      .slice(0, stopCount);
    const balancedSeed = [...openNgoOrders]
      .sort((a, b) => {
        const aDistance = haversineKm(start, a.pickupLocation);
        const bDistance = haversineKm(start, b.pickupLocation);
        const aUrgency = urgencyRankForOrder(a, donationById.get(a.donationId));
        const bUrgency = urgencyRankForOrder(b, donationById.get(b.donationId));
        return bUrgency - bDistance * 0.45 - (aUrgency - aDistance * 0.45);
      })
      .slice(0, stopCount);

    const buildOption = (
      id: string,
      label: string,
      strategy: VolunteerRouteOption["strategy"],
      seedOrders: NgoRequestedOrder[],
    ) => {
      const optimizedOrders = optimizeOrdersWithTwoOpt(seedOrders, start, end);
      const points = optimizedOrders.map((item) => ({
        lat: item.pickupLocation.lat,
        lng: item.pickupLocation.lng,
      }));
      const totalDistanceKm = routeDistanceFromOrders(
        start,
        optimizedOrders,
        end,
      );
      const drivingMinutes = Math.round(
        (totalDistanceKm / (crisisModeEnabled ? 20 : 24)) * 60,
      );
      const handlingMinutes = optimizedOrders.length * 5;
      const etaMinutes = Math.max(12, drivingMinutes + handlingMinutes);
      const urgentStops = optimizedOrders.filter((order) => {
        const donation = donationById.get(order.donationId);
        return donation?.urgency === "critical" || donation?.urgency === "high";
      }).length;
      const favoriteStops = optimizedOrders.filter(
        (order) => order.favorite,
      ).length;
      const avgWaitMinutes =
        optimizedOrders.length > 0
          ? optimizedOrders.reduce(
              (sum, order) =>
                sum +
                Math.max(
                  0,
                  Math.round((Date.now() - order.requestedAt) / 60000),
                ),
              0,
            ) / optimizedOrders.length
          : 0;
      const qualityScore = Math.round(
        clampNumber(
          100 -
            totalDistanceKm * 2.6 -
            etaMinutes * 0.35 +
            urgentStops * (crisisModeEnabled ? 11 : 8) +
            favoriteStops * 5 +
            Math.min(9, avgWaitMinutes / 20),
          8,
          99,
        ),
      );

      return {
        id,
        label,
        strategy,
        orders: optimizedOrders,
        totalDistanceKm,
        etaMinutes,
        qualityScore,
        geometry: [start, ...points, end],
      } satisfies VolunteerRouteOption;
    };

    const options = [
      buildOption(
        "distance",
        "Distance-optimized route",
        "distance",
        nearestSeed,
      ),
      buildOption("urgency", "Urgency-priority route", "urgency", urgencySeed),
      buildOption(
        "balanced",
        "Balanced rescue route",
        "balanced",
        balancedSeed,
      ),
    ];

    const deduped = options.filter((option, index) => {
      const signature = option.orders.map((order) => order.id).join("|");
      return (
        options.findIndex(
          (candidate) =>
            candidate.orders.map((order) => order.id).join("|") === signature,
        ) === index
      );
    });

    return deduped.sort((a, b) => {
      if (b.qualityScore !== a.qualityScore)
        return b.qualityScore - a.qualityScore;
      return a.totalDistanceKm - b.totalDistanceKm;
    });
  }, [crisisModeEnabled, donations, openNgoOrders, selectedStopCount]);

  const selectedRouteOption = useMemo(() => {
    if (!volunteerRouteOptions.length) return null;
    if (selectedRouteOptionId) {
      const matched = volunteerRouteOptions.find(
        (option) => option.id === selectedRouteOptionId,
      );
      if (matched) return matched;
    }
    return volunteerRouteOptions[0];
  }, [selectedRouteOptionId, volunteerRouteOptions]);

  const selectedTaskDonation = useMemo(() => {
    if (selectedRouteOption?.orders[0]) {
      return (
        donations.find(
          (item) => item.id === selectedRouteOption.orders[0].donationId,
        ) ?? null
      );
    }

    if (selectedTaskDonationId) {
      const matched = donations.find(
        (item) => item.id === selectedTaskDonationId,
      );
      if (matched) return matched;
    }
    return (
      donations.find(
        (item) => item.status === "assigned" || item.status === "matched",
      ) ?? null
    );
  }, [donations, selectedRouteOption, selectedTaskDonationId]);

  const mealsRescued = useMemo(
    () =>
      donations
        .filter((item) => item.status === "delivered")
        .reduce((sum, item) => sum + item.estimatedMeals, 0),
    [donations],
  );

  const submitDonation = () => {
    const estimatedMeals = Number(form.estimatedMeals || "0");
    const expiresInMinutes = Number(form.expiresInMinutes || "180");
    const readinessScore = calcReadiness(
      estimatedMeals,
      expiresInMinutes,
      form.refrigerationRequired,
    );

    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const donation: Donation = {
      id: `d-${Date.now()}`,
      title: form.title || "Untitled Donation",
      category: form.category,
      foodType: form.foodType as Donation["foodType"],
      dietType: form.dietType as Donation["dietType"],
      quantity: form.quantity || "0",
      estimatedMeals,
      donor: { id: "u-self", name: "Current Donor", reliabilityScore: 90 },
      status: "pending",
      safetyStatus: safetyFromMinutes(expiresInMinutes),
      readinessScore,
      nutritionTags: ["balanced meal"],
      allergens: form.allergens
        ? form.allergens.split(",").map((x) => x.trim())
        : [],
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      pickupLocation: {
        lat: Number(form.lat),
        lng: Number(form.lng),
        address: form.pickupAddress || "Address pending",
      },
      urgency: expiresInMinutes < 90 ? "high" : "medium",
    };

    setDonations((current) => [donation, ...current]);
    setLatestAssessment({
      readinessScore: donation.readinessScore,
      safetyStatus: donation.safetyStatus,
    });
  };

  const updateDonationStatus = (
    donationId: string,
    status: Donation["status"],
  ) => {
    setDonations((current) =>
      current.map((item) =>
        item.id === donationId ? { ...item, status } : item,
      ),
    );
  };

  const addNgoWantedItem = () => {
    const cleanedName = wantedName.trim();
    if (!cleanedName) return;

    const quantity = Math.max(1, wantedQuantity);
    setNgoWantedItems((current) => [
      {
        id: `wanted-${Date.now()}`,
        name: cleanedName,
        quantity,
        favorite: false,
        createdAt: Date.now(),
      },
      ...current,
    ]);
    setWantedName("");
    setWantedQuantity(10);
  };

  const toggleNgoWantedFavorite = (wantedId: string) => {
    setNgoWantedItems((current) =>
      current.map((item) =>
        item.id === wantedId ? { ...item, favorite: !item.favorite } : item,
      ),
    );
  };

  const toggleNgoFavoriteDonation = (donationId: string) => {
    setNgoFavorites((current) =>
      current.includes(donationId)
        ? current.filter((item) => item !== donationId)
        : [donationId, ...current],
    );
  };

  const reserveNgoDonation = (donationId: string) => {
    setNgoStock((current) => {
      const available = current[donationId] ?? 0;
      if (available <= 0) return current;
      return { ...current, [donationId]: available - 1 };
    });

    setNgoCart((current) => ({
      ...current,
      [donationId]: (current[donationId] ?? 0) + 1,
    }));
  };

  const releaseNgoDonation = (donationId: string) => {
    setNgoCart((current) => {
      const qty = current[donationId] ?? 0;
      if (qty <= 0) return current;

      const next = { ...current };
      if (qty === 1) {
        delete next[donationId];
      } else {
        next[donationId] = qty - 1;
      }
      return next;
    });

    setNgoStock((current) => ({
      ...current,
      [donationId]: (current[donationId] ?? 0) + 1,
    }));
  };

  const ngoCartItems = useMemo(
    () =>
      Object.entries(ngoCart)
        .map(([donationId, quantity]) => {
          const donation = ngoMarketplaceDonations.find(
            (item) => item.id === donationId,
          );
          if (!donation) return null;
          return { donation, quantity };
        })
        .filter((item): item is { donation: Donation; quantity: number } =>
          Boolean(item),
        ),
    [ngoCart, ngoMarketplaceDonations],
  );

  useEffect(() => {
    if (role !== "recipient" || !crisisModeEnabled || !crisisAutoAcceptEnabled)
      return;

    const feasibleRanked = ngoMarketplaceDonations
      .map((item) => ({ item, ranked: rankedFeedByListingId.get(item.id) }))
      .filter((entry) => entry.ranked?.isFeasible)
      .sort((a, b) => (b.ranked?.rankScore ?? 0) - (a.ranked?.rankScore ?? 0));

    if (!feasibleRanked.length) return;

    const chosen = feasibleRanked
      .filter(({ item }) => {
        const alreadyRequested = ngoRequestedOrders.some(
          (order) => order.donationId === item.id,
        );
        const inCart = (ngoCart[item.id] ?? 0) > 0;
        const available = (ngoStock[item.id] ?? item.estimatedMeals) > 0;
        return !alreadyRequested && !inCart && available;
      })
      .slice(0, CRISIS_AUTO_ACCEPT_LIMIT);

    if (!chosen.length) return;

    const requestedAt = Date.now();

    setNgoCart((current) => {
      const next = { ...current };
      for (const { item } of chosen) {
        next[item.id] = Math.max(1, next[item.id] ?? 0);
      }
      return next;
    });

    setNgoStock((current) => {
      const next = { ...current };
      for (const { item } of chosen) {
        next[item.id] = Math.max(0, (next[item.id] ?? item.estimatedMeals) - 1);
      }
      return next;
    });

    const autoOrders: NgoRequestedOrder[] = chosen.map(({ item }) => ({
      id: `order-${item.id}-${requestedAt}`,
      donationId: item.id,
      title: item.title,
      donorName: item.donor.name,
      quantity: 1,
      pickupLocation: item.pickupLocation,
      requestedAt,
      favorite: ngoFavorites.includes(item.id),
      status: "requested",
    }));

    setNgoRequestedOrders((current) => [...autoOrders, ...current]);

    setDonations((current) =>
      current.map((item) =>
        chosen.some((selected) => selected.item.id === item.id)
          ? { ...item, status: "matched" }
          : item,
      ),
    );
  }, [
    crisisAutoAcceptEnabled,
    crisisModeEnabled,
    ngoCart,
    ngoFavorites,
    ngoMarketplaceDonations,
    ngoRequestedOrders,
    ngoStock,
    rankedFeedByListingId,
    role,
  ]);

  const checkoutNgoRequests = () => {
    if (!ngoCartItems.length) return;

    const requestedAt = Date.now();
    const nextOrders: NgoRequestedOrder[] = ngoCartItems.map(
      ({ donation, quantity }) => ({
        id: `order-${donation.id}-${requestedAt}`,
        donationId: donation.id,
        title: donation.title,
        donorName: donation.donor.name,
        quantity,
        pickupLocation: donation.pickupLocation,
        requestedAt,
        favorite: ngoFavorites.includes(donation.id),
        status: "requested",
      }),
    );

    setNgoRequestedOrders((current) => [...nextOrders, ...current]);
    setNgoCart({});

    setDonations((current) =>
      current.map((item) =>
        ngoCartItems.some((cartItem) => cartItem.donation.id === item.id)
          ? { ...item, status: "matched" }
          : item,
      ),
    );
  };

  const applyVolunteerRoute = (option: VolunteerRouteOption | null) => {
    if (!option) return;

    setRouteModel({
      ...activeRoute,
      id: `ngo-route-${option.id}-${Date.now()}`,
      distance: option.totalDistanceKm,
      duration: option.etaMinutes,
      geometry: option.geometry,
      start: {
        lat: option.geometry[0].lat,
        lng: option.geometry[0].lng,
        address: volunteers[0]?.location.address ?? "Volunteer start",
      },
      end: recipients[0]?.location ?? activeRoute.end,
      steps: [
        {
          label: `Route strategy: ${option.strategy} (${option.qualityScore}/100)`,
          etaMinutes: 1,
        },
        ...option.orders.map((order, index) => ({
          label: `Stop ${index + 1}: ${order.title}`,
          etaMinutes: Math.max(
            5,
            Math.round(option.etaMinutes / Math.max(1, option.orders.length)),
          ),
        })),
      ],
    });
  };

  const acceptSelectedRoute = () => {
    if (!selectedRouteOption) return;

    setSelectedTaskDonationId(
      selectedRouteOption.orders[0]?.donationId ?? null,
    );
    setPickupConfirmed(false);
    setDeliveryConfirmed(false);

    setNgoRequestedOrders((current) =>
      current.map((order) =>
        selectedRouteOption.orders.some((item) => item.id === order.id)
          ? { ...order, status: "assigned" }
          : order,
      ),
    );

    setDonations((current) =>
      current.map((donation) =>
        selectedRouteOption.orders.some(
          (order) => order.donationId === donation.id,
        )
          ? { ...donation, status: "assigned" }
          : donation,
      ),
    );

    applyVolunteerRoute(selectedRouteOption);
  };

  const completeSelectedRoute = () => {
    if (!selectedRouteOption) return;

    setNgoRequestedOrders((current) =>
      current.map((order) =>
        selectedRouteOption.orders.some((item) => item.id === order.id)
          ? { ...order, status: "delivered" }
          : order,
      ),
    );

    setDonations((current) =>
      current.map((donation) =>
        selectedRouteOption.orders.some(
          (order) => order.donationId === donation.id,
        )
          ? { ...donation, status: "delivered" }
          : donation,
      ),
    );
  };

  const firstAssignedDonation = selectedTaskDonation;

  const refreshVolunteerRoute = useCallback(async () => {
    if (role !== "volunteer") return;
    const recipient = recipients[0];
    const volunteer = volunteers[0];
    if (!recipient || !volunteer) {
      setRouteModel(activeRoute);
      setRouteError(
        "No active assignment yet. Accept a task to generate live route guidance.",
      );
      return;
    }

    const plannedOrders = selectedRouteOption?.orders ?? [];
    const pickupStops = plannedOrders.length
      ? plannedOrders.map((order) => ({
          id: order.donationId,
          title: order.title,
          point: {
            lat: order.pickupLocation.lat,
            lng: order.pickupLocation.lng,
          },
        }))
      : firstAssignedDonation
        ? [
            {
              id: firstAssignedDonation.id,
              title: firstAssignedDonation.title,
              point: {
                lat: firstAssignedDonation.pickupLocation.lat,
                lng: firstAssignedDonation.pickupLocation.lng,
              },
            },
          ]
        : [];

    if (!pickupStops.length) {
      setRouteModel(activeRoute);
      setRouteError(
        "No active assignment yet. Accept a task to generate live route guidance.",
      );
      return;
    }

    setIsRouting(true);
    setRouteError(null);
    try {
      const waypoints = [
        { lat: volunteer.location.lat, lng: volunteer.location.lng },
        ...pickupStops.map((stop) => stop.point),
        { lat: recipient.location.lat, lng: recipient.location.lng },
      ];

      let totalDuration = 0;
      let totalDistance = 0;
      const mergedGeometry: Array<{ lat: number; lng: number }> = [];
      let hasProviderSegments = false;

      for (let index = 0; index < waypoints.length - 1; index += 1) {
        const segment = await fetchDirections(
          waypoints[index],
          waypoints[index + 1],
        );

        if (segment?.points?.length) {
          hasProviderSegments = true;
          totalDuration += Number(segment.durationMinutes ?? 0);
          totalDistance += Number(segment.distanceKm ?? 0);

          const segmentPoints = (segment.points as number[][])
            .filter((point) => point.length === 2)
            .map(([lat, lng]) => ({ lat, lng }));

          if (!segmentPoints.length) continue;
          if (!mergedGeometry.length) {
            mergedGeometry.push(...segmentPoints);
          } else {
            mergedGeometry.push(...segmentPoints.slice(1));
          }
        } else {
          const fallbackDistance = haversineKm(
            waypoints[index],
            waypoints[index + 1],
          );
          totalDistance += fallbackDistance;
          totalDuration += Math.max(
            5,
            Math.round((fallbackDistance / 22) * 60),
          );
          if (!mergedGeometry.length) {
            mergedGeometry.push(waypoints[index]);
          }
          mergedGeometry.push(waypoints[index + 1]);
        }
      }

      if (!mergedGeometry.length) {
        setRouteModel(activeRoute);
        setRouteError(
          "Live route unavailable right now. Showing fallback route.",
        );
        return;
      }

      const safetyStopMinutes = pickupStops.length * 5;
      const duration = Math.max(
        8,
        Math.round(totalDuration + safetyStopMinutes),
      );
      const distance = Number(totalDistance.toFixed(1));
      setRouteModel({
        ...activeRoute,
        id: `live-${pickupStops[0].id}-${Date.now()}`,
        distance,
        duration,
        geometry: mergedGeometry,
        start: volunteer.location,
        end: recipient.location,
        steps: [
          ...pickupStops.map((stop, index) => ({
            label: `Pickup ${index + 1}: ${stop.title}`,
            etaMinutes: Math.max(
              5,
              Math.round(duration * (0.5 / Math.max(1, pickupStops.length))),
            ),
          })),
          {
            label: "Final delivery to recipient",
            etaMinutes: Math.max(6, Math.round(duration * 0.45)),
          },
        ],
      });

      if (!hasProviderSegments) {
        setRouteError(
          "Using estimated fallback route because live providers were unavailable.",
        );
      }
    } finally {
      setIsRouting(false);
    }
  }, [firstAssignedDonation, role, selectedRouteOption]);

  useEffect(() => {
    if (role !== "volunteer") return;
    void refreshVolunteerRoute();
  }, [refreshVolunteerRoute, role]);

  const handleResolvePickupAddress = async () => {
    if (!form.pickupAddress.trim()) {
      setGeoSuggestion("Enter a pickup address first.");
      return;
    }

    const results = await geocodeAddress(form.pickupAddress);
    if (!results.length) {
      setGeoSuggestion("No location found for that address.");
      return;
    }

    const best = results[0];
    setForm((current) => ({
      ...current,
      lat: String(best.lat),
      lng: String(best.lng),
      pickupAddress: best.displayName,
    }));
    setGeoSuggestion(`Coordinates updated from: ${best.displayName}`);
  };

  const handleConfirmPickup = () => {
    setPickupConfirmed(true);
    if (firstAssignedDonation)
      updateDonationStatus(firstAssignedDonation.id, "picked");
  };

  const handleConfirmDelivery = () => {
    setDeliveryConfirmed(true);
    if (firstAssignedDonation)
      updateDonationStatus(firstAssignedDonation.id, "delivered");
  };

  if (isLoading) {
    return (
      <DashboardShell basePath={`/dashboard/${role}`} title="Loading workspace">
        <LoadingState message="Syncing live donations and routes..." />
      </DashboardShell>
    );
  }

  if (loadError) {
    return (
      <DashboardShell basePath={`/dashboard/${role}`} title="Loading workspace">
        <ErrorState
          title="Unable to load dashboard"
          message={loadError}
          onRetry={() => window.location.reload()}
        />
      </DashboardShell>
    );
  }

  if (role === "donor") {
    return (
      <DashboardShell
        basePath="/dashboard/donor"
        title="Donor Dashboard"
        liveStatus="Donation feed live"
      >
        <div className="space-y-4" id="donations">
          <InstructionCallout
            title="Donor Workflow"
            description="This screen helps you post food safely and track the rescue lifecycle."
            tone="primary"
            points={[
              "Fill the donation form with expiry and safety details.",
              "Use map pin or address resolver to set pickup location.",
              "Submit and monitor status cards below to see matching progress.",
            ]}
          />

          <section
            className={`rounded-xl border px-4 py-3 ${crisisModeEnabled ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50"}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Crisis impact for donor
            </p>
            <ul className="mt-2 grid gap-1 text-sm text-slate-700 md:grid-cols-3">
              <li>
                Priority handling:{" "}
                {crisisModeEnabled ? "Survival-first" : "Balanced"}
              </li>
              <li>Receiver radius: {effectiveAcceptanceRangeKm} km</li>
              <li>
                Auto-accept at receiver:{" "}
                {crisisModeEnabled ? "Enabled" : "Disabled"}
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Proactive Reverse Matching
            </p>
            <p className="text-sm text-blue-900">
              Supplier prompt feed is active. Nearby receiver advance-needs are
              scored and surfaced below in the &quot;Receiver Need Prompts&quot;
              panel.
            </p>
          </section>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active donations"
              value={activeDonations.length}
              tone="success"
            />
            <StatCard
              label="Picked up today"
              value={donations.filter((d) => d.status === "picked").length}
              tone="neutral"
            />
            <StatCard
              label="Meals rescued"
              value={mealsRescued}
              tone="success"
            />
            <StatCard label="Avg response time" value="11 min" tone="warning" />
          </div>

          <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-blue-900">
                  Receiver Need Prompts
                </h2>
                <p className="text-sm text-blue-800">
                  Advance requests from nearby receivers are ranked by urgency,
                  distance, and your listing history.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadSupplierNeedPrompts()}
              >
                Refresh prompts
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {isLoadingSupplierPrompts ? (
                <p className="text-sm text-blue-900">
                  Loading targeted prompts...
                </p>
              ) : supplierNeedPrompts.length ? (
                supplierNeedPrompts.slice(0, 6).map((prompt) => (
                  <article
                    key={prompt.id}
                    className="rounded-lg border border-blue-200 bg-white p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {prompt.need?.need_title ?? "Receiver need"}
                      </p>
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                        Score {Math.round(prompt.prompt_score)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {prompt.need?.required_meals ?? 0} meals |{" "}
                      {prompt.need?.food_preference ?? "any"} |{" "}
                      {prompt.need?.meal_slot ?? "custom"} |{" "}
                      {prompt.need?.urgency_level ?? "high"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Window:{" "}
                      {prompt.need?.window_start_at
                        ? new Date(prompt.need.window_start_at).toLocaleString()
                        : "-"}{" "}
                      to{" "}
                      {prompt.need?.window_end_at
                        ? new Date(prompt.need.window_end_at).toLocaleString()
                        : "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Distance{" "}
                      {prompt.distance_km != null
                        ? `${prompt.distance_km.toFixed(1)} km`
                        : "unknown"}{" "}
                      | Avg quantity {prompt.avg_quantity ?? "-"} | Recent
                      listings {prompt.recent_listing_count ?? "-"}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-blue-900">
                  No targeted receiver prompts yet. Keep this panel open to
                  catch new nearby needs.
                </p>
              )}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <section className="space-y-3 rounded-xl border border-[#bdf2b3] bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Create New Donation
              </h2>
              <p className="rounded-md bg-[#f1f9ef] px-3 py-2 text-xs text-[#1f4021]">
                Required fields: title, quantity, expiry, and pickup location.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Food title</Label>
                  <Input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Cooked / Packaged / Raw</Label>
                  <Input
                    value={form.foodType}
                    onChange={(e) =>
                      setForm({ ...form, foodType: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Veg / Non-veg / Egg</Label>
                  <Input
                    value={form.dietType}
                    onChange={(e) =>
                      setForm({ ...form, dietType: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Estimated meals</Label>
                  <Input
                    value={form.estimatedMeals}
                    onChange={(e) =>
                      setForm({ ...form, estimatedMeals: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Preparation time</Label>
                  <Input
                    value={form.prepTime}
                    onChange={(e) =>
                      setForm({ ...form, prepTime: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Expiry / pickup deadline (minutes)</Label>
                  <Input
                    value={form.expiresInMinutes}
                    onChange={(e) =>
                      setForm({ ...form, expiresInMinutes: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Allergens</Label>
                  <Input
                    value={form.allergens}
                    onChange={(e) =>
                      setForm({ ...form, allergens: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Image URL</Label>
                  <Input
                    value={form.imageUrl}
                    onChange={(e) =>
                      setForm({ ...form, imageUrl: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Latitude</Label>
                  <Input
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Pickup address</Label>
                  <Input
                    value={form.pickupAddress}
                    onChange={(e) =>
                      setForm({ ...form, pickupAddress: e.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResolvePickupAddress}
                  >
                    Resolve address to map pin
                  </Button>
                  {geoSuggestion ? (
                    <p className="text-xs text-slate-600">{geoSuggestion}</p>
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.refrigerationRequired}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, refrigerationRequired: checked })
                    }
                  />
                  <Label>Refrigeration required</Label>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>Pickup location selector</Label>
                  <LocationPickerMap
                    value={{ lat: Number(form.lat), lng: Number(form.lng) }}
                    onChange={(point) =>
                      setForm({
                        ...form,
                        lat: String(point.lat),
                        lng: String(point.lng),
                      })
                    }
                    zoom={14}
                  />
                </div>
              </div>
              <Button onClick={submitDonation}>Submit Donation</Button>

              {latestAssessment ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <p className="font-semibold">Rescue readiness generated</p>
                  <p>
                    Score: {latestAssessment.readinessScore}/100 | Safety:{" "}
                    {latestAssessment.safetyStatus}
                  </p>
                </div>
              ) : null}
            </section>

            <div className="space-y-3">
              <MapPanel
                donations={donations.slice(0, 4)}
                recipients={recipients}
                volunteers={volunteers}
                route={routeModel}
                heightClassName="h-[300px]"
              />
              <TimelineCard
                title="Donation status timeline"
                items={[
                  {
                    id: "1",
                    title: "Donation posted",
                    time: "10:10",
                    tone: "success",
                  },
                  {
                    id: "2",
                    title: "Matched with recipient",
                    time: "10:18",
                    tone: "neutral",
                  },
                  {
                    id: "3",
                    title: "Volunteer assigned",
                    time: "10:22",
                    tone: "warning",
                  },
                ]}
              />
            </div>
          </div>

          <SearchAndFilterBar
            search={search}
            onSearchChange={setSearch}
            filters={[
              "all",
              "pending",
              "matched",
              "assigned",
              "high",
              "critical",
            ]}
            activeFilter={filter}
            onFilterChange={setFilter}
          />

          <div className="grid gap-3 lg:grid-cols-2">
            {filteredDonations.length ? (
              filteredDonations.map((donation) => (
                <DonationCard key={donation.id} donation={donation} />
              ))
            ) : (
              <EmptyState
                title="No donations found"
                message="Try another search or create a new donation."
              />
            )}
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (role === "recipient") {
    return (
      <DashboardShell
        basePath="/dashboard/ngo"
        title="Recipient / NGO Dashboard"
        liveStatus="Smart feed + reverse matching active"
      >
        <InstructionCallout
          title="Recipient Workflow"
          description="Plan needs, prioritize favorites, reserve available donations, and place pickup requests."
          tone="secondary"
          points={[
            "Keep a wanted-items list for recurring food needs.",
            "Favorite trusted offers so they appear first in the feed.",
            "Reserve units to cart and place multi-order pickup requests.",
          ]}
        />

        <CrisisBanner
          active={crisisModeEnabled || Boolean(nearbyCrisis?.active)}
          message={
            crisisModeEnabled
              ? `Manual crisis mode is active. Ranking is survival-first and acceptance radius is expanded to ${effectiveAcceptanceRangeKm} km.`
              : nearbyCrisis?.active
                ? `Regional crisis signal detected (${nearbyCrisis.severity}). Matching and routing are being weighted for urgent deliveries.`
                : ""
          }
        />

        <section className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Receiver-Centric Intelligence
          </p>
          <p className="text-sm text-blue-900">
            Ranked feed uses need fit, category suitability, spoilage risk,
            urgency window, and route travel feasibility. Advance need posting
            triggers proactive supplier nudges.
          </p>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Ranked offers"
            value={ngoMarketplaceDonations.length}
            tone="success"
          />
          <StatCard
            label="Favorite matches"
            value={
              ngoMarketplaceDonations.filter((item) =>
                ngoFavorites.includes(item.id),
              ).length
            }
            tone="neutral"
          />
          <StatCard
            label="Open NGO requests"
            value={ngoOutstandingOrders.length}
            tone="warning"
          />
          <StatCard
            label="Feed source"
            value={isRankedFeedLoading ? "Updating" : rankedFeedSource}
            tone="warning"
          />
          <StatCard
            label="Advance needs posted"
            value={receiverNeeds.length}
            tone="neutral"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <section className="rounded-xl border border-rose-300 bg-rose-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-rose-900">
                    Crisis Mode
                  </h3>
                  <p className="text-sm text-rose-700">
                    Prioritize nearby disaster zones and expand intake radius
                    automatically.
                  </p>
                </div>
                <Switch
                  checked={crisisModeEnabled}
                  onCheckedChange={setCrisisModeEnabled}
                />
              </div>

              <div className="mt-3 rounded-md border border-rose-200 bg-white px-3 py-2 text-xs text-rose-900">
                Crisis mode profile for 3 users: donor dispatch escalates,
                recipient matching radius expands, volunteer routing prioritizes
                fastest feasible rescue.
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm text-rose-900">
                  <span className="font-medium">
                    Priority weight ({priorityWeight.toFixed(1)}x)
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="2"
                    step="0.1"
                    value={priorityWeight}
                    onChange={(event) =>
                      setPriorityWeight(Number(event.target.value))
                    }
                    className="w-full"
                  />
                </label>
                <label className="space-y-1 text-sm text-rose-900">
                  <span className="font-medium">
                    Base acceptance range ({baseAcceptanceRangeKm} km)
                  </span>
                  <input
                    type="range"
                    min="4"
                    max="15"
                    step="1"
                    value={baseAcceptanceRangeKm}
                    onChange={(event) =>
                      setBaseAcceptanceRangeKm(Number(event.target.value))
                    }
                    className="w-full"
                  />
                </label>
              </div>

              <label className="mt-3 flex items-center justify-between rounded-md border border-rose-200 bg-white px-3 py-2 text-sm text-rose-900">
                <span className="font-medium">
                  Auto-accept top crisis recommendations
                </span>
                <Switch
                  checked={crisisAutoAcceptEnabled}
                  onCheckedChange={setCrisisAutoAcceptEnabled}
                />
              </label>

              <p className="mt-2 rounded-md bg-white/70 px-3 py-2 text-sm text-rose-900">
                Nearby signal:{" "}
                {nearbyCrisis?.reason ?? "Loading nearby disaster feed..."}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-rose-800">
                Effective acceptance radius: {effectiveAcceptanceRangeKm} km |
                Severity: {(nearbyCrisis?.severity ?? "normal").toUpperCase()} |
                Auto-accept {crisisAutoAcceptEnabled ? "ON" : "OFF"}
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">
                Wanted food items
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Track priority needs so your team can align requests quickly.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1.5fr_1fr_auto]">
                <Input
                  value={wantedName}
                  onChange={(event) => setWantedName(event.target.value)}
                  placeholder="Example: Cooked veg meals"
                />
                <Input
                  type="number"
                  min={1}
                  value={wantedQuantity}
                  onChange={(event) =>
                    setWantedQuantity(Number(event.target.value) || 1)
                  }
                  placeholder="Quantity"
                />
                <Button type="button" onClick={addNgoWantedItem}>
                  Add item
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {ngoWantedItems.length ? (
                  ngoWantedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {item.name}
                        </p>
                        <p className="text-xs text-slate-600">
                          Target quantity: {item.quantity}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={item.favorite ? "default" : "outline"}
                        onClick={() => toggleNgoWantedFavorite(item.id)}
                      >
                        {item.favorite ? "Favorited" : "Favorite"}
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No wanted items added yet.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h3 className="text-base font-semibold text-blue-900">
                Post advance need to target likely suppliers
              </h3>
              <p className="mt-1 text-sm text-blue-800">
                Create a future requirement and Feedo will notify suppliers with
                matching surplus patterns near you.
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Need title</Label>
                  <Input
                    value={needTitle}
                    onChange={(event) => setNeedTitle(event.target.value)}
                    placeholder="30 meals tonight"
                  />
                </div>
                <div>
                  <Label>Required meals</Label>
                  <Input
                    type="number"
                    min={1}
                    value={needMeals}
                    onChange={(event) =>
                      setNeedMeals(Math.max(1, Number(event.target.value) || 1))
                    }
                  />
                </div>

                <div>
                  <Label>Food preference</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={needFoodPreference}
                    onChange={(event) =>
                      setNeedFoodPreference(
                        event.target.value as typeof needFoodPreference,
                      )
                    }
                  >
                    <option value="any">Any</option>
                    <option value="veg">Veg</option>
                    <option value="non_veg">Non-veg</option>
                    <option value="dairy">Dairy</option>
                    <option value="bakery">Bakery</option>
                    <option value="rice">Rice</option>
                    <option value="seafood">Seafood</option>
                  </select>
                </div>

                <div>
                  <Label>Meal slot</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={needMealSlot}
                    onChange={(event) =>
                      setNeedMealSlot(event.target.value as typeof needMealSlot)
                    }
                  >
                    <option value="tonight">Tonight</option>
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <Label>Urgency</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={needUrgency}
                    onChange={(event) =>
                      setNeedUrgency(event.target.value as typeof needUrgency)
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <Label>Matching radius (km)</Label>
                  <Input value={effectiveAcceptanceRangeKm} readOnly />
                </div>

                <div>
                  <Label>Window start</Label>
                  <Input
                    type="datetime-local"
                    value={needWindowStart}
                    onChange={(event) => setNeedWindowStart(event.target.value)}
                  />
                </div>

                <div>
                  <Label>Window end</Label>
                  <Input
                    type="datetime-local"
                    value={needWindowEnd}
                    onChange={(event) => setNeedWindowEnd(event.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <Label>Notes for suppliers</Label>
                  <Textarea
                    value={needNote}
                    onChange={(event) => setNeedNote(event.target.value)}
                    placeholder="Mention packaging, pickup constraints, or special requirements."
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => void submitReceiverNeed()}
                  disabled={isPostingNeed}
                >
                  {isPostingNeed
                    ? "Posting need..."
                    : "Post need and notify suppliers"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadReceiverNeeds()}
                >
                  Refresh need history
                </Button>
              </div>

              {needPostMessage ? (
                <p className="mt-2 rounded-md bg-white px-3 py-2 text-sm text-blue-900">
                  {needPostMessage}
                </p>
              ) : null}

              <div className="mt-3 space-y-2">
                {receiverNeeds.length ? (
                  receiverNeeds.slice(0, 6).map((need) => (
                    <article
                      key={need.id}
                      className="rounded-lg border border-blue-200 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {need.need_title}
                        </p>
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 capitalize">
                          {need.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {need.required_meals} meals | {need.food_preference} |{" "}
                        {need.meal_slot} | urgency {need.urgency_level}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Window:{" "}
                        {new Date(need.window_start_at).toLocaleString()} to{" "}
                        {new Date(need.window_end_at).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {need.location_address ??
                          "Location from receiver profile"}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-blue-900">
                    No advance needs posted yet.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  Ranked available donations
                </h3>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Need + feasibility ranking
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Feed prioritizes quantity fit, compatibility,
                spoilage/freshness, urgency window, and route travel time.
              </p>
              <div className="mt-3 space-y-3">
                {ngoMarketplaceDonations.length ? (
                  ngoMarketplaceDonations.map((item) => {
                    const ranked = rankedFeedByListingId.get(item.id);
                    const distanceToRecipient = ranked
                      ? ranked.routeDistanceKm
                      : Number(
                          haversineKm(
                            recipients[0].location,
                            item.pickupLocation,
                          ).toFixed(2),
                        );
                    const etaMinutes = ranked
                      ? ranked.routeDurationMinutes
                      : Math.max(8, Math.round(distanceToRecipient * 6));
                    const totalFoodScore =
                      ranked?.rankScore ??
                      deterministicFoodScore(
                        item,
                        distanceToRecipient,
                        crisisModeEnabled,
                      );

                    return (
                      <div
                        key={item.id}
                        className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                          <MatchCard
                            donorName={item.donor.name}
                            recipientName={recipients[0].name}
                            distanceKm={distanceToRecipient}
                            etaMinutes={etaMinutes}
                            compatibility={
                              ranked
                                ? `Rank ${ranked.rank} | ${ranked.isFeasible ? "Feasible" : "Tight window"}`
                                : "Deterministic score from urgency, safety, distance, and reliability"
                            }
                          />
                          <ScoreRing
                            score={totalFoodScore}
                            label="Total score /100"
                            tone={
                              totalFoodScore >= 75
                                ? "success"
                                : totalFoodScore >= 45
                                  ? "warning"
                                  : "critical"
                            }
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                          <span>
                            {item.title} | {item.quantity}
                          </span>
                          <span>{item.pickupLocation.address}</span>
                        </div>
                        {ranked ? (
                          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                              Qty fit {ranked.reasons.quantityScore}%
                            </span>
                            <span className="rounded-full bg-cyan-100 px-2 py-1 text-cyan-700">
                              Suitability {ranked.reasons.suitabilityScore}%
                            </span>
                            <span className="rounded-full bg-orange-100 px-2 py-1 text-orange-700">
                              Spoilage {Math.round(ranked.spoilageScore)}/100
                            </span>
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
                              Window {ranked.timeRemainingMinutes}m left
                            </span>
                            <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-700">
                              Travel {ranked.routeDurationMinutes}m
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                              Urgency weighted
                            </span>
                            <span className="rounded-full bg-cyan-100 px-2 py-1 text-cyan-700">
                              Safety weighted
                            </span>
                            <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-700">
                              Distance weighted
                            </span>
                            <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">
                              Donor reliability weighted
                            </span>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={
                              ngoFavorites.includes(item.id)
                                ? "default"
                                : "outline"
                            }
                            onClick={() => toggleNgoFavoriteDonation(item.id)}
                          >
                            {ngoFavorites.includes(item.id)
                              ? "Favorited"
                              : "Favorite donor"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => reserveNgoDonation(item.id)}
                            disabled={(ngoStock[item.id] ?? 0) <= 0}
                          >
                            Add to request cart ({ngoCart[item.id] ?? 0})
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => releaseNgoDonation(item.id)}
                            disabled={(ngoCart[item.id] ?? 0) <= 0}
                          >
                            Remove one
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    title="No donations within current radius"
                    message="Increase acceptance radius or enable crisis mode to expand searchable area."
                  />
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">
                NGO request cart
              </h3>
              <div className="mt-3 space-y-2">
                {ngoCartItems.length ? (
                  ngoCartItems.map(({ donation, quantity }) => (
                    <div
                      key={`ngo-cart-${donation.id}`}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {donation.title}
                        </p>
                        <p className="text-xs text-slate-600">
                          {donation.donor.name} |{" "}
                          {donation.pickupLocation.address}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        x{quantity}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No reserved items yet.
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={checkoutNgoRequests}
                  disabled={!ngoCartItems.length}
                >
                  Place NGO pickup requests
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setNgoCart({})}
                  disabled={!ngoCartItems.length}
                >
                  Clear cart
                </Button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">
                Requested order queue
              </h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-2">Order</th>
                      <th className="py-2">Donor</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Requested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ngoRequestedOrders.length ? (
                      ngoRequestedOrders.map((order) => (
                        <tr
                          key={`row-${order.id}`}
                          className="border-t border-slate-200"
                        >
                          <td className="py-2">
                            {order.title} x{order.quantity}
                          </td>
                          <td className="py-2">{order.donorName}</td>
                          <td className="py-2 capitalize">{order.status}</td>
                          <td className="py-2">
                            {new Date(order.requestedAt).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-2 text-slate-500" colSpan={4}>
                          No NGO requests placed yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">
                Previous delivery history
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Completed NGO deliveries, most recent first.
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {ngoDeliveryHistory.length ? (
                  ngoDeliveryHistory.map((item) => (
                    <li
                      key={`ngo-delivery-${item.id}`}
                      className="rounded-md border border-slate-200 bg-slate-50 p-2"
                    >
                      <p className="font-semibold text-slate-900">
                        {item.title} x{item.quantity}
                      </p>
                      <p>
                        {item.donorName} | {item.pickupLocation.address}
                      </p>
                      <p className="text-xs text-slate-500">
                        Delivered at{" "}
                        {new Date(item.requestedAt).toLocaleString()}
                      </p>
                    </li>
                  ))
                ) : (
                  <li className="rounded-md bg-slate-50 p-2 text-slate-500">
                    No completed deliveries yet.
                  </li>
                )}
              </ul>
            </section>
          </div>
          <div className="space-y-3">
            <CapacityPanel
              capacity={recipients[0].capacity}
              acceptsCooked={recipients[0].acceptsCooked}
              acceptsPackaged={recipients[0].acceptsPackaged}
              refrigeration={recipients[0].refrigerationAvailable}
              open={recipients[0].open}
              nutritionPreferences={recipients[0].nutritionPreferences}
              crisisPriority
            />
            <MapPanel
              donations={ngoMarketplaceDonations}
              recipients={recipients}
              volunteers={volunteers}
              route={routeModel}
              heightClassName="h-[280px]"
            />
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (role === "volunteer") {
    return (
      <DashboardShell
        basePath="/dashboard/volunteer"
        title="Volunteer Dashboard"
        liveStatus={`Route live | Push ${pushReady ? "ready" : "offline"}`}
      >
        {/* ── Crisis info strip ───────────────────────────── */}
        <div className={`rounded-xl border px-4 py-3 text-sm ${crisisModeEnabled ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
          <span className="font-semibold">{crisisModeEnabled ? "🚨 Crisis Mode Active" : "✅ Normal Operations"}</span>
          {" — "}
          {crisisModeEnabled ? "Route strategy: fastest feasible rescue. Urgent stops prioritized." : "Route strategy: balanced efficiency. Standard dispatch."}
        </div>

        {/* ── Key stats row ───────────────────────────────── */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Open NGO orders" value={ngoOutstandingOrders.length} tone="warning" />
          <StatCard label="Assigned in route" value={ngoAssignedOrders.length} tone="neutral" />
          <StatCard label="Delivered today" value={ngoDeliveredOrders.length} tone="success" />
          <StatCard label="Route options" value={volunteerRouteOptions.length} tone="success" />
        </div>

        {/* ── Action bar — press to open popups ───────── */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* 1. Route Settings */}
          <Dialog>
            <DialogTrigger asChild>
              <button className="flex flex-col items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-center text-sm font-semibold text-amber-800 shadow-sm transition-all hover:bg-amber-100 hover:shadow-md">
                <Settings2 className="size-6 text-amber-600" />
                Route Settings
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>⚙️ Route Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <label className="block space-y-2 text-sm font-semibold text-slate-700">
                  <span>Number of pickup places: <span className="text-amber-600 font-bold">{selectedStopCount}</span></span>
                  <input
                    type="range"
                    min="1"
                    max={Math.max(1, ngoOutstandingOrders.length)}
                    step="1"
                    value={selectedStopCount}
                    onChange={(e) => setSelectedStopCount(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>1 stop</span>
                    <span>{Math.max(1, ngoOutstandingOrders.length)} stops</span>
                  </div>
                </label>
                {routeError && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{routeError}</p>}
                <div className="flex gap-2">
                  <Button className="flex-1" variant="outline" onClick={() => void refreshVolunteerRoute()} disabled={isRouting}>
                    {isRouting ? "Refreshing..." : "🔄 Refresh Live Route"}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      if (volunteerRouteOptions.length) {
                        setSelectedRouteOptionId(volunteerRouteOptions[0].id);
                        applyVolunteerRoute(volunteerRouteOptions[0]);
                      }
                    }}
                    disabled={!volunteerRouteOptions.length}
                  >
                    ⚡ Pick Best Route
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* 2. Suggested Routes */}
          <Dialog>
            <DialogTrigger asChild>
              <button className="relative flex flex-col items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-center text-sm font-semibold text-blue-800 shadow-sm transition-all hover:bg-blue-100 hover:shadow-md">
                <List className="size-6 text-blue-600" />
                Suggested Routes
                {volunteerRouteOptions.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                    {volunteerRouteOptions.length}
                  </span>
                )}
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>🗺️ Suggested Multi-Order Routes</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-slate-500">Routes ranked by quality score, distance, and ETA. Top route is already plotted on the map.</p>
              <div className="mt-3 space-y-3">
                {volunteerRouteOptions.length ? volunteerRouteOptions.map((option, index) => (
                  <div key={option.id} className={`rounded-xl border p-4 transition-all ${
                    selectedRouteOptionId === option.id
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-slate-900">Option {index + 1}: {option.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {option.totalDistanceKm} km · {option.etaMinutes} min · {option.orders.length} stops · Strategy: {option.strategy}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {index === 0 && <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700">Best</span>}
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">Q: {option.qualityScore}</span>
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">{option.etaMinutes}m</span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {option.orders.map((order) => (
                        <span key={`route-order-${option.id}-${order.id}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {order.title} x{order.quantity}
                        </span>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      className="mt-3"
                      variant={selectedRouteOptionId === option.id ? "default" : "outline"}
                      onClick={() => {
                        setSelectedRouteOptionId(option.id);
                        applyVolunteerRoute(option);
                        setSelectedTaskDonationId(option.orders[0]?.donationId ?? null);
                        setPickupConfirmed(false);
                        setDeliveryConfirmed(false);
                      }}
                    >
                      {selectedRouteOptionId === option.id ? "✓ Selected" : "Choose Route"}
                    </Button>
                  </div>
                )) : <p className="rounded-lg bg-slate-50 py-8 text-center text-sm text-slate-400">No outstanding NGO requests to route yet.</p>}
              </div>
            </DialogContent>
          </Dialog>

          {/* 3. NGO Request Board */}
          <Dialog>
            <DialogTrigger asChild>
              <button className="relative flex flex-col items-center gap-2 rounded-2xl border border-purple-200 bg-purple-50 px-4 py-4 text-center text-sm font-semibold text-purple-800 shadow-sm transition-all hover:bg-purple-100 hover:shadow-md">
                <ClipboardList className="size-6 text-purple-600" />
                NGO Requests
                {ngoOutstandingOrders.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">
                    {ngoOutstandingOrders.length}
                  </span>
                )}
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>📋 Open NGO Request Board</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-slate-500">{ngoRequestedOrders.length} total requests, {ngoOutstandingOrders.length} pending.</p>
              <div className="mt-3 space-y-2">
                {ngoRequestedOrders.length ? ngoRequestedOrders.map((item) => (
                  <div key={`ngo-req-${item.id}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.pickupLocation.address}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        item.status === "delivered" ? "bg-emerald-100 text-emerald-700" :
                        item.status === "assigned" ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>{item.status}</span>
                      <span className="text-xs text-slate-400">x{item.quantity}</span>
                    </div>
                  </div>
                )) : <p className="rounded-lg bg-slate-50 py-8 text-center text-sm text-slate-400">No NGO requests yet.</p>}
              </div>
            </DialogContent>
          </Dialog>

          {/* 4. Order History */}
          <Dialog>
            <DialogTrigger asChild>
              <button className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md">
                <History className="size-6 text-slate-500" />
                History
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>🕒 Previous Delivery History</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-slate-500">Completed and assigned orders from recent runs.</p>
              <div className="mt-3 space-y-2">
                {volunteerOrderHistory.length ? volunteerOrderHistory.map((item) => (
                  <div key={`vol-hist-${item.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{item.title} <span className="font-normal text-slate-400">x{item.quantity}</span></p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.pickupLocation.address}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        item.status === "delivered" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                      }`}>{item.status}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{new Date(item.requestedAt).toLocaleString()}</p>
                  </div>
                )) : <p className="rounded-lg bg-slate-50 py-8 text-center text-sm text-slate-400">No history yet. Complete a delivery to see it here.</p>}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Main work area ──────────────────────────────── */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            {/* Current step guidance */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Current Step</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {!pickupConfirmed
                  ? "🏃 Go to donor — confirm pickup"
                  : !deliveryConfirmed
                    ? "🚚 Head to recipient — confirm delivery"
                    : "✅ Task completed! Great work."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={acceptSelectedRoute}
                  disabled={!selectedRouteOption}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Navigation className="size-4" /> Accept Route
                </Button>
                <Button
                  onClick={handleConfirmPickup}
                  disabled={pickupConfirmed}
                  variant="outline"
                  className="gap-2"
                >
                  <CheckCircle2 className="size-4" /> Confirm Pickup
                </Button>
                <Button
                  onClick={handleConfirmDelivery}
                  disabled={!pickupConfirmed || deliveryConfirmed}
                  variant="outline"
                  className="gap-2"
                >
                  <Truck className="size-4" /> Confirm Delivery
                </Button>
                <Button
                  variant="outline"
                  onClick={completeSelectedRoute}
                  disabled={!selectedRouteOption}
                  className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  ✓ Mark Delivered
                </Button>
              </div>
            </div>

            {/* Active task cards */}
            {(selectedRouteOption?.orders ?? ngoAssignedOrders.slice(0, 2)).map((order) => {
              const donation = donations.find((item) => item.id === order.donationId);
              return (
                <VolunteerTaskCard
                  key={order.id}
                  donor={order.donorName}
                  recipient={recipients[0].name}
                  pickup={order.pickupLocation.address}
                  drop={recipients[0].location.address}
                  distance={donation ? Number((haversineKm(volunteers[0].location, donation.pickupLocation) + haversineKm(donation.pickupLocation, recipients[0].location)).toFixed(1)) : 0}
                  eta={selectedRouteOption ? Math.max(8, Math.round(selectedRouteOption.etaMinutes / Math.max(1, selectedRouteOption.orders.length))) : 18}
                  urgency={donation?.urgency ?? "normal"}
                  quantity={donation?.quantity ?? `${order.quantity} portions`}
                />
              );
            })}
          </div>

          {/* Map + route summary */}
          <div className="space-y-4">
            <MapPanel
              donations={donations}
              recipients={recipients}
              volunteers={volunteers}
              route={routeModel}
              crisisZones={crisisZones}
              volunteerMode
              heightClassName="h-[380px]"
            />
            <RouteSummaryCard route={routeModel} />
          </div>
        </div>

        {/* Mobile bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm md:hidden">
          <div className="flex gap-2">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={acceptSelectedRoute} disabled={!selectedRouteOption}>
              <Navigation className="size-4 mr-1" /> Accept Route
            </Button>
            <Button className="flex-1" variant="outline" onClick={handleConfirmDelivery} disabled={!pickupConfirmed}>
              <Truck className="size-4 mr-1" /> Deliver
            </Button>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (role === "analytics") {
    const urgentCount = donations.filter(
      (d) => d.urgency === "critical" || d.urgency === "high",
    ).length;
    const crisisCount = crisisZones.filter((zone) => zone.active).length;

    return (
      <DashboardShell
        basePath="/dashboard/analytics"
        title="Analytics Dashboard"
        liveStatus="Signals and KPIs live"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4">
            <h2 className="text-lg font-semibold text-rose-900">
              Special Crisis Mode
            </h2>
            <p className="mt-1 text-sm text-rose-700">
              Nearby disasters are monitored continuously. Priority weighting
              and NGO acceptance range expansion are active when crisis mode is
              enabled.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {crisisZones
                .filter((zone) => zone.active)
                .map((zone) => (
                  <article
                    key={zone.id}
                    className="rounded-lg border border-rose-200 bg-white p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">
                        {zone.zone}
                      </p>
                      <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                        {zone.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{zone.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Impact radius {zone.radiusKm} km | Recipients impacted{" "}
                      {zone.impactedRecipients}
                    </p>
                  </article>
                ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Meals rescued"
              value={mealsRescued}
              tone="success"
            />
            <StatCard
              label="Active donations"
              value={activeDonations.length}
              tone="neutral"
            />
            <StatCard
              label="Urgent pipeline"
              value={urgentCount}
              tone="warning"
            />
            <StatCard
              label="Crisis zones"
              value={crisisCount}
              tone="critical"
            />
            <StatCard
              label="Expanded NGO range"
              value={`${effectiveAcceptanceRangeKm} km`}
              tone="warning"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnalyticsChartCard
              title="Meals trend"
              type="line"
              data={impactSeries.map((row) => ({
                day: row.day,
                value: row.meals,
              }))}
            />
            <AnalyticsChartCard
              title="Food volume trend (kg)"
              type="bar"
              data={impactSeries.map((row) => ({
                day: row.day,
                value: row.kg,
              }))}
            />
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">
                Priority tuning summary
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li className="rounded-md bg-slate-50 p-2">
                  Current priority weight: {priorityWeight.toFixed(1)}x
                </li>
                <li className="rounded-md bg-slate-50 p-2">
                  Base acceptance range: {baseAcceptanceRangeKm} km
                </li>
                <li className="rounded-md bg-slate-50 p-2">
                  Crisis multiplier: {nearbyCrisis?.radiusMultiplier ?? 1}x
                </li>
                <li className="rounded-md bg-slate-50 p-2">
                  Effective acceptance range: {effectiveAcceptanceRangeKm} km
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">
                Suggested operational improvements
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li className="rounded-md bg-slate-50 p-2">
                  Auto-escalate critical donations older than 8 minutes.
                </li>
                <li className="rounded-md bg-slate-50 p-2">
                  Boost matching score for volunteers within 3 km of pickup.
                </li>
                <li className="rounded-md bg-slate-50 p-2">
                  Reserve one fallback NGO for each critical zone.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      basePath="/dashboard/admin"
      title="Admin / Operations Dashboard"
      liveStatus="System live"
    >
      <InstructionCallout
        title="Admin Workflow"
        description="Use this control view to prioritize urgent donations, monitor team capacity, and intervene when needed."
        tone="secondary"
        points={[
          "Monitor crisis and urgent-case cards first.",
          "Use admin action buttons to reassign and escalate.",
          "Track feed/map to validate that interventions are working.",
        ]}
      />

      <CrisisBanner
        active
        message="Emergency prioritization is active for 2 zones. Matching strategy adjusted."
      />
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Total donations today"
          value={donations.length}
          tone="success"
        />
        <StatCard label="Meals rescued" value={mealsRescued} tone="success" />
        <StatCard label="Active volunteers" value={64} tone="neutral" />
        <StatCard
          label="Pending urgent"
          value={
            donations.filter(
              (d) => d.urgency === "critical" || d.urgency === "high",
            ).length
          }
          tone="warning"
        />
        <StatCard
          label="Crisis zones"
          value={crisisZones.filter((zone) => zone.active).length}
          tone="critical"
        />
        <StatCard label="Avg matching time" value="6.8m" tone="neutral" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.6fr_1fr]">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="font-semibold text-slate-900">Operational feed</h3>
          {notifications.map((item) => (
            <NotificationItem key={item.id} item={item} />
          ))}
        </div>

        <MapPanel
          donations={donations}
          recipients={recipients}
          volunteers={volunteers}
          route={routeModel}
          crisisZones={crisisZones}
          heightClassName="h-[620px]"
        />

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="font-semibold text-slate-900">
              Volunteer availability
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-600">
              {volunteers.map((item) => (
                <li key={item.id} className="rounded-md bg-slate-50 p-2">
                  {item.name} | {item.vehicleType} | {item.availabilityStatus}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="font-semibold text-slate-900">
              Recipient capacity summary
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-600">
              {recipients.map((item) => (
                <li key={item.id} className="rounded-md bg-slate-50 p-2">
                  {item.name} | Capacity {item.capacity} |{" "}
                  {item.open ? "Open" : "Closed"}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="font-semibold text-slate-900">Urgent cases</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-600">
              {donations
                .filter((x) => x.urgency === "critical" || x.urgency === "high")
                .map((item) => (
                  <li key={item.id} className="rounded-md bg-amber-50 p-2">
                    {item.title} | {item.urgency}
                  </li>
                ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="font-semibold text-slate-900">Admin actions</h3>
            <div className="mt-2 flex flex-col gap-2">
              <Button>Verify users</Button>
              <Button variant="outline">Flag unsafe donation</Button>
              <Button variant="outline">Activate crisis mode</Button>
              <Button variant="outline">Reassign volunteer</Button>
              <Button variant="outline">Adjust match priority</Button>
              <Button variant="outline">View audit trail</Button>
            </div>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <h3 className="font-semibold text-rose-800">
              Safety and fraud flags
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-rose-700">
              <li className="rounded-md bg-white/70 p-2">
                Repeated postings from single donor in 2 hours.
              </li>
              <li className="rounded-md bg-white/70 p-2">
                Donation d-101 nearing expiry, escalation required.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
