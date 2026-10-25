# Official Product Boundary

## Decision

`coach-cyber-nexus` is the official product. `command-center-hub` is only a source of selected backend contracts and implementation patterns; it is not part of the official user experience and must not remain a runtime dependency.

## Official product surfaces

The first release contains only five user-facing surfaces:

1. **Home** — a concise operational summary, not a command-center dashboard.
2. **Coach Brain** — authenticated advisory and drafting workspace.
3. **Content** — review, edit, approve, and schedule content.
4. **WhatsApp** — inbox, conversation takeover, AI suggestion, and dry-run reply.
5. **Media** — private media library and approved media linkage.

Settings and integrations are secondary screens, not primary navigation areas.

## Reuse boundary

Allowed reuse from `command-center-hub`:

- Supabase Auth and active `staff_profiles` authorization contract.
- Staff-only RPC contracts for content, media, conversations, and integrations.
- Existing Edge Functions for AI image generation, batch generation, Meta status, and dry-run messaging.
- Audit, receipt, idempotency, and RLS patterns.
- Small domain adapters after review and renaming for the official product.

Not allowed:

- Importing Command Center pages, navigation, launcher, workspace, or CSS shell.
- Keeping `localStorage` as a source of truth for posts or sessions.
- Keeping PIN authentication or browser-held service credentials.
- Calling legacy `/api/publish` or `/api/canva` from the official product.
- Copying unrelated CRM, bookings, analytics, archive, automation, radar, or control-tower modules.
- Enabling live publishing or live WhatsApp sending during verification.

## Runtime rule

The official frontend talks to Supabase using a browser-safe publishable/anon key and the authenticated staff JWT. Sensitive provider work stays behind existing Edge Functions. No service-role key is accepted in `VITE_*` variables.

## Migration order

1. Auth gate and staff profile restoration.
2. Replace local posts with the staff content RPC boundary.
3. Replace hard-coded Coach Brain context with a protected backend request.
4. Add content review/scheduling through approved RPCs.
5. Add read-only media, then private upload/linking after contract verification.
6. Add inbox and dry-run reply flow.
7. Add integration status as a secondary settings screen.
8. Delete legacy routes only after the replacement has passed tests.
