"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Coordinates {
  lat: number;
  lng: number;
}

interface LocationPickerMapProps {
  value: Coordinates | null;
  onChange: (value: Coordinates) => void;
  className?: string;
  zoom?: number;
}

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [13, 41],
  popupAnchor: [0, -35],
});

const defaultCenter: Coordinates = { lat: 12.9716, lng: 77.5946 };

function ClickToPick({ onPick }: { onPick: (position: Coordinates) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

function RecenterMap({ center }: { center: Coordinates }) {
  const map = useMap();

  useEffect(() => {
    map.setView([center.lat, center.lng]);
  }, [center.lat, center.lng, map]);

  return null;
}

export default function LocationPickerMap({
  value,
  onChange,
  className,
  zoom = 13,
}: LocationPickerMapProps) {
  const [isLocating, setIsLocating] = useState(false);
  const center = useMemo(() => value ?? defaultCenter, [value]);

  const useCurrentLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">Click on the map to pin your location.</p>
        <button
          type="button"
          onClick={useCurrentLocation}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          disabled={isLocating}
        >
          {isLocating ? "Detecting..." : "Use current location"}
        </button>
      </div>

      <MapContainer center={[center.lat, center.lng]} zoom={zoom} className="h-72 w-full rounded-xl border">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterMap center={center} />
        <ClickToPick onPick={onChange} />

        {value ? (
          <Marker position={[value.lat, value.lng]} icon={markerIcon}>
            <Tooltip permanent>Your selected location</Tooltip>
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}
