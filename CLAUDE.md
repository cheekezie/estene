# Estene — working conventions

Logistics platform for Abuja. Read `docs/architecture.md` before changing domain logic.

## Layout

- `apps/api` — Fastify modules in `src/modules/<name>/`: `<name>.routes.ts` (thin: `parse` → service → `send`),
  `<name>.service.ts` (all logic), `models/*.model.ts`, optional `<name>.listeners.ts` for event subscribers.
- `apps/admin` — `src/features/<feature>/` holds pages, `<feature>.queries.ts` (TanStack Query hooks + keys)
  and `components/`. App-only shared code lives in `src/shared/`.
- `apps/web` — Next.js App Router; server components fetch through `src/lib/api.ts`.
- `packages/*` ship TypeScript source (no build step). Import by subpath: `@estene/contracts/shipment`.

## Rules

- **Schemas and enums go in `@estene/contracts`**, never duplicated in an app. Validate API input with `parse(Schema, input)`.
- **Money is integer kobo** everywhere except form inputs; convert with `nairaToKobo` / `formatNaira`.
- **Shipment status changes only via `ShipmentsService.transition`** — it enforces the state machine and compare-and-set.
- Cross-module side effects go through `bus.emit` + a listener, not direct imports. Slow work goes to a BullMQ queue.
- Ledger entries are append-only and need a deterministic `idempotencyKey` when triggered by events.
- Never return `pinCipher`, password hashes or refresh tokens from an endpoint. Public endpoints expose no phone numbers or addresses.
- `IntegrationShipmentDto` (`/api/v1` + webhook payloads) is a public contract — additive changes only; update `docs/integrations.md` with it.
- Integration routes must scope every query by `req.apiClient.clientId`.
- `shipment.created` means "new shipment", once. To re-run dispatch emit `dispatch.requested`.
- Role checks: `requireActor(...)` + `requireRole(...)` on the API; `useCan()` in the admin is a UI hint only.
- UI colours come from theme tokens (`bg-primary`, `bg-accent`, `text-muted-foreground`); amber is for emphasis, not body UI.

## Verify

`pnpm typecheck && pnpm test`, then `pnpm seed` and exercise the flow (see README).
