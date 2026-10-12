# Estene Logistics

Parcel pickup and delivery for Abuja (and later, the rest of Nigeria). One pnpm + Turborepo
monorepo holds the API, every client, and the packages they share.

| App            | Package               | Stack                              | Dev port |
| -------------- | --------------------- | ---------------------------------- | -------- |
| API            | `@estene/api`         | Fastify 5, Mongoose, Redis, BullMQ | 4000     |
| Admin console  | `@estene/admin`       | Vite, React 19, TanStack Query     | 5400     |
| Public website | `@estene/web`         | Next.js 16 (App Router)            | 3100     |
| Rider app      | `apps/rider` _(next)_ | Expo / React Native                | —        |

| Package              | What lives there                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `@estene/contracts`  | Domain enums, order state machine, pricing formula, Zod request schemas — shared by API **and** clients |
| `@estene/lib`        | Browser utilities (`cn`, dates, `ApiError`, query-client factory)                                       |
| `@estene/api-client` | Axios client that unwraps the API envelope and handles token refresh                                    |
| `@estene/ui`         | Shared React primitives + brand components (`Logo`, `OrderStatusBadge`)                                 |
| `@estene/theme`      | Brand tokens (Estene Blue + Signal Amber) and base CSS                                                  |
| `@estene/config`     | tsconfig bases                                                                                          |

## Getting started

Prerequisites: Node ≥ 22, pnpm 10, MongoDB and Redis running locally.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # then set JWT_SECRET + ENCRYPTION_KEY (openssl rand -hex 32)
cp apps/admin/.env.example apps/admin/.env
cp apps/web/.env.example apps/web/.env.local
pnpm seed                                    # super admin, 9 Abuja zones, pricing, 2 demo riders, 50 QR tags
pnpm dev                                     # everything; or dev:api / dev:admin / dev:web
```

Sign in to the admin at http://localhost:5400 with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from
`apps/api/.env`. Demo riders sign in with phone `08030000001` / `08030000002`, password `rider1234`.
In development SMS is printed to the API log instead of sent.

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
- [`CLAUDE.md`](CLAUDE.md) — conventions for contributors and coding agents
