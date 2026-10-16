# Content RPC audit — official product

Reviewed against the checked-out `command-center-hub` source on 2026-10-16. No database project was queried or changed.

## Verified contracts

| Purpose                   | Evidence in source                                                                                                                  | Verified input contract                                                                        | Safety note                                                                                                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List content              | Migration `20260911100000_content_batch_safety_foundation.sql` and later replacement in `20260911143000_media_library_pipeline.sql` | `get_staff_content_items()`; authenticated staff check in SQL                                  | Read only; returns up to 500 rows, including status, timestamps, media linkage and receipts.                                                                                                                                                    |
| Atomic approve + schedule | Migrations `20261007230500_atomic_approve_and_schedule_content.sql` and `20261007205500_fix_atomic_schedule_publish_payload.sql`    | `approve_and_schedule_staff_content_item(p_content_item_id uuid, p_scheduled_for timestamptz)` | This is **not a harmless calendar-only write**: it performs approval and queues a `publish_content` background job. Require explicit owner confirmation in a future UI. Never invoke it in tests or against a live backend during verification. |
| Batch approve             | Migration `20260911100000_content_batch_safety_foundation.sql`                                                                      | `approve_staff_content_batch(p_batch_id uuid)`                                                 | Approval only in that function; distinct from scheduling/publishing.                                                                                                                                                                            |

## Unverified / missing server contracts

- `update_staff_content_item` and `transition_staff_content_item` are called by the Command Center UI (`src/main.tsx`), and referenced in docs/tests, but their SQL function definitions were **not present** in the checked-out migration tree. The UI call sites show provisional argument names and action values, not the actual installed Postgres signature, role matrix, state machine, audit behavior, or side effects.
- A migration or database export proving those function definitions and grants is required before wiring the draft adapter into user-facing save/approval controls.
- The official content UI currently reads the shared RPC list but its generated/manual posts are not persisted; the source set inspected here does not establish a content-create RPC. The ID generation is local and cannot be passed to update/transition RPCs.
- The atomic schedule migration requires business confirmation before use because it creates work that the publishing worker may execute later. An ordinary UI confirmation must identify the post and exact scheduled time before this call is enabled.

## Prepared adapter

`src/lib/content-rpc.ts` provides Zod-validated payloads, an explicit action allowlist, and a small API around the observed client call shapes. Tests inject a mock RPC invoker. The adapter is deliberately not called by the UI until backend definitions, grants, authorization roles, and side effects are verified. Do not treat its tests as proof that the database currently exposes these procedures.

## No-live-effect test policy

The content RPC tests inject a mock function and assert only names, argument mapping, validation, and error handling. They never use `callOfficialRpc` or connect to Supabase. The atomic approve-and-schedule function is therefore not invoked as part of test execution.
