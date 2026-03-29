"use client";

import { MapContainer, Marker, Polyline, TileLayer, Tooltip, Circle, Popup, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import type { CrisisZone, Donation, Recipient, RouteModel, Volunteer } from "@/lib/platform/types";
import "leaflet/dist/leaflet.css";

const donorIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [13, 41],
});

const recipientIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [13, 41],
});

const volunteerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [13, 41],
});

const crisisPinIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconAnchor: [13, 41],
});

interface MapPanelProps {
  donations: Donation[];
  recipients: Recipient[];
  volunteers: Volunteer[];
  route?: RouteModel;
  crisisZones?: CrisisZone[];
  heightClassName?: string;
  volunteerMode?: boolean;
}

function FitToData({
  donations,
  recipients,
  volunteers,
  crisisZones,
}: {
  donations: Donation[];
  recipients: Recipient[];
  volunteers: Volunteer[];
  crisisZones: CrisisZone[];
}) {
  const map = useMap();

  const points = useMemo(
    () => [
      ...donations.map((item) => [item.pickupLocation.lat, item.pickupLocation.lng] as [number, number]),
      ...recipients.map((item) => [item.location.lat, item.location.lng] as [number, number]),
      ...volunteers.map((item) => [item.location.lat, item.location.lng] as [number, number]),
      ...crisisZones.filter((zone) => zone.active).map((zone) => [zone.lat, zone.lng] as [number, number]),
    ],
    [crisisZones, donations, recipients, volunteers],
  );

  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points, { padding: [24, 24] });
    }
  }, [map, points]);

  return null;
}

export function MapPanel({
  donations,
  recipients,
  volunteers,
  route,
  crisisZones = [],
  heightClassName = "h-[420px]",
  volunteerMode = false,
}: MapPanelProps) {
  const center = donations[0]?.pickupLocation ?? recipients[0]?.location ?? { lat: 12.9716, lng: 77.5946 };

  return (
    <div className="space-y-2">
      <div className="grid gap-2 rounded-xl border border-[#ffd4a3] bg-[#fff6ee] p-3 text-xs text-[#5c2c00] md:grid-cols-4">
        <p><span className="font-semibold">Orange pin:</span> donor pickup</p>
        <p><span className="font-semibold">Green pin:</span> recipient drop-off</p>
        <p><span className="font-semibold">Blue pin:</span> volunteer current location</p>
        <p>
          <span className="font-semibold">{volunteerMode ? "Red route:" : "Blue route:"}</span>{" "}
          {volunteerMode ? "best rescue route" : "active delivery path"}
        </p>
      </div>
      {volunteerMode ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          Crisis overlays active: red pins mark active crisis zones and the red route highlights the best volunteer dispatch path.
        </div>
      ) : null}
      <div className="rounded-md border border-[#bdf2b3] bg-[#f1f9ef] px-3 py-2 text-xs text-[#1f4021]">
        Tip: click markers to view details like status, address, and capacity.
      </div>
      <div className={`overflow-hidden rounded-xl border border-slate-200 ${heightClassName}`}>
      <MapContainer center={[center.lat, center.lng]} zoom={12} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitToData donations={donations} recipients={recipients} volunteers={volunteers} crisisZones={crisisZones} />

        {donations.map((donation) => (
          <Marker key={donation.id} position={[donation.pickupLocation.lat, donation.pickupLocation.lng]} icon={donorIcon}>
            <Tooltip>{donation.title}</Tooltip>
            <Popup>
              <p className="font-semibold">{donation.title}</p>
              <p className="text-xs">Status: {donation.status}</p>
              <p className="text-xs">Pickup: {donation.pickupLocation.address}</p>
            </Popup>
          </Marker>
        ))}

        {recipients.map((recipient) => (
          <Marker key={recipient.id} position={[recipient.location.lat, recipient.location.lng]} icon={recipientIcon}>
            <Tooltip>{recipient.name}</Tooltip>
            <Popup>
              <p className="font-semibold">{recipient.name}</p>
              <p className="text-xs">Capacity: {recipient.capacity}</p>
              <p className="text-xs">{recipient.location.address}</p>
            </Popup>
          </Marker>
        ))}

        {volunteers.map((volunteer) => (
          <Marker key={volunteer.id} position={[volunteer.location.lat, volunteer.location.lng]} icon={volunteerIcon}>
            <Tooltip>{volunteer.name}</Tooltip>
            <Popup>
              <p className="font-semibold">{volunteer.name}</p>
              <p className="text-xs">Vehicle: {volunteer.vehicleType}</p>
              <p className="text-xs">Availability: {volunteer.availabilityStatus}</p>
            </Popup>
          </Marker>
        ))}

        {route?.geometry?.length ? (
          <Polyline
            positions={route.geometry.map((point) => [point.lat, point.lng] as [number, number])}
            pathOptions={{ color: volunteerMode ? "#dc2626" : "#2563eb", weight: volunteerMode ? 6 : 5, opacity: 0.95 }}
          />
        ) : null}

        {crisisZones.filter((zone) => zone.active).map((zone) => (
          <>
            {volunteerMode ? (
              <Marker key={`${zone.id}-pin`} position={[zone.lat, zone.lng]} icon={crisisPinIcon}>
                <Tooltip>{zone.zone}</Tooltip>
                <Popup>
                  <p className="font-semibold text-rose-700">{zone.zone}</p>
                  <p className="text-xs">Severity: {zone.severity}</p>
                  <p className="text-xs">{zone.reason}</p>
                </Popup>
              </Marker>
            ) : null}
            <Circle
              key={zone.id}
              center={[zone.lat, zone.lng]}
              radius={zone.radiusKm * 1000}
              pathOptions={{ color: zone.severity === "critical" ? "#ef4444" : "#f97316", fillOpacity: volunteerMode ? 0.18 : 0.12 }}
            />
          </>
        ))}
      </MapContainer>
      </div>
    </div>
  );
}
