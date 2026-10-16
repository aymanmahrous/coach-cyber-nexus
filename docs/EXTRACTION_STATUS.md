# Extraction status — official product

## Completed in this pass

- Kept `coach-cyber-nexus` as the official product boundary; no Command Center UI or runtime package imports were added.
- Retired the legacy `/api/publish` PIN endpoint and removed the local/remote publish controls that called it.
- Removed the legacy `/api/canva` OAuth endpoint and stopped the UI from calling it or implying that an in-memory token is a durable integration.
- Removed local-only approve/schedule/status-confirmation actions. Content changes cannot claim approval, scheduling, or publication until the approved staff RPCs are wired.
- Existing shared login still uses Supabase Auth and checks an active `staff_profiles` row; the server Coach Brain endpoint verifies the bearer JWT and active staff profile.

## Not yet accepted

These capabilities remain incomplete and must not be represented as production-ready until they pass the manifest acceptance gate:

- **Coach Brain:** `/api/brain` still carries static business instructions and calls provider APIs directly. It must load bounded business/knowledge context from the documented protected staff contract and use the approved protected AI function.
- **Content:** reads use `get_staff_content_items`; controlled edits, transitions, approval and scheduling still need approved RPC wiring, role checks, error states, and contract tests.
- **Media:** the current vault includes local preview/placeholder behavior. Private staff media read, signed URLs, upload registration, and validated linkage remain to be integrated.
- **Messages:** the current WhatsApp surface is not the staff inbox. Read-only inbox/message RPCs and audited, confirmed mode changes are pending.
- **Integrations:** status must come from staff-authorized provider status functions and be labeled accurately; legacy routes are no longer a source of truth.
- **Publishing and outbound messages:** remain disabled/deferred. No live provider call is part of verification.
- **Role-based navigation:** the official shell still needs capability-by-role visibility backed by the same server authorization contract. Hiding a screen is not a substitute for server authorization.

## Release gate

For each capability, require a written RPC/function contract, staff JWT enforcement, truthful error states, no live external side effects in tests, and a focused contract test. Do not restore retired endpoints or expose actions that only mutate browser state. The Command Center may be consulted as a source repository, but its UI, navigation, and API routes are not dependencies of this app.
