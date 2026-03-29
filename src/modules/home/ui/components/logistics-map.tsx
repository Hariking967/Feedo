"use client";

import { useMemo } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  Tooltip,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  DonorListing,
  RecipientNode,
  RouteLeg,
  VolunteerNode,
} from "../../types/logistics";

const donorIcon = L.divIcon({
  html: '<div class="marker-badge marker-donor">🏠</div>',
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const recipientIcon = L.divIcon({
  html: '<div class="marker-badge marker-recipient">❤</div>',
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const volunteerIcon = L.divIcon({
  html: '<div class="marker-badge marker-volunteer">➤</div>',
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface Props {
  listing: DonorListing;
  recipients: RecipientNode[];
  volunteers: VolunteerNode[];
  selectedRecipientId?: string;
  selectedVolunteerId?: string;
  pickupRoute: RouteLeg | null;
  deliveryRoute: RouteLeg | null;
  multiStopRoutes?: RouteLeg[];
}

export default function LogisticsMap({
  listing,
  recipients,
  volunteers,
  selectedRecipientId,
  selectedVolunteerId,
  pickupRoute,
  deliveryRoute,
  multiStopRoutes,
}: Props) {
  const center = useMemo(() => [listing.location.lat, listing.location.lng] as [number, number], [listing.location.lat, listing.location.lng]);

  return (
    <MapContainer center={center} zoom={13} className="h-[480px] w-full rounded-xl border">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Marker position={[listing.location.lat, listing.location.lng]} icon={donorIcon}>
        <Popup>{listing.location.label}</Popup>
        <Tooltip permanent>Donor</Tooltip>
      </Marker>

      {recipients.map((recipient) => (
        <Marker
          key={recipient.id}
          position={[recipient.location.lat, recipient.location.lng]}
          icon={recipientIcon}
          opacity={selectedRecipientId && selectedRecipientId !== recipient.id ? 0.45 : 1}
        >
          <Popup>{recipient.name}</Popup>
          <Tooltip>Recipient</Tooltip>
        </Marker>
      ))}

      {volunteers.map((volunteer) => (
        <Marker
          key={volunteer.id}
          position={[volunteer.location.lat, volunteer.location.lng]}
          icon={volunteerIcon}
          opacity={selectedVolunteerId && selectedVolunteerId !== volunteer.id ? 0.45 : 1}
        >
          <Popup>{volunteer.name}</Popup>
          <Tooltip>Volunteer</Tooltip>
        </Marker>
      ))}

      {pickupRoute?.points?.length ? <Polyline pathOptions={{ color: "#1d4ed8", weight: 5 }} positions={pickupRoute.points} /> : null}
      {deliveryRoute?.points?.length ? <Polyline pathOptions={{ color: "#059669", weight: 5 }} positions={deliveryRoute.points} /> : null}
      {multiStopRoutes?.map((route, index) => (
        <Polyline
          key={`multi-${index}`}
          pathOptions={{ color: "#f97316", weight: 4, dashArray: "6 6" }}
          positions={route.points}
        />
      ))}
    </MapContainer>
  );
}
