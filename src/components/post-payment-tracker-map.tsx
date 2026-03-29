"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Coordinate {
  lat: number;
  lng: number;
}

interface PostPaymentTrackerMapProps {
  userLocation: Coordinate | null;
  destination: Coordinate;
  routePoints: Array<[number, number]>;
}

const userIcon = L.divIcon({
  html: '<div style="height:30px;width:30px;border-radius:999px;background:#1d4ed8;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:2px solid #dbeafe;box-shadow:0 8px 14px rgba(29,78,216,0.35)">YOU</div>',
  className: "",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const destinationIcon = L.divIcon({
  html: '<div style="height:30px;width:30px;border-radius:999px;background:#15803d;color:white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;border:2px solid #dcfce7;box-shadow:0 8px 14px rgba(21,128,61,0.35)">FOOD</div>',
  className: "",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function FitToRoute({ points }: { points: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(points, { padding: [30, 30] });
  }, [map, points]);

  return null;
}

export default function PostPaymentTrackerMap({
  userLocation,
  destination,
  routePoints,
}: PostPaymentTrackerMapProps) {
  const fallbackCenter = useMemo(() => {
    if (userLocation) return userLocation;
    return destination;
  }, [destination, userLocation]);

  const fitPoints = useMemo(() => {
    if (routePoints.length) return routePoints;

    const points: Array<[number, number]> = [[destination.lat, destination.lng]];
    if (userLocation) points.push([userLocation.lat, userLocation.lng]);
    return points;
  }, [destination.lat, destination.lng, routePoints, userLocation]);

  return (
    <div className="h-[58vh] overflow-hidden rounded-xl border border-slate-200">
      <MapContainer center={[fallbackCenter.lat, fallbackCenter.lng]} zoom={14} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitToRoute points={fitPoints} />

        {routePoints.length ? (
          <Polyline positions={routePoints} pathOptions={{ color: "#0f766e", weight: 5 }} />
        ) : null}

        {userLocation ? (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
            <Tooltip>You</Tooltip>
          </Marker>
        ) : null}

        <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
          <Tooltip>Food pickup point</Tooltip>
        </Marker>
      </MapContainer>
    </div>
  );
}
