# Architecture

## System at a glance

```
 Public web (Next.js) ─┐
 Admin console (Vite) ─┼──HTTPS──▶  API (Fastify)  ──▶ MongoDB   shipments, riders, zones, ledger
 Rider app (Expo)  ────┘              │    ▲          Redis     rider presence (GEO), rate limits,
                                      │    │                    BullMQ queues
                                      ▼    │
                              in-process event bus ──▶ listeners: dispatch · notifications · finance
                                                                     │
                                                         workers ────┴──▶ Termii SMS (more channels later)
```

Every client talks to one API. Routes are split by audience:

| Prefix          | Caller                | Auth                                               |
| --------------- | --------------------- | -------------------------------------------------- |
| `/api/public/*` | Website               | None, rate limited per IP                          |
| `/api/rider/*`  | Rider app             | JWT, `actor: rider`                                |
| `/api/v1/*`     | Business integrations | API key (`Bearer est_live_…`), per-key rate limits |
| `/api/portal/*` | Client portal         | JWT, `actor: client` with a `clientId` claim       |
| everything else | Admin console         | JWT, `actor: admin` plus role guards               |

## What changed from the eduspace pattern

The shape is still eduspace: a pnpm/Turbo monorepo, zero-build TS packages, `features/` folders in
apps, Fastify modules (`*.routes.ts` / `*.service.ts` / `models/`), the `{ success, statusCode, data }`
envelope and `AppError`. These are the deliberate improvements:

1. **API in the same monorepo, sharing `@estene/contracts`.** Request schemas, enums, the shipment state
   machine and the pricing formula exist once. The admin form, the public booking form and the API all
   validate with the same Zod schema. The website's quote and the API's charge run the same `computeQuote`.
2. **Controllers folded into routes.** Handlers are one-liners (`parse` → service → `send`), so a separate
   controller file only added indirection. Business logic lives in services.
3. **Explicit shipment state machine.** `canTransition(from, to, actor)` guards every status change, and
   updates compare-and-set on the current status. Two riders can't both accept a job, and nobody can
   skip from `created` to `delivered`.
4. **Domain events plus queues.** Services emit facts (`shipment.status_changed`). Notifications, ledger
   posting and dispatch subscribe to them. Anything slow or retryable goes through BullMQ, so an SMS
   gateway outage never blocks a rider's scan.
5. **Money is integer kobo, kept in an append-only ledger** with idempotency keys. There are no floats
   and no edited rows. Replaying an event can't double-post.
6. **Security defaults:**
   - Helmet, a CORS allowlist, and Redis-backed rate limits that hold across instances.
   - 15-minute access tokens. Refresh tokens are rotating, hashed, and sit in an httpOnly cookie
     (in the body for mobile), with reuse detection.
   - Delivery PINs are AES-GCM encrypted at rest and never returned by the API.
   - Env is validated at boot.
7. **Live presence in Redis, not Mongo.** Location pings every ~15 s per rider would hammer Mongo. They
   go to a Redis GEO set plus a TTL key, and stale entries are pruned on read.

## Core flows

### Booking and pricing

Customers pick an **area**, and areas belong to a **zone**. The route fare is the zone's intra-zone fare
for same-zone trips, otherwise a zone↔zone `RouteRate`, otherwise the default route fare. On top of that:

- a size fee
- per-kg charges above the included weight
- a service-level multiplier
- optional fragile handling and goods protection

Totals round up to the configured naira step. The result is stored on the shipment as the **estimate**,
with the pricing version.

### Dispatch (`modules/dispatch`)

1. `shipment.created` → a `dispatch-shipment` job.
2. Candidates are riders who are **online** and **physically within** the pickup zone's radius plus 3 km
   (Redis `GEOSEARCH`). Riders below the job cap and not already declined stay in.
3. Rank: tier 0 is the pickup zone as the rider's primary zone, tier 1 is a coverage zone, tier 2 is just
   nearby. Within a tier, fewer active jobs wins, then the shorter distance. See `dispatch.ranking.ts`.
4. The top rider gets a 45-second offer. Accept assigns the job. Decline or timeout moves to the next rider.
5. If nobody is found, it retries every minute for ~15 minutes, then flags `dispatch.state = unassigned`
   for manual assignment. The dashboard highlights these shipments.

### Pickup and delivery (rider app endpoints)

- **Pickup:** the rider scans a pre-printed QR tag (it must exist and be `available`) and confirms size
  and weight. The price is recomputed. If it differs, a reason is required, `finalAmount` is set, and
  the sender is SMSed.
- **Delivery:** the rider rescans the tag (it must match), then proves delivery with the recipient's
  **PIN** (5 attempts, then photo only) or a **photo**. The PIN reaches the recipient by SMS at
  `out_for_delivery`.

### Shipment channels and business clients

Each shipment records its `source`:

| Source  | Who books it                    | Actor on the timeline |
| ------- | ------------------------------- | --------------------- |
| `web`   | Public site                     | `customer`            |
| `admin` | Phone booking keyed in by staff | `admin`               |
| `api`   | Business integration            | `client`              |

An shipment can belong to a business **client** (`clients` module). Admin can book on a
client's behalf, and API shipments always belong to the calling client. Clients can be billed
`on_account`: delivery posts an `shipment_charge` tagged with the client, and marking it paid
posts `payment_received`. The difference is the client's outstanding balance.

**API keys:**

- Format is `est_live_…`. Only the SHA-256 is stored.
- Lookups are cached in Redis for 60 s. Revoking a key or suspending the client evicts the
  cache, so access stops immediately.

**Integration API:**

- `/api/v1`, documented for integrators in [`integrations.md`](integrations.md).
- Every query is scoped to the calling client.
- Creates are idempotent on `(client, clientReference)` through a unique index.
- The response shape is `IntegrationShipmentDto`. Changing it is a breaking change.

### Warehousing (`modules/warehousing`)

Some business clients store stock with us (store-and-ship, see [`plans/warehousing.md`](plans/warehousing.md)).
An office flagged `isWarehouse` holds it. A client with `warehousing.enabled` has products, a
`StockLevel` per product and warehouse (`onHand`, `reserved`), and an append-only `StockMovement`
history, which works like the ledger and uses idempotency keys.

- **Orders** come from the API or the admin. Every line is reserved with a conditional `$inc`
  (`onHand − reserved ≥ qty`), so stock never oversells. A short order waits as `awaiting_stock`.
  `stock.available` (inbound received, restock, cancel, positive adjustment) retries waiting
  orders oldest-first.
- **Packing an order creates the shipment.** The shipment is a `dropoff` at the warehouse office,
  accepted at the counter with a tag, so it is `at_hub` straight away. A local door delivery goes
  into dispatch immediately. From there it is a normal shipment. `shipment.order` links back, and
  a listener moves the order to `delivered` or `returned`.
- **Returns** must be processed by staff: each unit goes back on the shelf (`restocked`) or is
  written off. A packed order still at the warehouse with no rider can be cancelled, which
  unpacks it: the shipment is cancelled and the stock restocked.
- **Billing:** a flat `warehousing.monthlyFee` is posted as `storage_fee` on the 1st (BullMQ job
  scheduler, Lagos time) for the month just ended. It is keyed `storage:<client>:<YYYY-MM>`.

- **Transfers** move a client's units between warehouses. Available units leave the
  origin at once (`transferred_out`) and travel as an inbound at the destination with
  `transferFrom` set; counting it there posts `transferred_in`. Cancelling it before
  arrival returns the units to the origin. A client's warehouse can only be switched once
  nothing is left on the old shelves or expected there; waiting backorders follow the switch.
- **Low stock:** every stock write re-checks `available ≤ lowStockThreshold`. The first dip
  sets `StockLevel.lowAlertedAt` (compare-and-set) and emits `stock.low` → an SMS to the
  client's contact and the `stock.low` webhook. Restocking above the threshold re-arms it.
- **Events:** `order.created`, `order.status_changed`, `inbound.received` and `stock.low`
  feed the `order.*` / `inbound.received` / `stock.low` webhooks.
- **Printing:** the admin's `/warehouse/orders/:id/print` renders the pick list (sorted by
  bin) and the packing slip.

### Client portal (`modules/portal`, `apps/portal`)

People at a business client sign in at the portal (port 5500) with a `ClientUser` account.
Staff create users from the client's page; the first password is temporary, shown once,
and must be changed at first sign-in. Tokens carry `actor: client` and `clientId`, and every
portal route reads the business from the token, never from the request. Each request also
re-checks that the user and the business are still active, so switching someone off takes
effect at once. The portal's refresh cookie (`estene_crt`, path `/api/auth/client`) is
separate from the staff cookie: browsers share cookies across ports on one host.

The portal shows deliveries (in the integration shape, with no PINs), the statement and,
for warehousing clients, stock, products, orders and inbounds.

### Payment gateways (`modules/payments/providers`)

One gateway handles money in (customer payments) and money out (rider payouts), chosen by
`PAYMENTS_PROVIDER`: `saukipay` (production), `sayswitch` or `simulator`. Each implements
`PaymentGateway` (`CollectionGateway` + `PayoutGateway`). Keeping both sides on one gateway
means one wallet, one set of bank codes and one webhook. The simulator is refused in production.

**Switching** is an env change plus a restart. Payments and payouts record their provider, so
ones still in flight on the old gateway are checked there, and its webhooks are still
accepted, for as long as that gateway's secret key stays set. A payout retried after a switch
is checked on the old gateway first and only re-sent if it failed there.

- **Trust nothing but `verify`.** Redirects and webhooks are hints. Each webhook
  (`/api/public/payments/webhooks/:provider`) is authenticated (SaukiPay sends the secret in
  an `ApiKey` header; SaySwitch signs with HMAC-SHA512 in `payloadSignature`). Then every
  reference in it is matched to one of our payments or payouts and re-checked with the
  gateway. Reconcile sweeps cover missed webhooks.
- **Bank transfer.** SaukiPay has no one-off account numbers: transfer is a channel inside
  its hosted checkout. When the collection gateway can't issue accounts, `startPayment` sends
  a pay link instead (bookings, and price top-ups by SMS).
- **Payouts** re-check an earlier attempt's status before re-sending, so a retry never pays
  twice. Transfers left `processing` are swept every 5 minutes. Bank codes come from the
  gateway (`GET /payouts/banks`), so rider bank accounts must be re-saved after switching
  gateways. SaukiPay payouts add a recipient, then pay it from the wallet; both requests carry
  an HMAC-SHA512 signature of the body.
- **Amount units:** SaukiPay reads naira. `SAUKIPAY_AMOUNT_UNIT` and `SAYSWITCH_AMOUNT_UNIT`
  (`naira` | `kobo`) stay in env because SaySwitch's docs are ambiguous.

### Webhooks (`modules/webhooks`)

Internal domain events (`shipment.created`, `shipment.status_changed`, `shipment.price_adjusted`)
are translated into the **public, one-event-per-milestone vocabulary** (`shipment.picked_up`,
`shipment.delivered`, …). The mapping lives in `@estene/contracts/webhook-events`, along with
the human titles. For subscribed clients, each event becomes a `WebhookDeliveryDto` row with a
`title`, a one-sentence `summary` (`webhooks.summary.ts`) and the exact JSON body. Each
attempt records the status code, duration and the first 1 KB of the response, which feeds the
Developer tab in the admin.

- `Estene-Signature: t=…,v1=HMAC-SHA256(secret, "t.body")`
- a 10 s timeout
- no redirect following
- 8 retries with exponential backoff

Each delivery has one queue job (`jobId = deliveryId`), so a resend from the admin console
replaces pending retries instead of racing them. A resend goes to the client's current URL.
The signing secret is AES-GCM encrypted, because we must read it back to sign.

In production, URLs must be https and must not resolve to private, loopback or
link-local addresses (SSRF). That is checked at send time, after DNS resolution.
Deliveries expire after 30 days because they contain customer contact details.

`shipment.created` fires exactly once per shipment. Putting an shipment back into dispatch emits
`dispatch.requested` instead, so clients and SMS never see a duplicate "created".

### Finance

On `delivered`, `shipment_charge` is posted. Then:

- **Company rider:** the full fare is `platform_revenue`.
- **Partner rider:** the commission (per rider, or the platform default) is `platform_revenue` and the
  remainder is `rider_earning`.

Cash methods post `cash_collected` against the rider. Ops record `cash_remitted` and partner `payout`s.
Rider balance = earnings − payouts − cash held.

## Scaling path

- The API is stateless, so it scales horizontally behind a load balancer. Rate limits and presence
  already live in Redis.
- Workers (`startWorker`) can move to a separate `worker` entrypoint without code changes.
- When riders need live updates in the admin, add a Socket.IO gateway (Redis adapter) that listens to the
  same event bus.
- MongoDB: run as a replica set in production (also enables multi-document transactions if needed).

## Roadmap

**Next:** fleet partners. Companies bring their own riders and bikes, with a fleet portal for trips, earnings, heatmaps and live location. See [`plans/fleet-partners.md`](plans/fleet-partners.md).

1. **Rider app** (`apps/rider`, Expo):
   - login, online toggle with background location heartbeat, offer card with countdown
   - QR scan for pickup and delivery, PIN entry, photo capture
2. **Uploads:** presigned R2/S3 URLs for delivery photos and rider KYC documents.
3. **Payments:** run a test payment and payout on SaukiPay. Then add fleet payouts.
4. **Customer accounts:** phone OTP sign-in, shipment history, saved addresses.
5. **Live ops map:** Socket.IO and map tiles in the admin, plus a rider live view.
6. **Notifications:** WhatsApp and email channels, and push for riders.
7. **Client portal, next:** self-serve API keys, webhook settings, the delivery log and
   invoices;
   a sandbox (`est_test_` keys against seeded data); IP-pinned webhook sends to close the
   DNS-rebinding gap.
8. **Audit log** for admin actions; printable QR tag sheets; ESLint config.
