# Plan: Fleet partners

**Status:** planned · next up  
**Goal:** Companies that own bikes and riders can bring them onto the Estene network. We dispatch trips to their riders; the fleet sees its own operation (riders, trips, earnings, heatmaps, live location) in a portal of its own.

---

## 1. Why a new `Fleet` model (not business clients)

|                    | Business client (exists)              | Fleet partner (new)                          |
| ------------------ | ------------------------------------- | -------------------------------------------- |
| Side of the market | Demand: sends parcels                 | Supply: provides riders and bikes            |
| Money              | Pays **us** (on account, online)      | **We** pay them (earnings minus commission)  |
| Sees               | Its own shipments, API keys, webhooks | Its riders, their trips, earnings, locations |
| Logs in as         | API keys (+ future client portal)     | Fleet portal users                           |

Folding fleets into clients would mix money directions and permissions on one record. A company that is both is still possible: we add an optional `fleet.clientId` link later.

Today a partner rider has a free-text `fleetName`. This replaces it with a real `fleet` reference.

## 2. User stories

**Fleet owner/manager**

- See all my riders: who's online, what job they're on, today's and this week's trips.
- See every trip my riders did: status, route (areas), fare, our commission, my earnings.
- See earnings and payout statements: what Estene owes us, what was paid and when.
- See a **heatmap** of where my riders work (pickups/drop-offs) to decide where to station bikes.
- See a rider's **live location** when I need to, e.g. a delayed delivery or a safety concern.
- See completed-ride counts and basic performance (acceptance rate, on-time rate) per rider.
- Request onboarding of a new rider; Estene ops approves them.

**Estene ops / finance**

- Create and manage fleets, set their commission, attach and detach riders.
- See a fleet the same way the fleet sees itself (the same views, unscoped).
- See any rider's live location and recent trail when needed, with every view logged.
- Pay a fleet as one payout covering all its riders' earnings, or pay riders directly (configurable).

## 3. Domain model

```ts
Fleet {
  name, legalName?, rcNumber?, industry: 'logistics'
  contact: { name, role?, phone, email }
  address: { line, zoneId?, area?, city, state }
  status: 'pending' | 'active' | 'suspended'
  commissionPct            // default for its riders; rider-level override still allowed
  settlement: 'fleet' | 'rider'   // who we pay: the fleet's account, or each rider's account
  bankAccount?: { bankCode, bankName, accountNumber, accountName, verifiedAt }   // when settlement = 'fleet'
  accountManager?: AdminId
}

Rider {
  …existing
  fleet?: FleetId          // replaces fleetName; null = independent partner or company rider
}

FleetUser {               // portal logins, separate from Estene staff
  fleet: FleetId, name, email, phone, passwordHash
  role: 'owner' | 'manager' | 'viewer'
  isActive, lastLoginAt
}

RiderLocation {           // breadcrumb history, for "where were they" and heatmaps
  rider, fleet?, shipment?, at, point: GeoJSON Point, speedKph?
  // sampled every ~30s while online; TTL index: 30 days
}

LocationAccessLog {       // who looked at a live location, and why
  viewerType: 'admin' | 'fleet_user', viewerId, rider, reason?, at
}
```

**Ledger:** add an account `'fleet'` and a `fleet` field on entries.

- For fleet riders with `settlement = 'fleet'`, `rider_earning` is posted against the fleet.
- Payouts go to the fleet's bank account, and fleet balance = earnings − payouts − cash held by its riders.
- The existing `payouts` module gets a `fleet` target alongside `rider`.

**Auth:** new actor type `'fleet'` in the JWT (`sub` = FleetUser id, plus `fleetId`). Every `/api/fleet/*` query is scoped by `fleetId`, the same pattern as the integration API's `clientId` scoping.

## 4. What the fleet sees — and doesn't

To protect customer privacy, fleets see **areas, not addresses or phone numbers**:

- **Trip:** tracking number, status timeline, pickup area → drop-off area, service level, fare, commission, fleet earning, proof method (PIN/photo, not the photo itself).
- **Not shown:** sender/recipient names, phones, street addresses, delivery PINs.
- **Live location:** only their own riders, only while the rider is online, and every view is logged.

## 5. Surfaces

### Fleet portal: new app `apps/fleet` (Vite, shares `@estene/ui`, `lib`, `api-client`, `theme`)

| Page               | Contents                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Overview           | Riders online now, trips today / this week, completed rides, earnings this period, small live map          |
| Riders             | List: status, online, current job, trips (period), completed rides, acceptance and on-time rates, earnings |
| Rider detail       | Profile, trip history, earnings, **live location + last-hour trail**                                       |
| Trips              | All trips by their riders; filters: rider, status, date, zone                                              |
| Heatmap            | Pickup/drop-off density of their trips (toggle), by date range and time of day                             |
| Live map           | All their online riders on one map, refreshed in real time                                                 |
| Earnings & payouts | Statement by period: gross fares, commission, earnings, cash held, payouts received                        |
| Team               | Fleet users (owner manages managers and viewers)                                                           |
| Riders → Add       | Request a new rider (goes to Estene ops as `pending`)                                                      |

### Estene admin

- **Network → Fleets:** list, create, detail (the same tabs as the portal, unscoped), commission and settlement settings, attach riders.
- **Rider page:** fleet link, live location with trail (logged).
- **Rider payouts:** group by fleet; pay a fleet in one transfer.
- **Live ops map** (later): every online rider, filterable by fleet.

## 6. API sketch

```
# Estene admin
GET/POST        /api/fleets
GET/PATCH       /api/fleets/:id
POST            /api/fleets/:id/riders            { riderId }   attach
DELETE          /api/fleets/:id/riders/:riderId                 detach
PUT             /api/fleets/:id/bank-account
GET             /api/fleets/:id/overview | /riders | /trips | /earnings | /heatmap
GET             /api/riders/:id/location          live point (logged)
GET             /api/riders/:id/trail?since=      breadcrumbs (logged)

# Fleet portal (actor = fleet, scoped by fleetId)
POST            /api/fleet/auth/login
GET             /api/fleet/overview
GET             /api/fleet/riders  ·  /riders/:id  ·  /riders/:id/location  ·  /riders/:id/trail
GET             /api/fleet/trips?riderId=&status=&from=&to=
GET             /api/fleet/heatmap?type=pickup|dropoff&from=&to=
GET             /api/fleet/earnings?from=&to=  ·  /payouts
GET (SSE)       /api/fleet/live                   stream of their riders' positions
GET/POST        /api/fleet/users                  (owner only)
POST            /api/fleet/rider-requests         onboarding request → ops approval
```

## 7. Real-time location

- **Today:** the rider app heartbeat writes to a Redis GEO set with a 90 s TTL (`PresenceService`).
- **Add:**
  1. **History:** sample one heartbeat in ~30 s into `RiderLocation`, plus every status change with its point. Kept 30 days, deleted automatically by a TTL index.
  2. **Live stream:** Server-Sent Events from the API. On each heartbeat, publish to a Redis pub/sub channel `loc:fleet:<id>`; the SSE handler relays to subscribed viewers. This works across API instances and needs no WebSocket infrastructure.
  3. **Access control:** fleets see only their riders, admins see all. Nobody sees a rider who is offline. Every view writes `LocationAccessLog`.

## 8. Heatmap

- **Source:** shipment pickup/drop-off points, using the stop's `location` when present and the area centroid otherwise.
- **Prerequisite:** capture lat/lng at booking (web map pin / geocoding) and at pickup and delivery (rider app GPS), so heatmaps get sharper over time.
- **Server:** aggregate into grid cells (geohash precision 6, about 1.2 km) per date range and hour bucket, and return `[{ lat, lng, weight }]`.
- **Client:** a heatmap layer on a vector map (see the map provider decision below).

## 9. Phases

1. **Foundation:**
   - `Fleet` model; admin Fleets CRUD; attach riders (migrate `fleetName` → `fleet`)
   - fleet commission and settlement
   - ledger `fleet` account; fleet payouts
2. **Fleet portal (MVP):**
   - `FleetUser` + auth
   - overview, riders, trips and earnings/payouts pages, all scoped
3. **Live location:**
   - breadcrumb history, SSE live stream
   - rider live view in admin and portal
   - access log
4. **Heatmaps & performance:**
   - geocoded stops
   - heatmap endpoint and page
   - acceptance / on-time rates

## 10. Decisions needed before Phase 1

1. **Settlement:** do we pay the **fleet** (it pays its riders) or each **rider** directly? Default to the fleet, switchable per fleet?
2. **Commission:** one rate per fleet, with per-rider overrides? Should volume tiers be considered later?
3. **Rider onboarding:** can fleets add riders directly, or request them for ops approval? The plan assumes approval.
4. **Dispatch priority:** should fleet riders rank the same as independent partners, or can a fleet reserve zones?
5. **Map provider** for the live map and heatmap: MapLibre + MapTiler/OSM (cheap, no lock-in), Mapbox, or Google Maps.
6. **Location retention:** 30 days proposed. Is longer needed for disputes?
7. Can a fleet also be a **business client** (send parcels)? If so, link the records.
