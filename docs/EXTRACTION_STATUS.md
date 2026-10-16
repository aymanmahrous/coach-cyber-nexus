# Extraction status — official product

## Completed in this pass

- Kept `coach-cyber-nexus` as the official product boundary; no Command Center UI or runtime package imports were added.
- Retired the legacy `/api/publish` PIN endpoint and removed the local/remote publish controls that called it.
- Removed the legacy `/api/canva` OAuth endpoint and stopped the UI from calling it or implying that an in-memory token is a durable integration.
- Removed local-only approve/schedule/status-confirmation actions. Content changes cannot claim approval, scheduling, or publication until verified staff RPCs are wired.
- Coach Brain now verifies the bearer JWT, checks an active allowlisted staff role, and loads active knowledge only through the staff JWT-protected `get_staff_knowledge_management` RPC. It bounds and sanitizes the context, marks it as untrusted reference data, and fails closed when the protected RPC is unavailable.
- Added mock-only tests for knowledge filtering/redaction, RPC authentication headers, bounded prompt context, and the provisional content mutation adapter.

## Not yet accepted

These capabilities remain incomplete and must not be represented as production-ready until they pass the manifest acceptance gate:

- **Coach Brain:** protected active knowledge context is now connected, but the approved operational contract is `get_staff_knowledge_management`, not the `get_staff_content_brain_context` name previously written in the manifest. No `business_settings` table contract was found in the inspected migrations. Static business facts were removed from the API system prompt. Verify actual runtime roles and provider configuration before release.
- **Content:** reads use `get_staff_content_items`. The source UI references `update_staff_content_item` and `transition_staff_content_item`, but their SQL definitions were absent from the inspected migration tree. `src/lib/content-rpc.ts` is a tested draft adapter only; it is not wired into the UI. No approved content-create RPC was verified, and locally generated records are not persistent.
- **Approval/scheduling:** `approve_and_schedule_staff_content_item` has a verified SQL signature, but it also enqueues a publish job. Keep it disconnected until exact user confirmation, deployed grants, worker behavior, and the backend state transitions are validated. No live RPC is executed in tests.
- **Media:** the current vault includes local preview/placeholder behavior. Private staff media read, signed URLs, upload registration, and validated linkage remain to be integrated.
- **Messages:** the current WhatsApp surface is not the staff inbox. Read-only inbox/message RPCs and audited, confirmed mode changes are pending.
- **Integrations:** status must come from staff-authorized provider status functions and be labeled accurately; legacy routes are no longer a source of truth.
- **Publishing and outbound messages:** remain disabled/deferred. No live provider call is part of verification.
- **Role-based navigation:** the official shell still needs capability-by-role visibility backed by the same server authorization contract. Hiding a screen is not a substitute for server authorization.

## Release gate

For each capability, require a written RPC/function contract, staff JWT enforcement, truthful error states, no live external side effects in tests, and a focused contract test. Do not restore retired endpoints or expose actions that only mutate browser state. The Command Center may be consulted as a source repository, but its UI, navigation, and API routes are not dependencies of this app. See [the content RPC audit](CONTENT_RPC_AUDIT.md) for server contract gaps.
