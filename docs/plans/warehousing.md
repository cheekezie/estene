# Plan: Warehousing (store-and-ship for business clients)

**Status:** Phases 1–2 built (2026-11-07): operations, the client portal, warehouse webhooks, low-stock alerts, printing and transfers. See §6.  
**Goal:** Some business clients keep their goods with us. We hold their stock in an Estene office, and they (or our staff) send us orders. We pick, pack and ship each order on the normal shipment network. Clients see their stock and their deliveries. It works like Amazon FBA, but we don't run a marketplace.

---

## 1. Decisions (settled 2026-10-19)

| Question                | Decision                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where stock lives       | **In offices.** An office flagged `isWarehouse` holds stock. Orders ship from it as the shipment's origin office.                                       |
| How clients are charged | **A flat monthly fee per client** (`warehousing.monthlyFee`), posted on account. Deliveries are still charged per shipment as today.                    |
| Cash on delivery        | **Not in v1.** Order shipments are `on_account` (or the recipient pays the _delivery fee_ in cash). Remitting the item value to the client comes later. |
| Tracking detail         | **SKU + quantity** per warehouse, with an optional bin label. Batch and expiry tracking come later.                                                     |
| Naming                  | `warehousing` module. "Fulfilment" is already the shipment's route field (`shipment.fulfilment`), so we avoid the word.                                 |

## 2. How it fits the shipment journey

An order is **not a new kind of journey**. Packing an order _creates a shipment_ from the warehouse office. From then on everything that already exists takes over: the route, the timeline, dispatch, manifests, PIN/photo proof, webhooks, SMS and the ledger.

```
order received ─▶ stock reserved ─▶ picking ─▶ packed ─────────────▶ shipment (originMode=dropoff, origin = warehouse office)
   │ not enough stock                         tag + size/weight      accepted at the counter → at_hub → dispatch / manifest
   ▼                                                                   │
awaiting_stock ─(inbound received)─▶ reserved                           ▼
                                                     order mirrors it: shipped → delivered | returned
```

- **Pack** = `ShipmentsService.create` (dropoff at the warehouse office, parcel from the pack form) followed by `ShipmentsService.acceptParcel` → `at_hub`. A local door delivery is put into dispatch straight away. An interstate one waits at the counter for a manifest, as usual.
- The shipment carries `order` (ref). A listener keeps the order's status in step: `delivered`/`collected` → `delivered`; `returned`/`cancelled` → `returned`, waiting for a restock decision.
- `IntegrationShipmentDto` gains `orderReference` (an additive change), so integrators can match existing shipment webhooks to their order.

## 3. Domain model

```ts
Office      { …existing, isWarehouse: boolean }

Client      { …existing,
              warehousing?: { enabled, office: OfficeId, monthlyFee /*kobo*/, enabledAt, lowStockThreshold? } }

Product     { client, sku /*unique per client*/, name, barcode?, size, weightKg, declaredValue /*kobo*/,
              fragile, imageUrl?, isActive }

StockLevel  { client, product, office, onHand, reserved, bin? }          // unique (product, office)
              available = onHand − reserved

StockMovement   // append-only, like the ledger; every change to onHand
            { client, product, office, type: received|shipped|adjusted|restocked|written_off,
              qty /*signed onHand delta*/, onHandAfter, inbound?, order?, note?, actor, idempotencyKey }

Inbound     // goods the client is sending in (ASN) and our count of them
            { client, office, number /*IN-…*/, reference?, status: expected|received|cancelled,
              lines: [{ product, expectedQty, receivedQty, damagedQty }], expectedAt?, receivedAt?, receivedBy? }

Order       { client, office, number /*ORD-…*/, reference? /*client's id, idempotent*/, source: admin|api|portal,
              status: awaiting_stock|ready_to_pick|picking|shipped|delivered|returned|cancelled,
              recipient (StopInput), deliveryMode, destinationOfficeId?, serviceLevel, paymentMethod,
              lines: [{ product, sku, name, qty }], shipment?, notes?, restockedAt?, events[] }
```

**Concurrency.** Reserving does a conditional `$inc` (`onHand − reserved ≥ qty`) per line, and rolls back the earlier lines if a later one fails. Shipping does `onHand −= qty, reserved −= qty` in one update. Order status changes compare-and-set on the current status, the same pattern as shipments.

**Ledger.** New type `storage_fee` (account `customer`, with `client`). It is posted on the 1st of each month for the month just ended, with key `storage:<clientId>:<YYYY-MM>`. `clientOutstanding` counts it.

## 4. Surfaces

**Admin (`Warehouse` nav section; roles ops_manager, office_agent, support):**

- **Stock:** pick a client to see per-product on-hand / reserved / available, the bin, and a low-stock flag. Adjust (with a reason) and see a product's movement history.
- **Products:** the client's catalogue (create/edit).
- **Inbound:** the expected list, and receiving (count each line, mark damaged).
- **Orders:** a queue by status. Create one for a client (staff on the phone). Order page: start picking (pick list with bins), pack (tag + size/weight → shipment), cancel, restock a returned order.
- **Client → Warehousing tab:** enable, set the warehouse office and the monthly fee, plus stock and order summaries.
- **Offices:** an "Is a warehouse" toggle.

**Integration API (`/api/v1`, scoped by client):**

```
GET/POST   /products           GET/PATCH /products/:sku
GET        /stock              ?sku=
GET/POST   /inbounds           GET /inbounds/:ref
GET/POST   /orders             GET /orders/:ref     POST /orders/:ref/cancel
```

**Client portal:** Phase 2. Login for client users (actor `client`, `clientId` claim) with stock, orders, deliveries, inbounds and statements.

## 5. Phases

1. **Foundation + operations (API + admin):** contracts, models, products, stock, movements, inbound receiving, orders with reserve/pick/pack→shipment, order↔shipment sync, the monthly fee job, `/api/v1` endpoints, `docs/integrations.md`, seed.
2. **Client portal:** `ClientUser` + auth, an `apps/portal` app (Vite, shared ui) with overview, stock, orders, deliveries, inbounds, invoices, and later the developer settings.
3. **Later:** order/stock webhook events (`order.*`, `stock.low`, `inbound.received`), low-stock SMS/email, cycle counts, batch/expiry (FEFO), COD remittance to clients, per-order pick & pack fees, bulk CSV import of products and orders.

## 6. Where we left off

**Phase 1 (done on 2026-10-19):**

- API module `modules/warehousing`, admin endpoints at `/api/warehousing/*`, and `/api/v1` products/stock/inbounds/orders.
- Order↔shipment sync, the monthly fee job, unit tests, and an E2E run against local Mongo/Redis covering reserve → backorder → inbound → pick → pack → unpack-cancel → return/restock → billing.
- The seed marks ABJ-WSE as a warehouse and adds the client **Naija Glow Skincare** with 4 products and opening stock.
- Admin: Warehouse → Orders / Stock / Inbound, Client → Warehousing tab, and an office "Warehouse" toggle.

**Done on 2026-11-07:**

- Client portal (`apps/portal`, `/api/portal`) with `ClientUser` logins. Staff manage the users from the client's page.
- Webhooks: `order.created`, `order.stock_reserved`, `order.shipped`, `order.delivered`, `order.returned`, `order.cancelled`, `inbound.received`, `stock.low`.
- Low-stock alerts: SMS to the client's contact, once per dip.
- A printable pick list and packing slip (`/warehouse/orders/:id/print`).
- Stock transfers between warehouses (Stock → Move stock), received as an inbound at the destination.

**Not yet (Phase 3):** cycle counts, batch/expiry, COD remittance, per-order pick & pack fees, bulk CSV import, and self-serve API keys and webhooks in the portal.
