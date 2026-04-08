# SillyTavern Mobile - Feature Parity Roadmap

## Current State Summary

**sillytavern-mobile** is a React/Vite/Zustand web app with:
- Multi-user auth (login/register, role-based access, invitation system)
- Character CRUD + import/export (PNG Card V2, JSON), tags, favorites, search
- Single & group chat with streaming (SSE), swipes, editing, regenerate/continue/impersonate
- 7 AI providers (OpenAI, Claude, Gemini, Mistral, Groq, OpenRouter, custom OpenAI-compatible endpoint)
- Full prompt engineering: sampler presets, system prompt, macros, token-aware context, instruct mode
- World Info / Lorebooks with keyword scanning and depth-based injection
- Group chat activation strategies (list, natural, pooled, manual) + per-member mute
- Theme system (light/dark/auto, presets), three chat layouts, font scale, avatar shapes
- Extensions: TTS, image generation, translation, summarization — all toggleable
- Author's Note, regex scripts, quick replies
- Markdown rendering with syntax-highlighted code blocks, RP formatting preserved
- Mobile-responsive dark/light theme

**SillyTavern** (desktop) is a massively feature-rich Node.js SPA with 20+ API backends, World Info/Lorebooks, STscript scripting, 30+ extensions, full prompt engineering, regex scripts, Data Bank/RAG, and deep customization.

---

## Gap Analysis & Roadmap

Features are grouped into **phases** ordered by user impact and dependency. Each phase builds on the previous.

---

## Phase 1: Chat Experience Foundations ✅ DONE
*Goal: Make the chat feel complete and usable for daily use.*

### 1.1 Message Swiping (Alternate Responses) ✅
- `swipes: string[]` and `swipeId: number` on every `ChatMessage`. Swipe left (navigate back) and swipe right (generate new) wired into `ChatMessage` via `SwipeControl`.
- `swipeLeft` / `swipeRight` actions in `chatStore`. Right-swipe calls `generateMessage` and appends the new response to the swipes array without touching previous swipes.
- Persisted in chat JSONL via `extra.swipes` / `extra.swipe_id`.

### 1.2 Regenerate / Continue / Impersonate ✅
- `ChatActionBar` below the message list with Regenerate, Continue, and Impersonate buttons.
- `regenerateMessage`: replaces the last AI message in-place.
- `continueMessage`: sends context with the last AI message as a prefix, streams and appends the result.
- `impersonate`: generates a user-voice message, returned as a string for the caller to prefill the input.

### 1.3 Message Editing Improvements ✅
- Tap any message to enter inline edit mode (textarea replacing the content).
- Per-message action menu (⋯ button): Edit, Delete, Edit & Regenerate.
- Up-arrow key on an empty input triggers edit of the last user message (via `editLastNonce`).
- Edits saved immediately to the backend.

### 1.4 Streaming Improvements ✅
- Typing indicator (`TypingIndicator`) shown while waiting for the first token (before streaming begins).
- Blinking streaming cursor appended to the last segment of `MarkdownContent` while tokens are arriving.
- Unclosed code fences auto-closed during streaming so they render as code blocks, not raw backticks.

### 1.5 Chat File Management ✅
- Full chat CRUD: create, rename, delete, export (JSONL + plaintext), import JSONL.
- `ChatHistoryPanel`: slide-in panel listing all chat files for the selected character, with load/rename/delete/export actions.
- Import via file picker; multipart POST to `/api/chats/import`.

---

## Phase 2: Character & Persona Depth ✅ DONE
*Goal: Support the full character card spec and user personas.*

### 2.1 Advanced Character Fields ✅
- Alternate greetings array with swipe UI on the first message (Character Card V2 `alternate_greetings`).
- Character's Note with configurable depth and role (stored in `data.extensions.depth_prompt`).
- System prompt override and post-history instructions override fields; per-field toggles to respect or ignore character overrides.
- `talkativeness`, `creator`, `version` fields surfaced in the character editor.

### 2.2 User Personas ✅
- `personaStore`: CRUD for named personas, each with name, avatar, description, description position (`in_prompt` / `before_char` / `after_char` / `at_depth`), depth, and role.
- Default persona and per-character persona locking (avatar → persona ID map).
- Persona injected into `buildConversationContext` at the configured position; `{{persona}}` and `{{user}}` macros resolve to the active persona.
- Persona selector in the sidebar/header.

### 2.3 Character Tags & Organization ✅
- Tag filter bar on the character list with multi-tag AND filtering.
- Favorite toggle (star icon) with a Favorites-first sort option.
- Sort options: name, date modified, recent chat.
- Full-text search across character name, description, and tags.

### 2.4 Character Duplicate & Convert ✅
- One-click duplicate action in the character action menu; duplicated card gets a `(copy)` suffix.
- Convert-to-persona action: creates a new persona from the character's name, avatar, and description.

---

## Phase 3: Prompt Engineering & Generation Control ✅ DONE
*Goal: Give users control over how prompts are built and how the AI generates.*

### 3.1 Sampler Parameters ✅
- Full sampler panel: temperature, max tokens, top P, top K, min P, frequency/presence/repetition penalty, stop strings.
- Presets: save named presets, load, delete. Persist in localStorage (`generationStore`).
- Params are sent through `generateMessage` to the backend; unused fields are stripped.

### 3.2 System Prompt / Main Prompt Editing ✅
- User-editable main prompt, jailbreak/auxiliary prompt, post-history instructions — all in Generation Settings.
- Character card overrides are still honored (togglable via checkboxes).
- All fields support the macro system.

### 3.3 Basic Macro System ✅
- `src/utils/macros.ts`: `{{char}}`, `{{user}}`, `{{persona}}`, `{{description}}`, `{{personality}}`, `{{scenario}}`, `{{time}}`, `{{date}}`, `{{weekday}}`, `{{month}}`, `{{random[:a,b,c]}}`, `{{pick:a,b,c}}`, `{{roll:d6}}`, `{{lastMessage}}`, `{{lastUserMessage}}`, `{{lastCharMessage}}`, `{{model}}`, `{{newline}}`, `{{noop}}`.
- Applied in system prompt, all character card fields, and user prompt overrides.

### 3.4 Context Size Management ✅
- `src/utils/tokenizer.ts` with per-provider char-per-token heuristics (GPT ≈ 4.0, Claude ≈ 3.6, Llama ≈ 3.5, generic ≈ 3.8).
- Configurable max context tokens + response reserve.
- Token-aware trimming: keeps system prompts, drops oldest history to fit budget.
- Fixed-message-count fallback still available.
- Live token estimate surfaced in the Generation Settings header.

### 3.5 Instruct Mode (Text Completion APIs) ✅
- `src/utils/instructTemplates.ts` with 7 built-in templates: Alpaca, ChatML, Llama 3, Mistral, Vicuna, Metharme/Pygmalion, Raw.
- Toggle + template selector + extra stop strings in the Instruct tab.
- When enabled, chat messages are flattened into a single text-completion prompt with role prefixes/suffixes.

---

## Phase 4: World Info / Lorebook
*Goal: Enable persistent world-building context injection.*

### 4.1 Basic World Info ✅
- `src/stores/worldInfoStore.ts`: lorebook store with full CRUD for books and entries. Per-entry fields: keys, content, comment, enabled, constant, caseSensitive, position, depth, order. Configurable scan depth. Multiple books can be active at once.
- Keyword scanner (`scanMessagesForEntries`): joins the last N non-system messages into a haystack and matches entry keys (case-(in)sensitive). Constant entries bypass matching.
- `buildConversationContext` in `chatStore.ts` groups matched entries by position and injects into the prompt: `before_char`, `after_char`, `before_an`, `after_an`, and `at_depth` (interleaved with history). Macros (`{{char}}` etc.) run on entry content.
- UI at `/settings/worldinfo`: lorebook list with active toggle, rename, duplicate, delete, create, import, export; dedicated book editor with per-entry create/edit/enable/disable/delete.
- JSON import/export uses SillyTavern's lorebook format (`{ entries: { uid: { key, content, position, order, ... } } }`) with position codes 0-4 mapped round-trip.

### 4.2 Advanced World Info
- **Gap:** N/A (depends on 4.1).
- **ST Feature:** Secondary keys (AND/NOT logic), regex keys, scan depth, case sensitivity, probability, inclusion groups, timed effects (sticky/cooldown/delay), recursive scanning.
- **Work:** Add secondary key logic. Regex key support. Configurable scan depth. Probability activation. Token budget management. Inclusion groups for mutually exclusive entries.

### 4.3 Character-Embedded Lorebooks
- **Gap:** N/A.
- **ST Feature:** Lorebooks embedded in character cards, auto-loaded on character select.
- **Work:** Read/write `data.character_book` from Character Card V2. Auto-activate character lore on selection. Support additional lorebook linking.

---

## Phase 5: Group Chat Enhancements
*Goal: Bring group chats to ST-level functionality.*

### 5.1 Activation Strategies ✅
- Three strategies selectable per group chat, persisted on the `GroupChatInfo` record:
  - **List** (default, legacy): every member replies in order on each user turn.
  - **Natural**: scans the last non-system message for a member name mention (word-boundary, case-insensitive). On match, that member replies; on multi-match, a weighted roll within the matches. With no mention, falls back to a weighted roll across the full pool. Weights come from `character.data.extensions.talkativeness` (string "0"–"1", default 0.5 when absent/invalid/out-of-range).
  - **Pooled**: weighted random pick, excluding the N most-recent distinct AI speakers (N configurable via slider, default 1). Pool-empty falls back to the full candidate set.
- Per-member **mute toggle** ships with 5.1 (partner to 5.2). Muted avatars are filtered out before speaker selection in every strategy.
- UI: collapsible controls panel in the group chat header with segmented strategy picker, pooled exclude-recent slider, and per-member mute list showing each member's current talkativeness.
- Manual trigger is deferred (tracked as a follow-up).

### 5.2 Group Chat Controls
- **Gap:** Can add characters, and mute toggle ships with 5.1. No reorder, force-talk, or auto-mode yet.
- **ST Feature:** Mute/unmute members, force individual response, auto-mode (continuous generation), character reordering, allow self-responses toggle.
- **Work:** Mute toggle per member ✅ (landed with 5.1). Force-talk button. Auto-mode with configurable delay. Drag-to-reorder member list. Group scenario override.

### 5.3 Character Card Handling in Groups
- **Gap:** Basic per-character system prompts. No join mode.
- **ST Feature:** Swap mode (only active speaker's info) vs Join mode (all members' info combined).
- **Work:** Add character card handling strategy selector. Implement join mode with configurable prefix/suffix.

---

## Phase 6: UI/UX Polish & Theming
*Goal: Match ST's customization depth while staying mobile-first.*

### 6.1 Theme System ✅
- CSS variable-based theme system (`--color-primary`, `--color-bg-*`, `--color-text-*`, `--color-border`).
- Light / Dark / Auto (system) mode toggle, persisted in localStorage.
- 6 built-in theme presets (Default, Ocean, Forest, Sunset, Rose, Midnight) with color swatches in Settings.
- Theme applied on boot and on change via `applyTheme()`.

### 6.2 Chat Display Styles ✅
- Three layout modes: **Bubbles** (messenger-style), **Flat** (log-style), **Document** (compact, no avatars).
- Configurable avatar shape: circle, rounded square, square.
- Font size slider (12–20 px).
- Chat max-width slider (50–100%).
- All preferences stored in localStorage and applied per-render in `ChatView`.

### 6.3 Mobile-Specific UX
- **Gap:** Basic mobile layout exists but needs refinement.
- **ST Feature:** Responsive panels, gesture navigation, mobile-optimized controls.
- **Work:** Swipe gestures for sidebar toggle. Pull-to-refresh. Bottom sheet for actions. Haptic feedback. Better keyboard handling. Landscape mode support. PWA install prompt.

### 6.4 Visual Novel Mode
- **Gap:** Sprites show in a small area during chat.
- **ST Feature:** Full visual novel mode with central sprite display, backgrounds, multi-character layout.
- **Work:** VN mode toggle. Full-screen sprite display behind chat. Background image support. Multi-character sprite positioning in group chats. Sprite costume system (`/costume` command equivalent).

### 6.5 Message Formatting & Markdown ✅
- `MarkdownContent.tsx`: full GFM rendering via `marked` + `dompurify` sanitization.
- Syntax-highlighted fenced code blocks (via `highlight.js`) with language label and one-click Copy button.
- RP formatting (`*action*`, `_action_`, `{{thought}}`) parsed first, before markdown, so they take priority over `**bold**`/`__underline__` without conflicts. Code blocks sheltered from RP regex.
- Streaming-safe: unclosed code fences auto-closed mid-stream; blinking cursor appended to the last rendered segment.
- User messages use the lighter `FormattedContent` (RP-only); AI messages use full `MarkdownContent`.
- Complete CSS in `index.css`: paragraph spacing, headers (h1–h4), blockquotes, lists, HR, links, tables, inline code, fenced code blocks.

---

## Phase 7: Extensions Core ✅ DONE
*Goal: Build the extension infrastructure and implement high-value extensions.*

### 7.1 Extension System Architecture ✅
- `extensionStore`: persisted Zustand store with a per-extension enabled flag (`tts`, `imageGen`, `translate`, `summarize`). Defaults: all on except `summarize`.
- `ExtensionsPage` at `/settings/extensions` (available to `end_user`): four toggle cards, each with name, description, and enable/disable switch. The Summarize card expands to show inline settings.
- TTS and translate buttons in `ChatMessage`, imageGen button in `ChatInput`, and the `SummaryPanel` are all gated on the extension store — disabling an extension hides its UI throughout the app.

### 7.2 TTS (Text-to-Speech) ✅
- `useSpeechSynthesis` hook wrapping the browser's Web Speech API. Voice list loads async (Chrome `voiceschanged`). Singleton tracker ensures only one message speaks at a time across all hook instances.
- RP formatting (`* *`, `{{ }}`, `_ _`) stripped before speaking.
- Per-message speaker icon in the action toolbar; auto-read toggle (speak last AI message when streaming completes).
- Voice URI, rate (0.5–2.0), pitch (0.5–2.0), and language configurable in Settings.

### 7.3 Image Generation ✅
- `imageGenApi`: Pollinations (free, no setup) and SD WebUI (local) backends.
- `imageGenStore`: persisted config (backend, SD URL/auth, model, dimensions, steps, CFG scale); `generate()` returns a base64 data URI.
- `ImageGenModal`: prompt + negative prompt, backend selector, size presets, advanced params, real-time preview, one-click insert into chat.
- Generated images appended as standalone chat messages via `insertImageMessage` and persisted to the backend.

### 7.4 Chat Translation ✅
- `translateApi`: 7 providers (Google, Bing, Lingva, Yandex, DeepL, DeepLX, LibreTranslate), 20+ target languages. Routes to `/api/translate/<provider>`.
- `translateStore`: persisted provider + language; per-message translation cache, pending set, and visibility set.
- Globe icon on AI messages toggles translation panel inline; shows loading state. Provider and language configurable in Settings.

### 7.5 Summarization ✅
- `summarizeStore`: `generateSummary` calls the active LLM with the last 40 non-system messages and a "2–4 sentence summary" system prompt. Result persisted per chat file name. Settings: `autoSummarize`, `autoTriggerEvery` (5–100 messages), `injectionDepth` (default 999 = before all history), `injectionRole`.
- `SummaryPanel`: collapsible panel in `ChatView` (between Author's Note and Quick Reply Bar). Shows summary text, generation timestamp, message count. Generate/Regenerate + Clear buttons with loading/error states.
- Context injection: summary inserted at configured depth in `buildConversationContext`, matching the Author's Note pattern. At depth 999 it prepends before all history.
- Auto-summarize fires after each AI response when `messages since last summary ≥ autoTriggerEvery`.

---

## Phase 8: Advanced Features
*Goal: Power-user features that complete the parity picture.*

### 8.1 Author's Note ✅
- `AuthorNote` interface: `content`, `depth`, `role`. Stored in localStorage keyed by chat file name (`sillytavern_author_notes`).
- Collapsible `AuthorNote` panel in `ChatView`, above Quick Reply Bar. Textarea (2000 char limit), depth input (0–999), role selector (system/user/assistant).
- Injected into `buildConversationContext` at configured depth from the end of history; if depth exceeds history length, prepended before all history. Also persisted in the chat JSONL header.

### 8.2 Regex Scripts ✅
- `regexScriptStore`: persisted store with full CRUD for regex scripts. Per-script fields: pattern, flags, replacement, scope (`user_input` / `ai_output`), `displayOnly`, `disabled`, order.
- Applied via `applyRegexScripts` / `getActiveScripts` utilities: user-input scripts run before send; AI-output scripts run after streaming completes; display-only scripts run at render time in `ChatMessage` without mutating stored content.
- `RegexScriptPage` at `/settings/regex`: list with enable/disable toggle, edit (inline form), delete, reorder (up/down), create.

### 8.3 Quick Replies ✅
- `quickReplyStore`: persisted sets (`QuickReplySet`) each containing entries (`QuickReplyEntry { id, label, message }`). Full CRUD + up/down reordering for both sets and entries. `activeSetId` persisted.
- `QuickReplyBar`: horizontally-scrollable pill strip above `ChatInput`. Tap → prefills input via `prefillText`/`prefillNonce`. Long-press (400 ms) → sends immediately. Hidden when no active set or set is empty.
- `QuickReplyPage` at `/settings/quickreplies` (available to `end_user`): set list (active-set radio, inline rename, CRUD) → entry editor (add/edit/delete, up/down reorder).

### 8.4 Connection Profiles
- **Gap:** Single active provider/model. No saved configurations.
- **ST Feature:** Save/switch between complete API configurations.
- **Work:** Profile store. Save current config as profile. Switch profiles from dropdown. Profile includes: provider, model, API key reference, sampler settings.

### 8.5 Data Bank / RAG
- **Gap:** No RAG/vector storage.
- **ST Feature:** Document upload, vectorization, semantic retrieval, multi-scope data banks.
- **Work:** Document upload and chunking. Embedding via API (OpenAI embeddings). Vector similarity search. Inject relevant chunks into context. Per-character and global scopes.

### 8.6 Chat Branching & Checkpoints
- **Gap:** No branching.
- **ST Feature:** Create checkpoint at any message, branch into alternate story paths, navigate between branches.
- **Work:** Branch data model (tree structure). Create branch action on messages. Branch navigator UI. Branch naming.

### 8.7 Basic STscript / Slash Commands
- **Gap:** No scripting.
- **ST Feature:** Full STscript language with 100+ commands.
- **Work:** Implement command parser for `/` prefix. Start with core commands: `/sys`, `/send`, `/sendas`, `/trigger`, `/gen`, `/continue`, `/swipe`, `/persona`, `/go`, `/bg`. Pipe system for chaining. Variable get/set.

---

## Phase 9: Prompt Manager & Advanced Prompt Control
*Goal: Full prompt engineering capabilities.*

### 9.1 Prompt Manager UI
- **Gap:** No prompt manager. Fixed prompt structure.
- **ST Feature:** Drag-and-drop ordering of all prompt elements, toggle visibility, custom prompt slots.
- **Work:** Visual prompt order editor. Drag-and-drop reordering. Enable/disable per prompt section. Custom prompt insertion points.

### 9.2 Prompt Templates & Presets
- **Gap:** No presets.
- **ST Feature:** Save/load prompt configurations, share presets.
- **Work:** Preset save/load system. Import/export presets. Built-in starter presets.

### 9.3 Full Macro System
- **Gap:** Only core macros from Phase 3.
- **ST Feature:** 100+ macros including conditionals, variables, math, chat history queries.
- **Work:** Extend macro parser with: `{{if}}`/`{{else}}`/`{{/if}}`, `{{getvar}}`/`{{setvar}}`, `{{random}}` with full syntax, `{{lastMessage}}`, `{{lastCharMessage}}`, `{{lastUserMessage}}`, `{{maxPrompt}}`, `{{model}}`, `{{isMobile}}`.

---

## Phase 10: Additional API Backend Support
*Goal: Support the full range of AI backends that ST users expect.*

### 10.1 Local Model Support ✅
- Custom OpenAI-compatible endpoint: configurable base URL, API key, and model name. Covers Ollama, LM Studio, llama.cpp server, KoboldCpp, TabbyAPI, and any OpenAI-compatible backend.
- Shown in Settings when provider is set to `custom`. Model name free-text input (auto-fetch not yet implemented).
- Persisted via `settingsStore` alongside other provider settings.

### 10.2 Additional Cloud Providers
- **Gap:** 6 providers (OpenAI, Claude, Gemini, Mistral, Groq, OpenRouter).
- **ST Feature:** 15+ cloud providers.
- **Work:** Add: DeepSeek, Cohere, NovelAI, AI Horde (free community), Perplexity, Fireworks AI. Each needs: auth config, model list, request/response mapping, streaming support.

### 10.3 Text Completion API Support
- **Gap:** Only chat completion format.
- **ST Feature:** Full text completion support for local models.
- **Work:** Text completion request builder. Instruct mode integration. Context template system. Model-specific tokenizer selection.

---

## Priority Matrix

| Phase | Impact | Effort | Priority |
|-------|--------|--------|----------|
| 1. Chat Experience | Very High | Medium | **✅ Done** |
| 2. Character & Persona | High | Medium | **✅ Done** |
| 3. Prompt Engineering | High | Medium | **✅ Done** |
| 4. World Info | High | Large | **P1 - Essential** |
| 5. Group Chat | Medium | Medium | **P2 - Important** |
| 6. UI/UX Polish | High | Medium | **P1 - Essential** |
| 7. Extensions | Medium | Large | **✅ Done** |
| 8. Advanced Features | Medium | Large | **P3 - Nice to Have** |
| 9. Prompt Manager | Medium | Medium | **P2 - Important** |
| 10. API Backends | Medium | Medium | **P2 - Important** |

---

## Recommended Execution Order

```
Phase 1 (Chat Experience) ──────────┐
Phase 2 (Characters & Personas) ────┤── Sprint 1-3: Core UX ✅ Done
Phase 6.5 (Markdown Rendering) ─────┘

Phase 3 (Prompt & Generation) ──────┐
Phase 6.1-6.2 (Themes & Styles) ────┤── Sprint 4-6: Customization ✅ Done
Phase 10.1 (Custom Endpoints) ──────┘

Phase 4 (World Info) ───────────────┐
Phase 5 (Group Chat) ───────────────┤── Sprint 7-9: Depth Features  ← current
Phase 8.1-8.2 (Author's Note, Regex)┘

Phase 7 (Extensions) ──────────────┐
Phase 8.3-8.6 (Quick Replies, RAG) ┤── Sprint 10-12: Extensions ✅ Done (7, 8.1-8.3)
Phase 9 (Prompt Manager) ──────────┘

Phase 8.7 (STscript) ──────────────┐
Phase 10.2-10.3 (More APIs) ───────┤── Sprint 13+: Power User
Phase 6.3-6.4 (Mobile UX, VN Mode) ┘
```

---

## What Mobile Should NOT Replicate

Some ST features are desktop-specific or inappropriate for mobile:

- **MovingUI drag-and-drop panels** - Not suited for touch interfaces
- **Server plugins (Node.js)** - Mobile is a client-only app
- **Custom CSS editor** - Too complex for mobile; use theme presets instead
- **Full STscript IDE** - Support running scripts, but editing is better on desktop
- **Server administration** - Config.yaml editing, user management should stay server-side
- **Extension installation from URL** - Security risk on mobile; curate a built-in set

---

## Metrics for "Feature Parity"

True 100% parity is neither achievable nor desirable for mobile. Target:

- **Core Parity (Phases 1-4):** Users can have the same quality conversations with the same characters using the same context/lore. **Target: 100%** — Phases 1–3 complete; Phase 4.1 complete, 4.2–4.3 remaining.
- **Customization Parity (Phases 5-6):** Users can personalize their experience. **Target: 80%** — 6.1, 6.2, 6.5 complete; 5.1 complete; 5.2–5.3, 6.3–6.4 remaining.
- **Extension Parity (Phase 7):** Most-used extensions work. **Target: 60%** ✅ — TTS, image gen, translation, summarization all shipped.
- **Power User Parity (Phases 8-10):** Advanced features available. **Target: 50%** — Author's Note, regex, quick replies, custom endpoint done; connection profiles, RAG, branching, STscript remaining.
- **Scripting Parity (STscript):** Basic command execution. **Target: 30%** (run scripts, not write them)
