# Architecture

## System at a glance

```
 Public web (Next.js) ─┐
 Admin console (Vite) ─┼──HTTPS──▶  API (Fastify)  ──▶ MongoDB   orders, riders, zones, ledger
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
| everything else | Admin console         | JWT, `actor: admin` plus role guards               |

## What changed from the eduspace pattern

The shape is still eduspace: a pnpm/Turbo monorepo, zero-build TS packages, `features/` folders in
apps, Fastify modules (`*.routes.ts` / `*.service.ts` / `models/`), the `{ success, statusCode, data }`
envelope and `AppError`. These are the deliberate improvements:

1. **API in the same monorepo, sharing `@estene/contracts`.** Request schemas, enums, the order state
   machine and the pricing formula exist once. The admin form, the public booking form and the API all
   validate with the same Zod schema. The website's quote and the API's charge run the same `computeQuote`.
2. **Controllers folded into routes.** Handlers are one-liners (`parse` → service → `send`), so a separate
   controller file only added indirection. Business logic lives in services.
3. **Explicit order state machine.** `canTransition(from, to, actor)` guards every status change, and
   updates compare-and-set on the current status. Two riders can't both accept a job, and nobody can
   skip from `created` to `delivered`.
4. **Domain events plus queues.** Services emit facts (`order.status_changed`). Notifications, ledger
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

Totals round up to the configured naira step. The result is stored on the order as the **estimate**,
with the pricing version.

### Dispatch (`modules/dispatch`)

1. `order.created` → a `dispatch-order` job.
2. Candidates are riders who are **online** and **physically within** the pickup zone's radius plus 3 km
   (Redis `GEOSEARCH`). Riders below the job cap and not already declined stay in.
3. Rank: tier 0 is the pickup zone as the rider's primary zone, tier 1 is a coverage zone, tier 2 is just
   nearby. Within a tier, fewer active jobs wins, then the shorter distance. See `dispatch.ranking.ts`.
4. The top rider gets a 45-second offer. Accept assigns the job. Decline or timeout moves to the next rider.
5. If nobody is found, it retries every minute for ~15 minutes, then flags `dispatch.state = unassigned`
   for manual assignment. The dashboard highlights these orders.

### Pickup and delivery (rider app endpoints)

- **Pickup:** the rider scans a pre-printed QR tag (it must exist and be `available`) and confirms size
  and weight. The price is recomputed. If it differs, a reason is required, `finalAmount` is set, and
  the sender is SMSed.
- **Delivery:** the rider rescans the tag (it must match), then proves delivery with the recipient's
  **PIN** (5 attempts, then photo only) or a **photo**. The PIN reaches the recipient by SMS at
  `out_for_delivery`.

### Order channels and business clients

Each order records its `source`:

| Source  | Who books it                    | Actor on the timeline |
| ------- | ------------------------------- | --------------------- |
| `web`   | Public site                     | `customer`            |
| `admin` | Phone booking keyed in by staff | `admin`               |
| `api`   | Business integration            | `client`              |

An order can belong to a business **client** (`clients` module). Admin can book on a
client's behalf, and API orders always belong to the calling client. Clients can be billed
`on_account`: delivery posts an `order_charge` tagged with the client, and marking it paid
posts `payment_received`. The difference is the client's outstanding balance.

**API keys:**

- Format is `est_live_…`. Only the SHA-256 is stored.
- Lookups are cached in Redis for 60 s. Revoking a key or suspending the client evicts the
  cache, so access stops immediately.

**Integration API:**

- `/api/v1`, documented for integrators in [`integrations.md`](integrations.md).
- Every query is scoped to the calling client.
- Creates are idempotent on `(client, externalReference)` through a unique index.
- The response shape is `IntegrationOrderDto`. Changing it is a breaking change.

### Webhooks (`modules/webhooks`)

Listeners on `order.created`, `order.status_changed` and `order.price_adjusted` enqueue a
`WebhookDelivery` row for subscribed clients. The row stores the exact JSON body. A
BullMQ worker sends it with:

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

`order.created` fires exactly once per order. Putting an order back into dispatch emits
`dispatch.requested` instead, so clients and SMS never see a duplicate "created".

### Finance

On `delivered`, `order_charge` is posted. Then:

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

1. **Rider app** (`apps/rider`, Expo):
   - login, online toggle with background location heartbeat, offer card with countdown
   - QR scan for pickup and delivery, PIN entry, photo capture
2. **Uploads:** presigned R2/S3 URLs for delivery photos and rider KYC documents.
3. **Payments:** Paystack card and transfer with a verified webhook → `payment_received`.
4. **Customer accounts:** phone OTP sign-in, order history, saved addresses.
5. **Live ops map:** Socket.IO and map tiles in the admin, plus a rider live view.
6. **Notifications:** WhatsApp and email channels, and push for riders.
7. **Client self-service portal:** keys, webhook settings, delivery log, invoices and statements;
   a sandbox (`est_test_` keys against seeded data); IP-pinned webhook sends to close the
   DNS-rebinding gap.
8. **Audit log** for admin actions; printable QR tag sheets; ESLint config.
