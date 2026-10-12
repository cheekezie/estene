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
  "createdAt": "2026-10-12T08:57:16.885Z",
  "updatedAt": "2026-10-12T09:02:41.120Z"
}
```

`amount.final` is set once the rider confirms the parcel at pickup. `proofOfDelivery` is
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
