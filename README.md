# EventMerge

**Nigeria-first event ticketing & management platform.** Merges two prior codebases into one product:

- **TruffleEvents** → cryptographic **rotating QR** anti-fraud (AES-256-GCM, 30s TTL), **offline PWA gate scanning**, ₦/en-NG localization, role dashboards.
- **EventFlow** → **intelligent seat allocation** (K-means + constrained greedy), venue seat maps, **scale-hardened QR check-in**, native **mobile scanner** app.

Both crown jewels, one foundation (Next.js 16 + Supabase), one brand ("Lagos Nightlife" — teal `#0D9488` + coral `#FF6B4A`).

## Monorepo layout

| Path | What | Stack |
|------|------|-------|
| `apps/web` | Web PWA — attendee, organizer, gatekeeper, admin | Next.js 16 · React 19 · Prisma · Tailwind v4 |
| `apps/web/prisma` | Unified data model + seed | Prisma schema · Neon Postgres |
| `apps/security-engine` | AES-256-GCM rotating-QR encrypt/validate | Python · FastAPI |
| `apps/sao-engine` | Seat-allocation optimizer | Python · FastAPI · scikit-learn |
| `apps/mobile` | Staff QR scanner (+ offline queue) | Expo · React Native · NativeWind |
| `packages/types` | Shared TS domain/API types | TypeScript |
| `packages/validators` | Shared Zod schemas | Zod |
| `packages/ui` | Shared components + design tokens | React |

## Data flow

Next.js **server actions** are the single backend edge → **Neon Postgres via Prisma** → server-to-server HTTP to `security-engine` (QR crypto) and `sao-engine` (seat allocation), each authed with `X-Api-Secret`. Auth is our own: bcrypt passwords + short-lived JWT access token (`jose`) + rotating refresh token stored hashed in Postgres; authorization is enforced in the app layer (role checks in server actions), with the Edge `proxy.ts` gating routes by role. Image uploads go to Cloudinary. The Expo scanner validates QRs via `security-engine` and syncs an offline hash-list.

## Getting started

```bash
pnpm install                 # workspace deps (web, mobile, packages)

# 1. Configure apps/web/.env.local (copy from .env.local.example):
#    DATABASE_URL (Neon), JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, engine URLs/secret
pnpm db:deploy               # apply Prisma migrations to Neon
pnpm db:seed                 # one user per role + a sample seated event

# 2. Run the services:
pnpm dev:web                 # Next.js on :3000
pnpm dev:security            # FastAPI crypto engine on :8100
pnpm dev:sao                 # FastAPI seat-allocation engine on :8200
pnpm dev:mobile              # Expo dev server
```

Python services: create a venv and `pip install -r requirements.txt` in each engine dir, and copy their `.env.example` → `.env` (set `API_SECRET` to match `SAO_API_SECRET`).

**Demo logins** (after `db:seed`, password `Password123!`): `admin@eventmerge.test`, `organizer@eventmerge.test`, `gatekeeper@eventmerge.test`, `attendee@eventmerge.test`.

## Roadmap (phased)

- **Phase 0 ✅** — monorepo scaffold, unified schema + RLS, brand palette.
- **Phase 1** — one working app: both crown jewels (rotating crypto QR, offline scanning, seat allocation, mobile scanner), all four role dashboards. Mock checkout.
- **Phase 2** — **Paystack** payments + organizer payouts + refunds.
- **Phase 3** — email/SMS/WhatsApp notifications + competitive gaps (discovery, analytics).

See `docs/gap-analysis.md` for the Nigerian-market positioning.
