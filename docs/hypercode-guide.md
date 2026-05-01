# HYPERCODE Guide

A plain-language tour of the **HYPERCODE** prompt framework — what it is, when to pick which tier, and what the six dials actually do. HYPERCODE is the storytelling "rulebook" the AI reads before every reply, so picking the right one matters.

> HYPERCODE v1.0 by Hyperion · CC BY-NC-SA 4.0 · [github.com/hype-hosting/HYPERCODE](https://github.com/hype-hosting/HYPERCODE)

## What HYPERCODE Is

It's a **system prompt** — a block of instructions sent before every message that tells the AI *how* to write (be a narrator, never break character, write prose not chat). HYPERCODE is one specific framework designed for narrative roleplay. There are others; this one is built into the app.

You build a HYPERCODE prompt in **Settings → Prompt Templates → HYPERCODE Builder**, then link it to a character so it auto-loads when that character is chosen.

The Setup Wizard on a character also builds one for you automatically when the character is narrative-oriented (Roleplay or Creative Writing). You can ignore it after that, or open the builder later to tweak.

## When to Use It (and When Not To)

HYPERCODE is a **narrator** framework. It assumes the AI is voicing a world full of characters, with you driving your own character.

- ✅ **Roleplay** — back-and-forth scenes, dialogue, immersion.
- ✅ **Creative writing** — co-authoring fiction, prose-heavy storytelling.
- ❌ **Assistant** — task-focused chats (coding, planning). Use a normal system prompt.
- ❌ **Companion / casual chat** — friendly conversation. The narrator framing feels stiff. The wizard skips HYPERCODE for these on purpose.

## The Three Tiers

The tier picks how much instruction the AI gets every message. **Higher tier = more structure, more tokens, every single message, forever.**

### Core (~140 tokens)

The minimum. Tells the AI: *be a narrator, don't speak for the user, follow the lore, don't break character.* That's it.

- *When to use it:* short replies, simple scenes, you don't want to spend tokens on framework — you'd rather spend them on the character itself.
- *Tradeoff:* the AI improvises more. Less consistent across long chats.

### Essentials (~290 tokens)

Adds structure — section headers for Voice, Dialogue, Worldbuilding, Mature Content, Rules. Most users land here.

- *When to use it:* default for balanced replies. Solid framework without bloat.

### Premium (~520 tokens)

The full literary framework — Core Identity, Creative Philosophy, Structural Guidelines, Integration Priority, Immersion Safeguards. Eight sections of detailed direction.

- *When to use it:* long-form prose, deep scenes, you want the AI to maintain literary consistency across many turns.
- *Tradeoff:* you pay ~520 tokens *every message* before the AI even reads your character. On a 4k-context model that's a real bite.

> **Rule of thumb:** if your replies are short or your model context is tight, drop a tier. The framework only matters if it's actually shaping output.

## The Six Dials

These shape *how* the AI writes within whichever tier you picked.

### Perspective

Whose head are we in?
- **Third-person limited** *(default)* — "She walked in. Something was wrong." Most flexible, easiest to read.
- **Second-person** — "You walk in. Something is wrong." Direct, immersive, addresses your character as "you."
- **First-person (NPC)** — the main NPC narrates. "I watched her come in." Rare; great for one-on-one diary-style scenes.

### Tense

- **Past** *(default)* — feels novel-like.
- **Present** — feels immediate, urgent. Good for action-heavy scenes.

### Response Length

- **Standard (4–7 ¶)** *(default)* — balanced novel-paragraph rhythm.
- **Compact (2–4 ¶)** — tight, punchy. Best for fast back-and-forth dialogue.
- **Long-form (6–10 ¶)** — heavy prose. Best for atmospheric scenes; expensive on tokens.
- **Adaptive** — short for quick exchanges, long for big moments. Closest to a real novel's rhythm.

> The First Message on the character also teaches length. Both signals stack — if your First Message is 6 paragraphs and you set Compact here, the AI will fight itself. Make them agree.

### Prose Tone

- **Cinematic** *(default)* — light, motion, atmosphere. "Show me the scene."
- **Literary** — measured, thematic, figurative. Slower, richer.
- **Pulp** — vivid, fast, dramatic. Genre fiction energy.
- **Minimalist** — spare, precise. Implication carries weight. Great with Compact length.
- **Gothic** — dense, shadowy, decay, psychological tension.

### Dialogue Style

- **Standard** *(default)* — quotation marks, clean attribution, gestures for subtext.
- **Minimal attribution** — quotes, but only attribute when ambiguous. Lets dialogue breathe.
- **Prose-embedded** — dialogue woven into narration. Best for literary tone.

### Mature Content

- **Unflinching** *(default)* — the AI portrays the full range of experience without softening.
- **Moderate** — restraint. Implies rather than depicts.
- **Fade to black** — explicit moments cut to the next narrative beat.

The dials don't change *what* the AI is willing to do — your model and the rest of your setup do that. They change *how* it handles the moments that come up.

## Saving and Linking

Once you've picked a tier and dials, give it a name and **Save as Template**. The builder auto-suggests one based on your settings (e.g. *"HYPERCODE Essentials · Literary, Compact"*).

To use it on a character: open the character editor → Linked Prompt Template → pick your saved one. From now on, picking that character auto-applies the template.

You can have many templates and swap between them. Common pattern: one Core for casual chats, one Premium for big scenes.

## Token-Saving Moves

- **Don't default to Premium.** It's the prettiest option, but ~520 tokens *per message* adds up. Try Essentials first; only step up if you can feel the difference.
- **Match length to tier.** Compact length on a Premium framework is wasteful — the framework is begging for long, varied prose. Compact + Core or Essentials is cleaner.
- **One template, many characters.** A single Essentials-Cinematic template can serve a dozen characters. You don't need a custom one each time.
- **Watch the token estimate.** The character editor shows the linked template's token count. If you've linked a 500-token template to a character with 200 tokens of description, the framework is doing more than the character is. Worth questioning.

## What HYPERCODE Won't Do

HYPERCODE is the **narrator's** rulebook. It does **not**:
- replace the character card (Description, Personality, Scenario, etc. — those are still where the character lives);
- enforce plot or memory (use lorebooks, depth prompt, sampler settings);
- tune randomness or repetition (that's the sampler preset).

Think of it as the *voice* layer. The character card is *who*. The lorebook is *what they know*. The sampler is *how wild they get*. HYPERCODE is *how the story is told*.

## A Quick Recipe

If you just want a sane starting point and want to move on:

1. **Tier:** Essentials.
2. **Perspective:** Third-person limited.
3. **Tense:** Past.
4. **Length:** Standard.
5. **Tone:** Cinematic.
6. **Dialogue:** Standard.
7. **Mature:** Unflinching.
8. Save as `HYPERCODE Essentials`.
9. Link it to your narrative characters. Done.

That's roughly 290 tokens of framework, sane defaults, easy to adjust later. Most chats never need more.
