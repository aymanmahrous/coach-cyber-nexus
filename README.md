# Coach Cyber Nexus — official product

`coach-cyber-nexus` is the official, role-aware product. The `command-center-hub` repository is not a UI dependency or runtime API for this app. Only reviewed staff-authenticated backend contracts may be adopted from it.

## Current safety boundary

The app uses Supabase Auth and verifies an active `staff_profiles` record. Browser configuration is limited to the Supabase URL and publishable/anon key; never put a service-role key or provider secret in a `VITE_*` variable. The retired PIN-based `/api/publish` and in-memory `/api/canva` routes are not part of the official product. Live publishing and outbound messaging are intentionally unavailable during verification. Content approval/scheduling must not be implemented as browser-only state changes.

Coach Brain now obtains active Academy Knowledge through the staff-authenticated `get_staff_knowledge_management` RPC, with bounded/sanitized context. It fails closed when that protected source is unavailable. The current media and messaging surfaces are not accepted as production-connected until their documented RPC/function contracts, authorization, truthful states, and focused tests are in place. Content writes remain disconnected pending backend contract verification; see [the content RPC audit](docs/CONTENT_RPC_AUDIT.md), [extraction status](docs/EXTRACTION_STATUS.md), [manifest](docs/EXTRACTION_MANIFEST.md), and [product boundary](docs/OFFICIAL_PRODUCT_BOUNDARY.md).

## Development

```sh
npm install
cp .env.example .env
npm run dev
```

## Verification

```sh
npm run lint
npm test
npm run build
```

Do not deploy or enable external publishing until the capability passes its extraction acceptance gate and an explicit release decision is made.
