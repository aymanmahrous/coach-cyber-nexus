# Roadmap

- [x] Phase 1: Cockpit HUD, bilingual AR/EN, Coach Brain AI chat, business info
- [x] Cockpit KPIs, quick nav, shortcuts
- [x] Content Factory (ported from new-coach-: templates, poster studio, review/approve)
- [x] Imported WhatsApp Hub + Media Vault screens from new-coach- (auto-reply default set to manual)
- [x] /api/publish: real Facebook/Instagram publishing behind owner PIN (code ready, NOT live)
- [x] Phase 1 Security & Truthful Status: publish/canva/brain hardening, honest status bar
- [x] Durable store (Supabase) for publish idempotency, PIN rate limiting, Canva tokens — code ready; needs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY + migration applied
- [ ] Owner to supply Meta tokens + owner PIN (blocked: owner approval)
- [x] WhatsApp Hub real inbox: signed webhook `/api/whatsapp`, owner-only inbox + manual reply `/api/whatsapp/messages` (auto-reply stays manual) — needs WhatsApp Cloud API secrets
- [x] Canva tokens stored durably with automatic refresh; "verified" only after a live Canva API check
- [x] Posts cloud sync via `/api/posts` (owner session; localStorage kept as offline cache/queue)
- [ ] TikTok direct publishing (deferred: needs TikTok developer app approval + OAuth token refresh; unaudited apps can only post privately)
- [ ] Owner to supply Supabase project + WhatsApp Cloud API secrets (blocked: owner)
