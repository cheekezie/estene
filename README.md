# Estene Logistics

Parcel pickup and delivery for Abuja (and later, the rest of Nigeria). One pnpm + Turborepo
monorepo holds the API, every client, and the packages they share.

| App            | Package               | Stack                              | Dev port |
| -------------- | --------------------- | ---------------------------------- | -------- |
| API            | `@estene/api`         | Fastify 5, Mongoose, Redis, BullMQ | 4000     |
| Admin console  | `@estene/admin`       | Vite, React 19, TanStack Query     | 5400     |
| Client portal  | `@estene/portal`      | Vite, React 19, TanStack Query     | 5500     |
| Public website | `@estene/web`         | Next.js 16 (App Router)            | 3100     |
| Rider app      | `apps/rider` _(next)_ | Expo / React Native                | —        |

| Package              | What lives there                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@estene/contracts`  | Domain enums, shipment state machine, pricing formula, Zod request schemas — shared by API **and** clients |
| `@estene/lib`        | Browser utilities (`cn`, dates, `ApiError`, query-client factory)                                          |
| `@estene/api-client` | Axios client that unwraps the API envelope and handles token refresh                                       |
| `@estene/ui`         | Shared React primitives + brand components (`Logo`, `ShipmentStatusBadge`)                                 |
| `@estene/theme`      | Brand tokens (Estene Blue + Signal Amber) and base CSS                                                     |
| `@estene/config`     | tsconfig bases                                                                                             |

## Getting started

Prerequisites: Node ≥ 22, pnpm 10, MongoDB and Redis running locally.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # then set JWT_SECRET + ENCRYPTION_KEY (openssl rand -hex 32)
cp apps/admin/.env.example apps/admin/.env
cp apps/portal/.env.example apps/portal/.env
cp apps/web/.env.example apps/web/.env.local
pnpm seed                                    # super admin, Abuja + Lagos zones, offices, pricing, demo riders, QR tags
pnpm dev                                     # everything; or dev:api / dev:admin / dev:web
```

Sign in to the admin at http://localhost:5400 with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from
`apps/api/.env`. Demo riders sign in with phone `08030000001` / `08030000002`, password `rider1234`.
In development SMS is printed to the API log instead of sent.

The client portal (http://localhost:5500) is for staff at business clients: deliveries, statement
and — for warehousing clients — stock, orders, inbounds and products. Create a login from the
admin under Business clients → a client → **Portal access**; the temporary password is shown once
and must be changed at first sign-in. The seed adds one: `amaka@naijaglow.ng` / `Portal12345`.

Payments run on a local simulator by default. One gateway handles both customer payments and
rider payouts. Set it in `apps/api/.env`:

- `PAYMENTS_PROVIDER=saukipay` with `SAUKIPAY_SECRET_KEY`, or
- `PAYMENTS_PROVIDER=sayswitch` with `SAYSWITCH_SECRET_KEY`

`.env.example` lists the webhook URL to register with each gateway.

## Common commands

| Command                           |                                                   |
| --------------------------------- | ------------------------------------------------- |
| `pnpm dev` / `pnpm dev:<app>`     | Watch mode                                        |
| `pnpm build` / `pnpm build:<app>` | Production builds                                 |
| `pnpm typecheck`                  | Type-check every package                          |
| `pnpm test`                       | Vitest (pricing, state machine, dispatch ranking) |
| `pnpm seed`                       | Idempotent dev seed                               |

Commits follow Conventional Commits (`feat(api): …`), enforced by commitlint.

## Further reading

- [`docs/architecture.md`](docs/architecture.md) — system design, domain flows, decisions and roadmap
- [`docs/integrations.md`](docs/integrations.md) — integration API + webhooks guide (share with partner developers)
- [`docs/plans/fleet-partners.md`](docs/plans/fleet-partners.md) — **start here next**: where we left off, next steps, fleet partners plan
- [`CLAUDE.md`](CLAUDE.md) — conventions for contributors and coding agents

## Deploying the API

For the DigitalOcean droplet (GitHub Actions builds the image and deploys it on every push), see
[`deploy/droplet/README.md`](deploy/droplet/README.md). Railway is below.

The API deploys on its own as a Docker image (`apps/api/Dockerfile`, built from the repo root).
The image holds only the bundled server and its production dependencies. Frontend code is
never part of it.

**Railway**

1. New service from this repo. Leave the root directory empty and set the config file path to
   `/apps/api/railway.json`. Only changes to the API, contracts or the lockfile redeploy it.
2. Add MongoDB and Redis services. Set `MONGODB_URI=${{MongoDB.MONGO_URL}}` and
   `REDIS_URL=${{Redis.REDIS_URL}}`.
3. Set `NODE_ENV=production`, `JWT_SECRET`, `ENCRYPTION_KEY`, `CORS_ORIGINS`, `PUBLIC_SITE_URL`,
   the payment keys and the `R2_*` settings (see `apps/api/.env.example`).
4. Create the first admin from the service shell:
   `node dist/create-admin.js --email you@estene.ng --name "Your Name"`.
   `pnpm seed` is demo data and refuses to run in production.

Put the API and the admin and portal on one domain (`api.estene.ng`, `admin.estene.ng`). Sign-in
cookies are `SameSite=Strict`, so they aren't sent between `*.up.railway.app` hosts.
