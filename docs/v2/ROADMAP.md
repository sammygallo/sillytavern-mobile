# GGBC v2 — Roadmap & Design Notes

> **Status:** Idea-shaping. No code yet. This doc is the living capture of decisions, open questions, and the idea backlog so we don't re-decide the same things.
>
> **Last updated:** 2026-05-02 (added: pgvector decision, Rive motion tier, Film Creation, deepfake risk)

## One-liner

A standalone full-stack social app where humans befriend and interact with AI characters — an own-backend successor to the current SillyTavern fork, not a fork at all.

## North-star vision

- Own backend, own data layer, own protocol — stop being downstream of SillyTavern.
- Characters as first-class social entities: humans friend characters, characters can initiate friend requests when "affinity" warrants.
- DMs first, public feed deferred.
- Mobile-first via Expo React Native; current web client may continue as a parallel surface during transition.

---

## Strategic decisions

### Locked in
- **New backend, not a fork.** ST's local-JSON + forked frontend caps growth and rules out social features.
- **DMs-first social, public feed deferred to Phase 3.** Public UGC + AI + NSFW-adjacent community = T&S landmine that kills indie projects. Earn the right to ship a feed.
- **Canonical character + per-user `character_instance`** schema pattern. Doesn't force the "social network vs companion app" choice now — keeps both doors open.
- **ST extension compat via a thin facade**, not a deep integration. Mirror only the endpoints existing extensions hit; new v2 features go to `/api/v2/*`. Deprecate the compat layer once extensions migrate.
- **Solo-dev frugal stack.** ~$0–15/mo on the existing DO droplet until subscriber count or load forces a split.
- **Single Postgres with `pgvector` + Redis cache.** Semantic retrieval for lore/instructions goes through pgvector; hot reads through Redis. A second primary database is rejected.

### Explicit non-goals (for now)
- Public feed at launch.
- Group chat as a v2 feature (revisit post-DM).
- Marketplace / creator monetization (revisit once social proves out).
- Multi-tenant / org accounts.
- Web3 / on-chain anything.
- **Multi-database architecture (Mongo or other object DB alongside Postgres).** Rationale: solo-dev ops cost (backups, replication, schema drift across two systems) outweighs flexibility. Postgres `jsonb` covers schema fluidity, `pgvector` covers semantic retrieval, Redis covers hot-path latency. Revisit only if a measured ceiling forces it.

### Open strategic questions
- **Character identity model under social load.** Is "Aria" a single shared global entity with one feed presence, or per-user instances that diverge? Schema supports both — product hasn't picked. Most load-bearing decision in v2.
- **Creator economics.** Free upload? Rev share? Tipping? Affects schema (creator_payout, character ownership transfer) and T&S posture.
- **NSFW posture.** Allowed, gated, banned, age-walled? Drives payment-processor selection (Stripe vs CCBill/Segpay), app-store strategy (TestFlight/sideload?), and moderation vendor.
- **Migration story for existing GGBC users.** Big-bang cutover, parallel run, or v1-as-import-source-only?

---

## Tech stack (frugal variant)

| Layer | Pick | Notes |
|---|---|---|
| Runtime | Node + TypeScript + Fastify | Shared types with mobile client; lighter than Nest, more conventional than Hono |
| Hosting | Existing DO droplet (vertical scale first) | Split when CPU/connection pressure forces it |
| Database | Postgres + `pgvector` (on droplet → DO managed when backups matter) | $0 → $15/mo |
| ORM/migrations | Drizzle + drizzle-kit | SQL-first, no codegen daemon, no serverless query-engine grief |
| Cache/Queue | Redis on droplet + BullMQ | Webhooks, mod scans, scheduled DMs, billing retries |
| Auth | Better-Auth (self-host, TS-native) | Social login + MFA + mobile flows; no per-MAU pricing |
| File storage | Cloudflare R2 | S3-compat, zero egress |
| Realtime | SSE for LLM stream, WS for social | Soketi if WS gets serious |
| Moderation | OpenAI `omni-moderation-latest` (text), defer image mod | Required before any public surface |
| Errors | Sentry free tier | |
| Analytics | Defer (PostHog self-host when needed) | |
| Billing | Stripe behind a `BillingProvider` interface | NSFW exposure → keep CCBill/Segpay swap path open |
| CI/CD | GitHub Actions → ssh + systemctl restart | Match current droplet workflow |

**Non-negotiable from day one:** automated nightly `pg_dump` to R2. The DB is the only thing we can't recover by redeploying.

### Mobile
- **Expo React Native** (managed workflow). EAS handles builds/signing.
- TypeScript end-to-end; share zod schemas with backend.
- Flutter rejected: solo dev, TS fluency, shared types > Flutter's nicer rendering story.

---

## Service topology (single droplet, split later)

```
┌─────────────────────────────────────────────┐
│  DO Droplet                                 │
│                                             │
│  ┌──────────┐   ┌──────────┐                │
│  │ api      │   │ worker   │  (PM2/systemd) │
│  │ (fastify)│   │ (bullmq) │                │
│  └────┬─────┘   └────┬─────┘                │
│       │              │                      │
│       ├──────────────┤                      │
│       ▼              ▼                      │
│  ┌──────────┐   ┌──────────┐                │
│  │ postgres │   │  redis   │                │
│  └──────────┘   └──────────┘                │
└──────┬──────────────────────────────────────┘
       │
       ├──► LLM providers (OpenRouter / direct)
       ├──► Cloudflare R2 (avatars, media)
       └──► Stripe

Clients:
  • Expo RN app   ──► /api/v2/* (REST + SSE + WS)
  • ST extensions ──► /api/* (compat facade)
  • v1 web (current ST fork) ──► /api/* during transition
```

**Split signals:** sustained DB CPU > 60% → managed Postgres. Worker backlog growing → separate worker droplet. WS connections > ~5k → break out WS server.

---

## Schema sketch (first tables)

```sql
users                 -- auth principals
  id, email, handle, created_at, subscription_tier

characters            -- canonical, creator-owned
  id, creator_user_id, name, card_data (jsonb, ST-compat),
  visibility (private|unlisted|public), nsfw_level, created_at

character_instances   -- per-user state (the load-bearing table)
  id, user_id, character_id,
  memory (jsonb),               -- long-term memory
  affinity (jsonb),             -- relationship state for friending
  persona_id, lorebook_overrides,
  last_interaction_at
  UNIQUE(user_id, character_id)

chats
  id, user_id, character_instance_id, title, created_at

messages
  id, chat_id, role, content, tokens, metadata (jsonb), created_at
  INDEX(chat_id, created_at)

personas              -- user's own personas
  id, user_id, name, description, avatar_url

friendships           -- phase 2; design now
  id, user_id, target_type (user|character), target_id,
  status (pending|accepted|blocked), initiated_by, created_at

extensions            -- ST compat
  id, user_id, slug, settings (jsonb), enabled

moderation_flags
  id, subject_type, subject_id, score, categories, action

subscriptions
  id, user_id, provider (stripe|ccbill), provider_sub_id,
  tier, status, current_period_end
```

**Why `character_instances` is the load-bearing table:** per-user memory, affinity score (gates "character sends you a friend request"), and privacy all live here. `characters` is the published/imported asset; `character_instances` is what *you* experience. This split is what lets a future public feed and present-day private chat coexist without a schema rewrite.

---

## Phasing

### Phase 1 — Backend foundation (3–4 mo)
- Fastify API + Postgres + Drizzle migrations
- Better-Auth (email + at least one social provider)
- Stripe billing behind `BillingProvider` interface
- Port existing chat: characters, chats, messages, SSE streaming, persona, lorebook
- ST compat facade for extensions
- Nightly `pg_dump` → R2
- Sentry + structured logs
- **Exit criteria:** an Expo build can sign in, import a character, and chat with streaming. ST extensions still work against compat endpoints.

### Phase 2 — Social: DMs + friendships (2–3 mo)
- Friend graph (human↔human, human↔character)
- Human↔human DMs over WS
- Character-initiated DMs *to friends only*, rate-limited, frequency-capped
- Affinity model drives character-initiated friend requests
- User controls: discoverability toggle, mute, block
- Moderation pipeline (OpenAI text mod) on every outgoing message
- **Exit criteria:** two users can DM. A character can request a friendship based on affinity. Moderation logs and override controls exist.

### Phase 3 — Public feed (deferred)
- Gated on: paid moderation tooling, T&S playbook, age-gating, payment-processor strategy locked, legal review.
- Not scoped here. Re-plan when prerequisites are real.

---

## Open decisions (next session candidates)

These are the threads left dangling from the architecture session. Pick one to drive next.

1. **ST compat endpoint inventory.** Catalog exactly which ST endpoints existing extensions hit. Defines the surface area of the compat facade and the cost of dropping it later.
2. **Better-Auth wiring for Expo.** Deep links, token refresh, OAuth redirect handling on iOS/Android — the sharp edges of mobile auth. Worth designing before code.
3. **Character-instance affinity model.** State, update rules, decay, signals (frequency, reciprocity, sentiment), and the threshold function that gates character-initiated friend requests. Core retention mechanic.

---

## Idea backlog (uncommitted)

Capture freely. Promotion to Phase X requires a real argument.

- **Character "mood" state** that drifts daily, influences proactive behavior.
- **Creator analytics dashboard** (chats started, retention, friend conversion).
- **Lorebook marketplace** as a creator monetization wedge.
- **Character voice (TTS)** — opt-in, per-character voice ID, ElevenLabs / OpenAI TTS.
- **Rive-based motion tier** between static Expressions and full Live2D — solves Live2D's licensing/cost/creator-accessibility friction without building a custom animation engine. Rive ships an SVG/JS-based runtime + editor tooling, free for indie. Reframes "build a Live2D replacement" into "add a middle motion tier alongside Expressions, Live Portrait, and Live2D."
- **Film Creation (Phase 4 monetization headliner)** — chat → AI screenplay agent → shot list → Replicate video pipeline that splices in chat-generated images, user avatar, and character avatar (still / Live Portrait / Expressions / Live2D). Likely the strongest paid-tier hook in the vision; expensive enough that credit-pack pricing is mandatory. Gated on: character continuity across shots maturing in video models, an explicit consent + similarity-check story for face data, and async-by-design UX (push when ready, not progress bar).
- **Group chats as "rooms"** with multiple characters + one human, characters aware of each other.
- **Federated character publishing** — export portable character bundle (card + lorebook + scripts + voice) signed by creator.
- **Mobile push notifications for character-initiated DMs** — biggest retention lever, also biggest spam risk.
- **Character "diary" / public posts** as a Phase-3 pre-feed primitive — characters post, only friends see, no public timeline yet.
- **Plugin runtime in mobile app** for ST-compat extensions — maybe just a WebView shim.
- **"Bring your own key" tier** for power users on a free plan; managed-key tier as paid default.
- **End-to-end encrypted human↔human DMs** as a paid feature differentiator.

---

## Risks worth naming

- **T&S / moderation cost** outpaces revenue once UGC ships. Mitigation: DMs-first delays this; image mod stays deferred until image UGC exists.
- **Stripe deplatforming** if NSFW posture drifts permissive. Mitigation: `BillingProvider` interface from day one; CCBill/Segpay integration kept as a documented swap.
- **App store rejection** for AI-companion + NSFW. Mitigation: launch as PWA + sideload first; pursue store presence with sanitized tier later.
- **Solo-dev burnout** on a 6+ month rebuild while v1 still needs maintenance. Mitigation: v1 enters maintenance mode (security + critical bugs only) the moment Phase 1 starts; no parallel feature work.
- **Migration friction** for existing GGBC users. Mitigation: v2 reads v1 character cards / lorebooks via the existing normalizers; chat history migration is best-effort, not promised.
- **Deepfake / face-data liability.** If Film Creation or any avatar-based generation surface ships, users *will* try to upload real-person photos. Inheriting that liability is a company-ender. Mitigation: explicit consent flows on avatar upload, facial-similarity checks against a celebrity/known-person index before allowing generation, clear ToS + per-render audit trail, and a moderation queue for flagged faces. Design these in *before* shipping any face-conditioned generation, not after.

---

## How this doc evolves

- Decisions move from "Open" to "Locked in" with a date and one-line reason.
- Ideas in the backlog get promoted to a Phase, dropped, or annotated with "deferred because X."
- Phase exit criteria get tightened as we learn — soft criteria are a smell.
- When a phase ships, archive its section and link to the launch retro.
