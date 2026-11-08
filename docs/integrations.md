# Estene Integration API (v1)

Book deliveries from your own system and get notified as they move. This guide is
written for developers at partner businesses.

- **Base URL:** `https://api.estene.ng/api/v1` (local development: `http://localhost:4000/api/v1`)
- **Format:** JSON in, JSON out. UTF-8.
- **Money:** every amount is an **integer in kobo** (₦1 = 100 kobo). `250000` = ₦2,500.
- **Phone numbers:** send any Nigerian format (`0803…`, `234803…`, `+234803…`); we return E.164 (`+234803…`).
- **Times:** ISO 8601, UTC.

## Authentication

Estene operations issue your API key. Send it as a bearer token on every request:

```http
Authorization: Bearer est_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keep keys on your server, never in a browser or mobile app. If a key leaks, ask us to
revoke it: revocation takes effect immediately, and we can issue a replacement alongside
the old one so you can rotate without downtime.

## Responses and errors

Every response uses the same envelope:

```json
{ "success": true, "statusCode": 201, "message": "Shipment created", "data": { … } }
```

```json
{
  "success": false,
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Enter a valid Nigerian phone number",
  "errors": { "dropoff.phone": "Enter a valid Nigerian phone number" }
}
```

| Status | `code`                              | Meaning                                                                                |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`                  | A field is invalid — see `errors` (field path → message)                               |
| 400    | `BAD_REQUEST`, `INVALID_TRANSITION` | Request is valid but not allowed (e.g. area not served, cancelling a picked-up parcel) |
| 401    | `UNAUTHORIZED`                      | Missing, invalid or revoked API key, or account suspended                              |
| 404    | `NOT_FOUND`                         | No such shipment **for your account**                                                  |
| 429    | `RATE_LIMITED`                      | Slow down; retry after a short wait                                                    |
| 5xx    | `INTERNAL_ERROR`                    | Our fault — safe to retry with the same `clientReference`                              |

**Rate limits** (per API key, per minute): 60 shipment creates, 120 quotes/lists, 300 shipment lookups.

## Endpoints

### `GET /zones` — where we deliver

```json
{
  "data": [
    {
      "id": "6acc…b9",
      "code": "WSE",
      "name": "Wuse",
      "areas": ["Wuse I", "Wuse II", "Zone 4", "Zone 6", "Berger"]
    }
  ]
}
```

Every pickup and drop-off needs a `zoneId` and one of that zone's `areas`. Cache this
list for a few hours; it changes rarely.

### `POST /quotes` — price before you book

```json
{
  "pickupZoneId": "6acc…b9",
  "dropoffZoneId": "6acc…b7",
  "size": "small",
  "weightKg": 1.5,
  "serviceLevel": "standard",
  "fragile": false,
  "declaredValue": 0
}
```

→ `{ "data": { "lines": [ { "code": "route", "label": "Delivery fare", "amount": 200000 }, … ], "total": 250000, "currency": "NGN" } }`

| Field           | Values                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `size`          | `envelope` (≤0.5 kg) · `small` (≤2 kg) · `medium` (≤10 kg) · `large` (≤20 kg) · `xlarge` (≤50 kg) |
| `serviceLevel`  | `standard` (24–48 h) · `express` (≤6 h) · `same_day` (book before 2 pm)                           |
| `declaredValue` | Kobo. Above 0 adds goods protection.                                                              |

Prices are **estimates**: the rider checks size and weight at pickup. If they differ, the
price is recalculated with the same rules, and you get an `shipment.price_adjusted` webhook.

### `POST /shipments` — book a delivery

```bash
curl -X POST https://api.estene.ng/api/v1/shipments \
  -H "Authorization: Bearer $ESTENE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clientReference": "SO-10023",
    "pickup":  { "contactName": "Store 4", "phone": "08021112222", "zoneId": "6acc…b9", "area": "Wuse II",
                 "address": "Plot 1 Hub Road", "landmark": "Behind Banex" },
    "dropoff": { "contactName": "Ngozi Eze", "phone": "08064445555", "zoneId": "6acc…b7", "area": "Garki II",
                 "address": "9 Lagos Street" },
    "parcel":  { "size": "small", "weightKg": 1, "description": "Phone case", "fragile": false, "declaredValue": 0 },
    "serviceLevel": "standard",
    "paymentMethod": "on_account",
    "notes": "Call on arrival"
  }'
```

| Field                                  | Notes                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `clientReference`                      | **Recommended.** Your own id for this delivery — typically your sales order number (≤64 chars). Makes the call idempotent (see below). |
| `paymentMethod`                        | `on_account` (default — invoiced to your business) · `cash_on_pickup` · `cash_on_delivery`                                             |
| `pickup.location` / `dropoff.location` | Optional `{ "lat": 9.07, "lng": 7.48 }` — improves rider matching                                                                      |
| `senderEmail`, `notes`                 | Optional                                                                                                                               |

Returns **201** with the [shipment object](#the-shipment-object).

**Idempotency.** If you send an `clientReference` you have used before, we don't create
a second shipment. You get the original back with **200** and the message
`Shipment already exists for this clientReference`. After a timeout or a 5xx, retry
with the same body. That is always safe.

The recipient gets an SMS with the tracking link. When the parcel is out for delivery,
they get a **4-digit delivery PIN** to give the rider. The PIN is never exposed through
the API.

### `GET /shipments` — list your shipments

Query: `page`, `limit` (≤100), `status`, `clientReference`. Returns
`{ items, page, limit, total, totalPages }`.

### `GET /shipments/{ref}` — one shipment

`{ref}` can be our `id`, the `trackingNumber`, or your `clientReference`.

### `POST /shipments/{ref}/cancel`

Body (optional): `{ "reason": "Customer cancelled" }`. You can cancel until a rider
is on the way to pickup. After that you get `400 INVALID_TRANSITION`; call Estene
operations instead.

## The shipment object

```json
{
  "id": "6acca0ec521ff1d44cd25178",
  "trackingNumber": "ESTFS7R5CYT0",
  "trackingUrl": "https://estene.ng/track/ESTFS7R5CYT0",
  "clientReference": "SO-10023",
  "status": "out_for_delivery",
  "statusLabel": "Out for delivery",
  "pickup":  { "contactName": "Store 4", "phone": "+2348021112222", "area": "Wuse II", "address": "Plot 1 Hub Road", "landmark": "Behind Banex", "zone": "WSE" },
  "dropoff": { "contactName": "Ngozi Eze", "phone": "+2348064445555", "area": "Garki II", "address": "9 Lagos Street", "landmark": null, "zone": "GRK" },
  "parcel": { "size": "medium", "weightKg": 3, "description": "Phone case", "fragile": false, "declaredValue": 0 },
  "serviceLevel": "standard",
  "paymentMethod": "on_account",
  "paymentStatus": "unpaid",
  "amount": { "estimate": 250000, "final": 320000, "currency": "NGN" },
  "priceAdjustment": { "from": 250000, "to": 320000, "reason": "Box bigger than declared" },
  "rider": { "firstName": "Musa" },
  "proofOfDelivery": null,
  "events": [ { "status": "created", "at": "2026-10-12T08:57:16.885Z", "note": null }, … ],
  "order": null,
  "createdAt": "2026-10-12T08:57:16.885Z",
  "updatedAt": "2026-10-12T09:02:41.120Z"
}
```

`amount.final` is set once the rider confirms the parcel at pickup. `order` is set when
the shipment was packed from one of your [warehousing orders](#warehousing):
`{ "number": "ORD-…", "reference": "your-order-id" | null }`. Use it to match shipment
webhooks back to your order. `proofOfDelivery` is
set on delivery: `{ "method": "pin" | "photo", "photoUrl", "receivedBy", "at" }`.

### Status lifecycle

```
created → assigned → en_route_to_pickup → picked_up → in_transit → (at_hub) → out_for_delivery → delivered
                                                     ↘ out_for_delivery (same-zone trips)
out_for_delivery → delivery_failed → out_for_delivery (re-attempt) | returned
created / assigned → cancelled
```

Terminal statuses: `delivered`, `returned`, `cancelled`. Treat unknown statuses
gracefully; we may add new ones.

## Warehousing

For businesses that keep stock with us. We hold your goods in an Estene warehouse;
you send orders and we pick, pack and deliver them. These endpoints return
`403 WAREHOUSING_DISABLED` until Estene operations switch warehousing on for your account.

The flow:

1. **Create your products** (`POST /products`): one per SKU.
2. **Tell us what you're sending** (`POST /inbounds`). When it arrives we count it in,
   and the good units become available stock.
3. **Send orders** (`POST /orders`). Stock is reserved right away. If any line is short,
   the order waits as `awaiting_stock` and is reserved automatically when stock arrives.
4. **We pack each order into a shipment.** From then on it is an ordinary shipment, with
   the same tracking, the same `shipment.*` webhooks and the same billing. The shipment's
   `order` field names the order.

Storage is billed as a flat monthly fee on your account. Each delivery is billed like any
other shipment.

### Products

| Method & path           | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `GET /products`         | Your catalogue (`?search=`, `?active=true`, paginated)  |
| `POST /products`        | Create a product. `409 DUPLICATE_SKU` if the SKU exists |
| `GET /products/{sku}`   | One product, by SKU or id                               |
| `PATCH /products/{sku}` | Update anything except the SKU                          |

```json
{
  "sku": "SHEA-250",
  "name": "Whipped shea butter 250ml",
  "size": "small",
  "weightKg": 0.3,
  "declaredValue": 650000,
  "fragile": false,
  "barcode": "6151234567890"
}
```

`size` is the packed size of **one unit** (`envelope`, `small`, `medium`, `large`,
`xlarge`), and `declaredValue` is the value of one unit in kobo. We use both to size and
insure each parcel.

### `GET /stock`: what's on the shelf

```json
[
  {
    "sku": "SHEA-250",
    "name": "Whipped shea butter 250ml",
    "onHand": 38,
    "reserved": 2,
    "available": 36,
    "warehouse": "ABJ-WSE"
  }
]
```

`reserved` units belong to orders that are not packed yet. Filter with `?sku=`.

### Inbounds: sending us stock

`POST /inbounds`:

```json
{
  "reference": "PO-2291",
  "expectedAt": "2026-10-21",
  "lines": [{ "sku": "SHEA-250", "expectedQty": 100 }]
}
```

`reference` is your own id (purchase order, waybill). Sending the same one again returns
the original inbound (`200`), not a duplicate. Once we count the delivery, `status`
becomes `received` and each line shows `receivedQty` (good units now in stock) and
`damagedQty`. `GET /inbounds`, `GET /inbounds/{ref}` and `POST /inbounds/{ref}/cancel`
(only while `expected`) are also available.

When we move your stock between our warehouses, the move shows up as an inbound at the
destination with `transferFrom` set to the origin's office code (it is `null` for your own
deliveries). You can't cancel a transfer; ask us if you need to.

### `POST /orders`: ship from your stock

```json
{
  "reference": "SO-10023",
  "recipient": {
    "contactName": "Ngozi Eze",
    "phone": "08064445555",
    "zoneId": "64b7…",
    "area": "Garki II",
    "address": "9 Lagos Street",
    "landmark": "Opposite the church"
  },
  "deliveryMode": "door",
  "serviceLevel": "standard",
  "paymentMethod": "on_account",
  "lines": [
    { "sku": "SHEA-250", "qty": 2 },
    { "sku": "SOAP-BLK", "qty": 1 }
  ],
  "notes": "Gift — no invoice in the box"
}
```

- `reference` makes the call idempotent. A retry returns the original order with `200`.
- `deliveryMode: "collection"` with `destinationOfficeId` lets the recipient collect at
  an office. In that case the address fields are not needed.
- `paymentMethod` is `on_account` (we bill you) or `cash_on_delivery` (the recipient pays
  the **delivery fee** to the rider). We do not collect the item's value yet.
- An unknown or inactive SKU fails with `400 UNKNOWN_PRODUCT` / `INACTIVE_PRODUCT`. The
  message names the SKU.

`GET /orders` (`?status=`, `?reference=`), `GET /orders/{ref}` (our id, `ORD-` number or
your reference) and `POST /orders/{ref}/cancel` are also available. You can cancel until
we pack the order. After packing, you can still cancel while the parcel is waiting at our
warehouse with no rider assigned. Once it has left, an undelivered parcel comes back as
`returned`.

### The order object

```json
{
  "id": "6ad5dc5db8e583e72d4b784a",
  "number": "ORD-9WTH0XFN",
  "reference": "SO-10023",
  "status": "shipped",
  "statusLabel": "Shipped",
  "recipient": {
    "contactName": "Ngozi Eze",
    "phone": "+2348064445555",
    "area": "Garki II",
    "address": "9 Lagos Street"
  },
  "deliveryMode": "door",
  "serviceLevel": "standard",
  "lines": [{ "sku": "SHEA-250", "name": "Whipped shea butter 250ml", "qty": 2 }],
  "shipment": {
    "trackingNumber": "ESTMR8JZM5XH",
    "trackingUrl": "https://estene.ng/track/ESTMR8JZM5XH",
    "status": "at_hub"
  },
  "createdAt": "2026-10-19T09:01:17.000Z",
  "updatedAt": "2026-10-19T09:03:01.000Z"
}
```

Order statuses:

```
awaiting_stock → ready_to_pick → picking → shipped → delivered
                                                   ↘ returned   (the shipment came back)
awaiting_stock / ready_to_pick / picking → cancelled
```

Subscribe to the `order.*` webhooks below to follow an order without polling. The
`shipment.*` events still fire for the parcel itself, and `data.shipment.order.reference`
links them back to your order.

## Webhooks

Give Estene operations an HTTPS endpoint and choose the events you want. They'll share a **signing
secret** (`whsec_…`) with you. Subscribe only to what you act on: many integrations just need
`shipment.delivered`.

| Event                       | Title                   | When                                                                                  |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `shipment.created`          | New booking             | A shipment was booked for your account (via the API, or by our staff on your behalf)  |
| `shipment.cancelled`        | Cancelled               | The shipment was cancelled before pickup                                              |
| `shipment.rider_assigned`   | Rider assigned          | A rider accepted the job                                                              |
| `shipment.rider_unassigned` | Rider removed           | The rider was taken off the job; we're finding another                                |
| `shipment.rider_en_route`   | Rider heading to pickup | The rider is on the way to collect                                                    |
| `shipment.picked_up`        | Picked up               | Collected, QR-tagged, price confirmed                                                 |
| `shipment.price_adjusted`   | Price changed at pickup | Size/weight differed from the booking. Includes `previousAmount`, `amount`, `reason`. |
| `shipment.in_transit`       | In transit              | Moving between zones                                                                  |
| `shipment.at_hub`           | At sorting hub          | Arrived at a hub for an inter-zone handover                                           |
| `shipment.out_for_delivery` | Out for delivery        | On the way to the recipient                                                           |
| `shipment.delivered`        | Delivered               | Handed over, with `shipment.proofOfDelivery` set                                      |
| `shipment.delivery_failed`  | Delivery attempt failed | The rider couldn't hand it over; a re-attempt follows                                 |
| `shipment.returned`         | Returned to sender      | Taken back to the pickup address                                                      |
| `ping`                      | Test event              | Sent from our console to check your endpoint                                          |

Status events also carry `data.previousStatus` and `data.status`.

**Warehousing events** (store-and-ship clients only):

| Event                  | Title               | When                                                                       | `data`        |
| ---------------------- | ------------------- | -------------------------------------------------------------------------- | ------------- |
| `order.created`        | Order received      | An order arrived from any channel. `status` says if stock was reserved     | `{ order }`   |
| `order.stock_reserved` | Order ready to pick | Stock arrived for an order that was `awaiting_stock`                       | `{ order }`   |
| `order.shipped`        | Order shipped       | Packed and handed in; `order.shipment.trackingNumber` is set               | `{ order }`   |
| `order.delivered`      | Order delivered     | The order's shipment was delivered or collected                            | `{ order }`   |
| `order.returned`       | Order returned      | The shipment came back undelivered                                         | `{ order }`   |
| `order.cancelled`      | Order cancelled     | The order was cancelled and its stock released                             | `{ order }`   |
| `inbound.received`     | Stock received      | We counted an inbound (or a transfer). Lines carry received/damaged counts | `{ inbound }` |
| `stock.low`            | Stock running low   | A product's available stock fell to your low-stock threshold, once per dip | `{ stock }`   |

`order`, `inbound` and `stock` are the same objects the `/orders`, `/inbounds` and `/stock`
endpoints return. `stock.low` fires again only after the product has been restocked above
the threshold.

**Request we send:**

```http
POST /your/webhook HTTP/1.1
Content-Type: application/json
User-Agent: Estene-Webhooks/1.0
Estene-Event: shipment.out_for_delivery
Estene-Delivery: evt_2k9x7q…           ← unique per event; use it to de-duplicate
Estene-Signature: t=1791795444,v1=5f2c…

{
  "id": "evt_2k9x7q…",
  "type": "shipment.out_for_delivery",
  "title": "Out for delivery",
  "summary": "Shipment ESTFS7R5CYT0 (your ref SO-10023) is out for delivery to Ngozi Eze in Garki II.",
  "createdAt": "2026-10-12T09:41:07.512Z",
  "data": { "shipment": { …shipment object… }, "previousStatus": "picked_up", "status": "out_for_delivery" }
}
```

`title` and `summary` are plain English, ready to show to your own customers or post to a team
channel. Branch your code on `type`, never on the text: we may improve the wording.

**Respond with any 2xx within 10 seconds.** Do heavy work after responding. Redirects,
timeouts and non-2xx responses are retried with exponential backoff for about an hour
(8 attempts). After that the event is marked failed, and our team can resend it once
your endpoint is fixed. We keep the full delivery log for 30 days.

**Delivery guarantees.** At-least-once, so de-duplicate on `Estene-Delivery`. Events can
arrive out of order. Each one carries the full current shipment, so compare
`data.shipment.updatedAt` and keep the newest. Treat unknown event types gracefully;
we may add more.

### Verifying signatures

Compute `HMAC-SHA256(secret, "<t>.<raw request body>")` as hex and compare it with
`v1` in constant time. Reject timestamps older than 5 minutes. Use the **raw** body
bytes, before any JSON parsing.

**Node.js (Express)**

```js
import crypto from 'node:crypto';
import express from 'express';

const app = express();
app.post('/webhooks/estene', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.get('Estene-Signature') ?? '';
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto
    .createHmac('sha256', process.env.ESTENE_WEBHOOK_SECRET)
    .update(`${t}.${req.body}`)
    .digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  const valid =
    v1 &&
    expected.length === v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  if (!fresh || !valid) return res.sendStatus(401);

  const event = JSON.parse(req.body);
  res.sendStatus(200); // acknowledge first…
  handleEvent(event); // …then process (queue it)
});
```

**PHP**

```php
$body = file_get_contents('php://input');
parse_str(str_replace(',', '&', $_SERVER['HTTP_ESTENE_SIGNATURE'] ?? ''), $sig);
$expected = hash_hmac('sha256', $sig['t'] . '.' . $body, getenv('ESTENE_WEBHOOK_SECRET'));
if (abs(time() - (int) $sig['t']) > 300 || !hash_equals($expected, $sig['v1'] ?? '')) {
    http_response_code(401); exit;
}
http_response_code(200);
$event = json_decode($body, true);
```

**Python**

```python
import hmac, hashlib, time
def verify(secret: str, body: bytes, header: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts.get("t", 0))) > 300:
        return False
    expected = hmac.new(secret.encode(), f"{parts['t']}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))
```

**Rotating the secret.** We can rotate on request. The old secret stops working
immediately, so deploy the new one as soon as you receive it.

## Checklist before going live

- [ ] Key stored server-side (env var / secret manager), never committed
- [ ] Every create sends a unique `clientReference`; retries reuse it
- [ ] Zones cached and refreshed daily; area names sent exactly as listed
- [ ] Webhook verifies signature + timestamp, responds 2xx fast, de-duplicates on `Estene-Delivery`
- [ ] Out-of-order events handled via `data.shipment.updatedAt`
- [ ] Amounts treated as kobo integers
- [ ] Warehousing: every order and inbound sends your own `reference`; retries reuse it
