# SillyTavern Mobile - Feature Parity Roadmap

## Current State Summary

**sillytavern-mobile** is a React/Vite/Zustand web app with:
- Basic auth (login/register, multi-user)
- Character CRUD + import/export (PNG Card V2, JSON)
- Single & group chat with streaming (SSE)
- 6 AI providers (OpenAI, Claude, Gemini, Mistral, Groq, OpenRouter)
- Expression/sprite system with emotion parsing
- Settings page for API key & provider management
- Mobile-responsive dark theme

**SillyTavern** (desktop) is a massively feature-rich Node.js SPA with 20+ API backends, World Info/Lorebooks, STscript scripting, 30+ extensions, full prompt engineering, regex scripts, Data Bank/RAG, and deep customization.

---

## Gap Analysis & Roadmap

Features are grouped into **phases** ordered by user impact and dependency. Each phase builds on the previous.

---

## Phase 1: Chat Experience Foundations
*Goal: Make the chat feel complete and usable for daily use.*

### 1.1 Message Swiping (Alternate Responses)
- **Gap:** Mobile has no swipe/alternate response support.
- **ST Feature:** Generate alternative AI responses, navigate between them with arrows.
- **Work:** Store swipe array per message. Add swipe left/right UI (touch gesture + arrows). Hook into generate endpoint to append swipes. Persist swipes in chat JSONL.

### 1.2 Regenerate / Continue / Impersonate
- **Gap:** Mobile has basic `editMessageAndRegenerate` but no dedicated regenerate, continue, or impersonate.
- **ST Feature:** Ctrl+Enter regenerate, Alt+Enter continue (extend last AI message), impersonate (AI writes as user).
- **Work:** Add regenerate button (re-sends context, replaces last AI message). Add continue action (sends with last AI message as prefix, appends result). Add impersonate action (generates as user persona). Wire into chat input bar as action buttons.

### 1.3 Message Editing Improvements
- **Gap:** Basic edit exists but no inline editing, no edit-last-with-keyboard.
- **ST Feature:** Click-to-edit any message, up-arrow edits last, auto-save edits.
- **Work:** Inline edit mode on message tap. Add edit/delete per-message action menu. Save edits immediately to backend.

### 1.4 Streaming Improvements
- **Gap:** Basic SSE parsing works but no configurable streaming display.
- **ST Feature:** Configurable streaming FPS, smooth fade-in, token-by-token rendering.
- **Work:** Add smooth token rendering with configurable speed. Typing indicator while generating.

### 1.5 Chat File Management
- **Gap:** Can list/load/save chats but no rename, delete, export, or import chats.
- **ST Feature:** Full chat CRUD, export as JSONL/plaintext, import from multiple formats.
- **Work:** Add chat rename, delete, export (JSONL + plaintext). Import JSONL chats. UI for chat history browser.

---

## Phase 2: Character & Persona Depth
*Goal: Support the full character card spec and user personas.*

### 2.1 Advanced Character Fields
- **Gap:** Mobile has basic fields (name, description, personality, first_mes, scenario, mes_example, creator_notes, tags). Missing many advanced fields.
- **ST Feature:** Alternate greetings, character's note (with depth/role config), main prompt override, post-history instructions override, talkativeness, creator, version.
- **Work:** Add alternate greetings array with swipe UI on first message. Add character's note with depth/role selector. Add system prompt override fields. Store in Character Card V2 `data.extensions` properly.

### 2.2 User Personas
- **Gap:** No persona system. User is just "You" with a default avatar.
- **ST Feature:** Named personas with avatar, description, and description position. Persona locking to characters/chats. Default persona.
- **Work:** Create persona store. Persona CRUD UI. Persona selector in sidebar/header. Description injection into prompt at configurable position. Persona-character locking.

### 2.3 Character Tags & Organization
- **Gap:** Tags exist on characters but no filtering/organization UI.
- **ST Feature:** Tag-based filtering, tags-as-folders view, favorites, bulk operations.
- **Work:** Tag filter bar on character list. Favorite toggle. Sort options (name, date, recent chat). Search/filter characters.

### 2.4 Character Duplicate & Convert
- **Gap:** No duplicate or convert-to-persona.
- **ST Feature:** One-click duplicate, convert character to persona.
- **Work:** Add duplicate action. Add convert-to-persona action. Wire into character action menu.

---

## Phase 3: Prompt Engineering & Generation Control
*Goal: Give users control over how prompts are built and how the AI generates.*

### 3.1 Sampler Parameters
- **Gap:** Hardcoded `max_tokens: 1024, temperature: 0.9`. No other sampler controls.
- **ST Feature:** Temperature, Top P, Top K, Min P, frequency/presence penalty, repetition penalty, custom stopping strings, and 15+ advanced samplers.
- **Work:** Add generation settings panel. Per-provider parameter support (different providers support different params). Persist in settings. Add preset save/load.

### 3.2 System Prompt / Main Prompt Editing
- **Gap:** System prompt is hardcoded in chatStore.
- **ST Feature:** Editable main prompt, post-history instructions, jailbreak prompt, auxiliary prompt.
- **Work:** Move system prompt to settings store. Add editable system prompt field. Add post-history instructions. Support `{{char}}`/`{{user}}` macros in prompts.

### 3.3 Basic Macro System
- **Gap:** No macro support.
- **ST Feature:** 100+ macros (`{{char}}`, `{{user}}`, `{{time}}`, `{{date}}`, `{{random}}`, etc.).
- **Work:** Implement macro parser. Start with core macros: `{{char}}`, `{{user}}`, `{{time}}`, `{{date}}`, `{{weekday}}`, `{{random}}`, `{{pick}}`, `{{lastMessage}}`, `{{personality}}`, `{{description}}`, `{{scenario}}`, `{{persona}}`. Apply in system prompt, character fields, and user messages.

### 3.4 Context Size Management
- **Gap:** Hardcoded context window (last 20-30 messages). No token counting.
- **ST Feature:** Token-aware context building, configurable context size per model, token counter display.
- **Work:** Add approximate token counting (tiktoken for OpenAI, cl100k for Claude, character-based estimate as fallback). Configurable context size. Fill context intelligently rather than fixed message count. Show token usage in UI.

### 3.5 Instruct Mode (Text Completion APIs)
- **Gap:** Only supports chat completion format.
- **ST Feature:** Instruct templates for text completion models (Alpaca, ChatML, Llama, Mistral, etc.).
- **Work:** Add instruct mode toggle. Template system with prefix/suffix for user/assistant/system. Pre-built templates for common formats. Template editor.

---

## Phase 4: World Info / Lorebook
*Goal: Enable persistent world-building context injection.*

### 4.1 Basic World Info
- **Gap:** No World Info support at all.
- **ST Feature:** Keyword-triggered lore entries injected into context.
- **Work:** World Info store and CRUD UI. Entry fields: keys, content, position, insertion order. Keyword scanning against recent messages. Inject matching entries into prompt. Import/export World Info JSON.

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

### 5.1 Activation Strategies
- **Gap:** Basic sequential group chat exists. No activation mode selection.
- **ST Feature:** Natural Order (name mentions + talkativeness), List Order, Pooled Order, Manual trigger.
- **Work:** Add activation strategy selector. Implement Natural Order (parse last message for name mentions, use talkativeness field). Pooled Order (random from non-recent speakers). Manual mode with character trigger buttons.

### 5.2 Group Chat Controls
- **Gap:** Can add characters but no mute, reorder, force-talk, or auto-mode.
- **ST Feature:** Mute/unmute members, force individual response, auto-mode (continuous generation), character reordering, allow self-responses toggle.
- **Work:** Add mute toggle per member. Force-talk button. Auto-mode with configurable delay. Drag-to-reorder member list. Group scenario override.

### 5.3 Character Card Handling in Groups
- **Gap:** Basic per-character system prompts. No join mode.
- **ST Feature:** Swap mode (only active speaker's info) vs Join mode (all members' info combined).
- **Work:** Add character card handling strategy selector. Implement join mode with configurable prefix/suffix.

---

## Phase 6: UI/UX Polish & Theming
*Goal: Match ST's customization depth while staying mobile-first.*

### 6.1 Theme System
- **Gap:** Single hardcoded dark theme.
- **ST Feature:** Full color customization, multiple themes, import/export themes, custom CSS editor.
- **Work:** CSS variable-based theme system. Light/dark mode toggle. Theme presets. Color customization UI. Theme import/export.

### 6.2 Chat Display Styles
- **Gap:** Single message display style.
- **ST Feature:** Flat (log), Bubbles (messenger), Document (compact). Avatar shapes. Font scale. Chat width.
- **Work:** Add style selector (flat/bubbles/document). Configurable avatar shape. Font size slider. Chat width control.

### 6.3 Mobile-Specific UX
- **Gap:** Basic mobile layout exists but needs refinement.
- **ST Feature:** Responsive panels, gesture navigation, mobile-optimized controls.
- **Work:** Swipe gestures for sidebar toggle. Pull-to-refresh. Bottom sheet for actions. Haptic feedback. Better keyboard handling. Landscape mode support. PWA install prompt.

### 6.4 Visual Novel Mode
- **Gap:** Sprites show in a small area during chat.
- **ST Feature:** Full visual novel mode with central sprite display, backgrounds, multi-character layout.
- **Work:** VN mode toggle. Full-screen sprite display behind chat. Background image support. Multi-character sprite positioning in group chats. Sprite costume system (`/costume` command equivalent).

### 6.5 Message Formatting & Markdown
- **Gap:** Basic `*action*` and `{{thought}}` formatting.
- **ST Feature:** Full Markdown/HTML rendering, bold/italic/underline/strikethrough/code, quote blocks, inline images/embeds.
- **Work:** Add Markdown renderer (react-markdown or similar). Support bold, italic, underline, strikethrough, code blocks, blockquotes. Preserve existing action/thought formatting.

---

## Phase 7: Extensions Core
*Goal: Build the extension infrastructure and implement high-value extensions.*

### 7.1 Extension System Architecture
- **Gap:** No extension system.
- **ST Feature:** Modular extension loading, enable/disable, install from URL.
- **Work:** Design extension interface (hooks, slots, settings). Extension registry and loader. Extension settings UI. Enable/disable toggles.

### 7.2 TTS (Text-to-Speech)
- **Gap:** No TTS.
- **ST Feature:** 18+ TTS providers, per-character voice, auto-narrate.
- **Work:** Start with browser SpeechSynthesis API + Edge TTS + ElevenLabs. Per-character voice assignment. Play/stop controls on messages. Auto-narrate toggle.

### 7.3 Image Generation
- **Gap:** No image generation.
- **ST Feature:** 20+ backends, multiple generation modes (character portrait, scene, background).
- **Work:** Start with OpenAI DALL-E + Stable Diffusion API. Generate from message context. Display inline in chat. Save to gallery.

### 7.4 Chat Translation
- **Gap:** No translation.
- **ST Feature:** Translate messages to/from different languages.
- **Work:** Add translation via LLM or dedicated translation API. Per-message translate button. Auto-translate incoming/outgoing toggle.

### 7.5 Summarization
- **Gap:** No summarization.
- **ST Feature:** Auto-summarize chat history for context compression.
- **Work:** Periodic summary generation using active LLM. Summary injection at configurable depth. Manual trigger. Summary display in UI.

---

## Phase 8: Advanced Features
*Goal: Power-user features that complete the parity picture.*

### 8.1 Author's Note
- **Gap:** No Author's Note.
- **ST Feature:** Persistent instruction injected at configurable depth in context. Editable per-chat.
- **Work:** Author's Note input field. Configurable insertion depth and role. Persist per-chat. Quick-edit access.

### 8.2 Regex Scripts
- **Gap:** No regex processing.
- **ST Feature:** Find/replace regex on input/output, display-only or permanent, per-character scoping.
- **Work:** Regex script store. CRUD UI. Scope selection (user input, AI output, display-only, permanent). Ordering and enable/disable. Import/export.

### 8.3 Quick Replies
- **Gap:** No quick replies.
- **ST Feature:** Configurable single-click responses, automation triggers, STscript integration.
- **Work:** Quick reply preset system. Button bar above chat input. Support text macros in quick replies. Auto-execute triggers (on AI message, on chat load).

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

### 10.1 Local Model Support
- **Gap:** No local model support.
- **ST Feature:** KoboldCpp, llama.cpp, Ollama, Oobabooga, TabbyAPI.
- **Work:** Add OpenAI-compatible custom endpoint configuration (covers Ollama, LM Studio, llama.cpp server, KoboldCpp, etc.). URL + optional API key input. Model list auto-fetch where supported.

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
| 1. Chat Experience | Very High | Medium | **P0 - Do First** |
| 2. Character & Persona | High | Medium | **P0 - Do First** |
| 3. Prompt Engineering | High | Medium | **P1 - Essential** |
| 4. World Info | High | Large | **P1 - Essential** |
| 5. Group Chat | Medium | Medium | **P2 - Important** |
| 6. UI/UX Polish | High | Medium | **P1 - Essential** |
| 7. Extensions | Medium | Large | **P2 - Important** |
| 8. Advanced Features | Medium | Large | **P3 - Nice to Have** |
| 9. Prompt Manager | Medium | Medium | **P2 - Important** |
| 10. API Backends | Medium | Medium | **P2 - Important** |

---

## Recommended Execution Order

```
Phase 1 (Chat Experience) ──────────┐
Phase 2 (Characters & Personas) ────┤── Sprint 1-3: Core UX
Phase 6.5 (Markdown Rendering) ─────┘

Phase 3 (Prompt & Generation) ──────┐
Phase 6.1-6.2 (Themes & Styles) ────┤── Sprint 4-6: Customization
Phase 10.1 (Custom Endpoints) ──────┘

Phase 4 (World Info) ───────────────┐
Phase 5 (Group Chat) ───────────────┤── Sprint 7-9: Depth Features
Phase 8.1-8.2 (Author's Note, Regex)┘

Phase 7 (Extensions) ──────────────┐
Phase 8.3-8.6 (Quick Replies, RAG) ┤── Sprint 10-12: Extensions
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

- **Core Parity (Phases 1-4):** Users can have the same quality conversations with the same characters using the same context/lore. **Target: 100%**
- **Customization Parity (Phases 5-6):** Users can personalize their experience. **Target: 80%**
- **Extension Parity (Phase 7):** Most-used extensions work. **Target: 60%** (TTS, image gen, translation, summarization)
- **Power User Parity (Phases 8-10):** Advanced features available. **Target: 50%** (regex, quick replies, connection profiles, RAG)
- **Scripting Parity (STscript):** Basic command execution. **Target: 30%** (run scripts, not write them)
