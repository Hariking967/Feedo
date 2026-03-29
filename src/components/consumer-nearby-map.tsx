"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import "leaflet/dist/leaflet.css";

interface ListingMapItem {
  id: string;
  dish: string;
  sellerName: string;
  foodType: "veg" | "non_veg";
  distanceKm: number;
  unitPrice: number;
  unit: "meals" | "kg";
  deliveryAvailable: boolean;
  location: {
    lat: number;
    lng: number;
  };
}

interface ConsumerNearbyMapProps {
  listings: ListingMapItem[];
  cart: Record<string, number>;
  stock: Record<string, number>;
  onReserve: (listingId: string) => void;
  onRelease: (listingId: string) => void;
}

const userIcon = L.divIcon({
  html: '<div style="height:30px;width:30px;border-radius:999px;background:#2563eb;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:2px solid #dbeafe;box-shadow:0 8px 14px rgba(37,99,235,0.35)">YOU</div>',
  className: "",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const foodIcon = L.divIcon({
  html: '<div style="height:26px;width:26px;border-radius:999px;background:#16a34a;border:2px solid #dcfce7;box-shadow:0 8px 14px rgba(22,163,74,0.35)"></div>',
  className: "",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function FitBounds({
  points,
}: {
  points: Array<[number, number]>;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(points, { padding: [24, 24] });
  }, [map, points]);

  return null;
}

export default function ConsumerNearbyMap({
  listings,
  cart,
  stock,
  onReserve,
  onRelease,
}: ConsumerNearbyMapProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setUserLocation({ lat: 12.9716, lng: 77.5946 });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  const center = useMemo(() => {
    if (userLocation) return userLocation;
    if (listings[0]) return listings[0].location;
    return { lat: 12.9716, lng: 77.5946 };
  }, [listings, userLocation]);

  const boundsPoints = useMemo(() => {
    const points: Array<[number, number]> = listings.map((listing) => [listing.location.lat, listing.location.lng]);
    if (userLocation) points.push([userLocation.lat, userLocation.lng]);
    return points;
  }, [listings, userLocation]);

  return (
    <div className="h-[72vh] overflow-hidden rounded-xl border border-slate-200">
      <MapContainer center={[center.lat, center.lng]} zoom={13} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds points={boundsPoints} />

        {userLocation ? (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
            <Tooltip>You</Tooltip>
            <Popup>
              <p className="text-sm font-semibold">You are here</p>
            </Popup>
          </Marker>
        ) : null}

        {listings.map((listing) => {
          const inCart = cart[listing.id] ?? 0;
          const available = stock[listing.id] ?? 0;

          return (
            <Marker
              key={listing.id}
              position={[listing.location.lat, listing.location.lng]}
              icon={foodIcon}
              eventHandlers={{
                mouseover: (event) => {
                  event.target.openPopup();
                },
              }}
            >
              <Tooltip>{listing.dish}</Tooltip>
              <Popup>
                <div className="w-56 space-y-2">
                  <p className="text-sm font-bold text-slate-900">{listing.dish}</p>
                  <p className="text-xs text-slate-600">{listing.sellerName}</p>
                  <p className="text-xs text-slate-700">
                    {listing.foodType === "veg" ? "Veg" : "Non Veg"} • {listing.distanceKm} km
                  </p>
                  <p className="text-xs text-slate-700">
                    Rs. {listing.unitPrice}/{listing.unit} • Available: {available}
                  </p>

                  {inCart > 0 ? (
                    <div className="flex items-center justify-between rounded-md border border-slate-300 px-2 py-1">
                      <button
                        onClick={() => onRelease(listing.id)}
                        className="rounded p-1 hover:bg-slate-100"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="text-sm font-semibold">{inCart}</span>
                      <button
                        onClick={() => onReserve(listing.id)}
                        className="rounded p-1 hover:bg-slate-100"
                        aria-label="Increase quantity"
                        disabled={available <= 0}
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => onReserve(listing.id)}
                      disabled={available <= 0}
                    >
                      Add to cart
                    </Button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
