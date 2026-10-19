# Official product roadmap

## Extraction and boundary
- [x] Establish `coach-cyber-nexus` as the official UI and keep Command Center out of runtime imports.
- [x] Retire legacy PIN-based live publishing and in-memory Canva OAuth routes.
- [x] Remove browser-only publish/approval/scheduling status mutations that imply durable action.
- [ ] Complete documented Auth + active staff profile restoration and role/capability visibility checks.
- [ ] Wire `/api/brain` to the protected staff knowledge context and approved AI function.
- [ ] Replace local content mutations with `update_staff_content_item`, `transition_staff_content_item`, and `approve_and_schedule_staff_content_item` using staff JWTs.
- [ ] Replace media placeholders with private staff media RPCs, signed reads, validated uploads, and validated content linkage.
- [ ] Replace the WhatsApp placeholder with read-only inbox/message RPCs and audited conversation mode transitions.
- [ ] Add accurate staff-authorized integration status and focused contract checks.
- [ ] Keep live publishing and outbound messaging disabled until the explicit release gate.

Each checked capability must satisfy the acceptance gate in `docs/EXTRACTION_MANIFEST.md`; see `docs/EXTRACTION_STATUS.md` for the current implementation boundaries.
