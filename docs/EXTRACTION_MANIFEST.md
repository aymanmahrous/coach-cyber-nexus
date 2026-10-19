# Extraction Manifest

This manifest deliberately keeps the official product small. It is a selection list, not a request to copy the Command Center repository. Contracts are verified against source SQL before use; a frontend call site alone is not proof of the deployed server contract.

| Capability           | Source contract                                                                                                                                                                            | Official product action                                                   | Initial safety mode                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Authentication       | Supabase Auth + active `staff_profiles`                                                                                                                                                    | Rebuild as one shared session gate                                        | Read/restore only                                       |
| Coach Brain          | `get_staff_knowledge_management(p_search, p_language, p_status)`; protected server `/api/brain`                                                                                            | Load active knowledge with staff JWT; bound and sanitize before model use | No answer if protected knowledge is unavailable         |
| Content list/edit    | `get_staff_content_items` verified; `update_staff_content_item` client call shape only, SQL definition not found                                                                           | Replace local posts hook only after database contract verification        | Read + controlled edit, currently read only             |
| Approval/scheduling  | `approve_staff_content_batch(uuid)` and `approve_and_schedule_staff_content_item(uuid,timestamptz)` have SQL; `transition_staff_content_item` definition not found in inspected migrations | Add explicit review actions only after role/state contract verification   | No live publish in tests; schedule queues a publish job |
| Media library        | `get_staff_media_assets`, `register_staff_media_upload`                                                                                                                                    | Replace placeholder vault data                                            | Private/read-only first                                 |
| Media linkage        | `link_staff_media_to_content_item`                                                                                                                                                         | Link only after item and asset validation                                 | Controlled write                                        |
| Image generation     | `generate-gemini-image`                                                                                                                                                                    | Use existing function through adapter                                     | Dry-run/review first                                    |
| WhatsApp inbox       | `get_staff_inbox`, `get_staff_conversation_messages`                                                                                                                                       | Rebuild the inbox surface                                                 | Read-only first                                         |
| Conversation control | `take_over_staff_conversation`, `return_staff_conversation_to_ai`                                                                                                                          | Add confirmed mode transitions                                            | Audited controlled write                                |
| WhatsApp send        | `send-whatsapp-message` plus outbound guard                                                                                                                                                | Keep disabled in verification                                             | Dry-run only                                            |
| Integration status   | `get_staff_integrations`, `meta-provider-status`                                                                                                                                           | Put under Settings                                                        | Accurate status only                                    |
| Publishing           | `safe-content-publisher` and receipts                                                                                                                                                      | Defer until explicit release gate                                         | Never live in tests                                     |

## Explicitly excluded from the official product

- Command Center shell, launcher, workspace, and broad navigation.
- CRM, bookings, analytics, archive, radar, operations queue, and unrelated admin modules.
- Legacy browser-local post storage and PIN session logic.
- Direct provider tokens in the browser.

## Acceptance gate for each extracted capability

A capability is accepted only if it has: (1) a documented RPC/function contract, (2) staff JWT enforcement, (3) a truthful error state, (4) no live external side effect in tests, and (5) a focused test or contract check.
