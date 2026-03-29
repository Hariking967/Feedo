# Feedo Platform

Feedo is a multi-role food rescue platform built with Next.js App Router. It provides donor, recipient, volunteer, and admin dashboards with live maps, crisis overlays, routing, notifications, and operational analytics.

## Stack

- Next.js + React + TypeScript
- Tailwind CSS + component primitives
- Leaflet / react-leaflet for map UI
- Supabase (optional) for realtime and token persistence
- OpenRouteService + OSRM fallback for routing
- Nominatim for geocoding and reverse geocoding
- NASA EONET + OpenWeather for crisis signal aggregation
- Open Food Facts for product barcode lookup
- Firebase Cloud Messaging for web push token registration

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure required environment variables for your local setup.

3. Start development server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Main API Capabilities

- `GET /api/geo/search` - address geocoding
- `GET /api/geo/reverse` - reverse geocoding
- `GET /api/routing/directions` - ORS or OSRM route
- `POST /api/routing/matrix` - ORS matrix
- `POST /api/routing/optimize` - ORS optimization
- `GET /api/crisis/signals` - EONET + weather synthesis
- `GET /api/food/barcode/[code]` - Open Food Facts lookup
- `POST /api/food/emergency` - create high-priority emergency donation flow
- `POST /api/food/bulk` - create bulk donation flow
- `GET /api/receiver/feed` - ranked receiver donation feed
- `POST /api/receiver/preferences` - receiver/NGO matching preferences
- `GET /api/receiver/needs` - receiver advance-need history/status
- `POST /api/receiver/needs` - create advance receiver need
- `GET /api/supplier/need-prompts` - targeted supplier prompts
- `GET /api/supplier/analytics` - supplier impact analytics
- `POST /api/supplier/proof` - delivery/proof workflow
- `POST /api/notifications/register-token` - stores FCM push token
- `GET /api/payment-profile` - reads current supplier payment profile
- `POST /api/payment-profile` - upserts authenticated supplier QR/payment profile

## Dashboard Routes

- `/dashboard/donor`
- `/dashboard/recipient`
- `/dashboard/volunteer`
- `/dashboard/admin`

## Notes

- The platform supports local development and production deployment with the same core routes.
- Map, routing, crisis, and analytics capabilities are available based on your configured integrations.
