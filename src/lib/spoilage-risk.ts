export type FoodCategory = "veg" | "non_veg" | "dairy" | "bakery" | "rice" | "seafood";
export type PackagingCondition = "sealed" | "good" | "average" | "damaged";
export type StorageCondition = "refrigerated" | "insulated" | "room_temp" | "outdoor";
export type SpoilageLabel = "Fresh" | "Use Soon" | "Urgent Pickup";

export interface WeatherSnapshot {
  temperatureC: number;
  humidityPct: number;
  source: "openweather" | "fallback";
}

export interface TravelEstimate {
  durationMinutes: number;
  distanceKm: number;
  source: "openrouteservice" | "osrm" | "fallback";
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface SpoilageRiskInput {
  foodCategory: FoodCategory;
  cookedAt: Date;
  packagingCondition: PackagingCondition;
  storageCondition: StorageCondition;
  weather: WeatherSnapshot;
  travel: TravelEstimate;
  now?: Date;
}

export interface SpoilageRiskResult {
  score: number;
  label: SpoilageLabel;
  recommendedPickupWindowMinutes: number;
  reasons: string[];
}

const FOOD_BASE_RISK: Record<FoodCategory, number> = {
  veg: 18,
  non_veg: 34,
  dairy: 38,
  bakery: 12,
  rice: 28,
  seafood: 44,
};

const FOOD_SAFE_HOURS: Record<FoodCategory, number> = {
  veg: 8,
  non_veg: 4,
  dairy: 3,
  bakery: 10,
  rice: 5,
  seafood: 2,
};

const STORAGE_ADJ: Record<StorageCondition, number> = {
  refrigerated: -18,
  insulated: -8,
  room_temp: 0,
  outdoor: 12,
};

const PACKAGING_ADJ: Record<PackagingCondition, number> = {
  sealed: -8,
  good: -4,
  average: 0,
  damaged: 10,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceBetweenKm(start: Coordinate, end: Coordinate) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(end.lat - start.lat);
  const lngDelta = toRadians(end.lng - start.lng);
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);

  const haversineTerm =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversineTerm), Math.sqrt(1 - haversineTerm));
}

export async function getWeatherSnapshot(lat: number, lng: number): Promise<WeatherSnapshot> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    return {
      temperatureC: 30,
      humidityPct: 65,
      source: "fallback",
    };
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${key}&units=metric`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error("OpenWeather unavailable");
    }

    const json = (await response.json()) as {
      main?: {
        temp?: number;
        humidity?: number;
      };
    };

    const temperatureC = Number(json.main?.temp ?? 30);
    const humidityPct = Number(json.main?.humidity ?? 65);

    return {
      temperatureC: Number.isFinite(temperatureC) ? temperatureC : 30,
      humidityPct: Number.isFinite(humidityPct) ? humidityPct : 65,
      source: "openweather",
    };
  } catch {
    return {
      temperatureC: 30,
      humidityPct: 65,
      source: "fallback",
    };
  }
}

export async function estimateTravelTime(start: Coordinate, end: Coordinate): Promise<TravelEstimate> {
  const orsKey = process.env.OPENROUTESERVICE_API_KEY;

  try {
    if (orsKey) {
      const orsResponse = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
        method: "POST",
        headers: {
          Authorization: orsKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [start.lng, start.lat],
            [end.lng, end.lat],
          ],
        }),
      });

      if (orsResponse.ok) {
        const data = (await orsResponse.json()) as {
          features?: Array<{
            properties?: {
              summary?: {
                distance?: number;
                duration?: number;
              };
            };
          }>;
        };

        const summary = data.features?.[0]?.properties?.summary;
        if (summary?.distance && summary.duration) {
          return {
            distanceKm: Number((summary.distance / 1000).toFixed(1)),
            durationMinutes: Math.max(1, Math.round(summary.duration / 60)),
            source: "openrouteservice",
          };
        }
      }
    }

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=false`;
    const osrmResponse = await fetch(osrmUrl, { cache: "no-store" });

    if (osrmResponse.ok) {
      const json = (await osrmResponse.json()) as {
        routes?: Array<{
          distance?: number;
          duration?: number;
        }>;
      };

      const best = json.routes?.[0];
      if (best?.distance && best.duration) {
        return {
          distanceKm: Number((best.distance / 1000).toFixed(1)),
          durationMinutes: Math.max(1, Math.round(best.duration / 60)),
          source: "osrm",
        };
      }
    }
  } catch {
    // fall through
  }

  const fallbackDistanceKm = distanceBetweenKm(start, end);
  const fallbackDurationMinutes = Math.max(1, Math.round((fallbackDistanceKm / 24) * 60));

  return {
    distanceKm: Number(fallbackDistanceKm.toFixed(1)),
    durationMinutes: fallbackDurationMinutes,
    source: "fallback",
  };
}

export function calculateSpoilageRisk(input: SpoilageRiskInput): SpoilageRiskResult {
  const now = input.now ?? new Date();
  const hoursSinceCooked = Math.max(0, (now.getTime() - input.cookedAt.getTime()) / (1000 * 60 * 60));

  const tempRisk = input.weather.temperatureC > 8 ? Math.min(24, (input.weather.temperatureC - 8) * 1.2) : -4;
  const humidityRisk = input.weather.humidityPct > 65 ? Math.min(10, (input.weather.humidityPct - 65) * 0.25) : 0;
  const cookedTimeRisk = Math.min(34, hoursSinceCooked * 5);
  const transitRisk = Math.min(20, input.travel.durationMinutes / 5 + input.travel.distanceKm / 3);

  const rawScore =
    FOOD_BASE_RISK[input.foodCategory] +
    cookedTimeRisk +
    tempRisk +
    humidityRisk +
    STORAGE_ADJ[input.storageCondition] +
    PACKAGING_ADJ[input.packagingCondition] +
    transitRisk;

  const score = Math.round(clamp(rawScore, 0, 100));

  let label: SpoilageLabel = "Fresh";
  if (score >= 70) {
    label = "Urgent Pickup";
  } else if (score >= 40) {
    label = "Use Soon";
  }

  const safeHoursBase = FOOD_SAFE_HOURS[input.foodCategory];
  const weatherPenaltyHours = Math.max(0, (input.weather.temperatureC - 24) * 0.12 + (input.weather.humidityPct - 70) * 0.03);
  const storageBenefitHours = input.storageCondition === "refrigerated" ? 1.5 : input.storageCondition === "insulated" ? 0.5 : 0;
  const packagingBenefitHours = input.packagingCondition === "sealed" ? 0.8 : input.packagingCondition === "good" ? 0.3 : 0;
  const transitHours = input.travel.durationMinutes / 60;

  const remainingWindowHours = clamp(
    safeHoursBase - hoursSinceCooked - transitHours - weatherPenaltyHours + storageBenefitHours + packagingBenefitHours,
    0.3,
    10,
  );

  const recommendedPickupWindowMinutes = Math.round(clamp(remainingWindowHours * 60, 20, 600));

  const reasons = [
    `Cooked ${hoursSinceCooked.toFixed(1)}h ago`,
    `${input.weather.temperatureC.toFixed(1)}C / ${Math.round(input.weather.humidityPct)}% humidity`,
    `${input.travel.durationMinutes} min route estimate`,
    `${input.storageCondition.replace("_", " ")} storage`,
    `${input.packagingCondition} packaging`,
  ];

  return {
    score,
    label,
    recommendedPickupWindowMinutes,
    reasons,
  };
}
