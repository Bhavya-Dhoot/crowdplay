# CROWDPLAY — AI Design and Prompts

All model ids come from env (see `env.example`). Every call has a timeout, a zod-validated JSON output, one repair retry only if time remains, and a non-LLM fallback. Use the providers' structured-output / tool-use JSON features; never parse free text.

## 1. Model roles

| Role | Env | Default | Timeout | Fallback |
|---|---|---|---|---|
| Embeddings | `OPENAI_EMBED_MODEL` | `text-embedding-3-small` | 2.5 s | skip clustering → LLM-only on sample |
| Distiller | `ANTHROPIC_FAST_MODEL` | `claude-haiku-5-5` | 5 s | `OPENAI_FAST_MODEL` (3 s) → heuristics |
| Narrator / prompts / finale | `ANTHROPIC_SMART_MODEL` | `claude-sonnet-5-5` | 6 s | fast model → template |
| Bot ideas (demo) | fast model | — | 6 s | canned pool |
| TTS (optional) | `OPENAI_TTS_MODEL` | set after checking current OpenAI docs | 6 s | no audio |
| Translation (flag) | fast model | — | 3 s | show original |

`providers.ts` exposes `callJSON<T>({role, system, user, schema, timeoutMs})` and records provider, ms, tokens, and whether a fallback fired.

Verify the model ids against the providers' current model lists at build time; they are env-configurable so nothing else changes.

## 2. Distiller

**System**
```
You are the ballot writer for a live audience game. Hundreds of people just typed ideas for what
happens next in a shared story. You receive their ideas already grouped into clusters.
Write exactly three ballot options the whole room can vote on.

Rules
1. Options 1 and 2 are CROWD options: each must come from one of the largest clusters and capture
   what many people asked for.
2. Option 3 is the WILDCARD: it must come from a SMALL cluster (the wild list). Pick the one idea
   that is the most surprising, vivid, and fun while still fitting the scene. Reward originality,
   not randomness. Never pick something that merely repeats a crowd option.
3. Each label: at most 70 characters, plain language, present tense, a complete concrete event
   ("The vault is empty except for a ringing phone"). No emojis, no names of participants,
   no meta-commentary, no questions.
4. The three options must lead the story in clearly different directions.
5. Stay faithful to what people wrote. Polish wording; do not invent a new idea.
6. Safety: skip any cluster that is hateful, sexual, harassing, about real private people,
   self-harm, or graphic gore. Mild cartoon peril and absurd humour are fine.
   List every cluster id you skipped for safety in "unsafeClusterIds".
7. If "preferredWildClusterId" is given and it is safe and fits, use it for the wildcard.
8. Also return up to three backup options (same rules) in case the host vetoes one.
Return only the JSON object required by the schema.
```

**User (template)**
```
STORY SO FAR: {{storySummary}}
THIS SCENE: {{promptTitle}} — {{promptText}}
TOTAL IDEAS: {{n}}   LANGUAGE FOR LABELS: {{lang}}

CROWD CLUSTERS (largest first)
{{#each crowd}}[c{{id}}] size={{size}} share={{pct}}%
  - {{sample1}}
  - {{sample2}} …(up to 5){{/each}}

WILD CLUSTERS (small groups)
{{#each wild}}[c{{id}}] size={{size}} — {{sample}}{{/each}}

{{#if preferred}}preferredWildClusterId: c{{preferred}}{{/if}}
```

**Schema (zod)**
```ts
const Option = z.object({
  label: z.string().min(8).max(70),
  kind: z.enum(['crowd', 'wildcard']),
  sourceClusterIds: z.array(z.number().int()).min(1).max(3),
});
export const DistillOut = z.object({
  options: z.tuple([Option, Option, Option]),
  backups: z.array(Option).max(3),
  unsafeClusterIds: z.array(z.number().int()),
});
```

**Server-side validation after parsing (reject → repair once → heuristic)**
- options[0], [1] `crowd`; options[2] `wildcard`.
- Every `sourceClusterIds` id exists; wildcard cluster share ≤15% (or it is the smallest available).
- No cluster used by two options. Labels pairwise distinct (normalised Levenshtein ratio < 0.8).
- Labels pass `filter.ts` again.
- Ideas in `unsafeClusterIds` are marked `blocked` (never credited, never shown again).

**Edge cases handled in code, not by the model:** 0 ideas → narrator options (§4); 1–2 usable clusters → fill missing slots from narrator options with `kind:'narrator'`.

## 3. Narrator (outcome)

**System**
```
You are the narrator of a live, crowd-written story. Warm, quick, cinematic, a little mischievous.
Write what happens next given the winning choice.
- 45 to 90 words. Present tense. Read-aloud friendly. End on a small hook, not a question to the audience.
- Stay consistent with the story so far. Make the winning idea feel like it mattered.
- Do not mention votes, percentages, AI, or the game. Do not name participants (credits are shown separately).
- Family-friendly: no gore, slurs, sexual content.
Also return a one-line beat (max 90 chars) summarising this round, and an updated running summary
(max 1200 chars) of the whole story.
```
**User:** premise, running summary, last two narrations, scene title/text, winning label, the 5 best source ideas verbatim (for flavour), round n of N (if final round: "bring the story to a satisfying close").
**Schema:** `{ narration: string(≤700), beat: string(≤90), summary: string(≤1200) }`
**Fallback template:** `"{{winnerLabel}}. And just like that, everything changes — the story turns a corner no one saw coming."`

## 4. Scene prompt generator (per round) and narrator options

**System**
```
You set up the next scene of a live, crowd-written story and ask the audience what happens next.
Return: title (max 40 chars), text (max 220 chars, 1–2 vivid sentences ending at a moment of decision),
and three "narratorOptions" (max 70 chars each, clearly different) used only if the crowd is silent.
Keep it open-ended so hundreds of different ideas fit. Family-friendly.
```
**User:** premise, preset tone, running summary, last beat, round n of N.
**Schema:** `{ title, text, narratorOptions: [string, string, string] }`
Round 1 prompt comes from the preset file (hand-written, instant) — no LLM latency at show start.

## 5. Finale

Input: premise + all beats + all winning labels. Output `{ storyTitle (≤50), recap (120–180 words), tagline (≤80) }`. Fallback: join beats.

## 6. Bot idea generator (demo rooms only)

Output 60 ideas ≤100 chars for the scene with this mix: ~45% converge on two obvious directions, ~35% varied, ~20% odd/funny. Include typos and casual tone. Mock mode uses `bots/canned.ts` (≥200 lines per preset).

## 7. Safety layers (order)

1. `filter.ts` at ingestion: blocklist (multi-language starter list in repo), URL/phone/email patterns, repeated-char spam, strict-mode extras. Sync the list to Nexconn's profanity words API at boot (best-effort).
2. Distiller `unsafeClusterIds` + rule 6.
3. Post-validation re-filter of labels and narration.
4. Host veto / delete / ban.
Display names pass layer 1 too.

## 8. Clustering details (`cluster.ts`)

- Normalise text (lowercase, strip emojis/punctuation, collapse spaces) for embedding input; keep original for display.
- Greedy: sort by arrival; assign to the nearest centroid if cosine ≥ 0.62 else new cluster; recompute centroid as running mean; one merge pass (centroid cosine ≥ 0.72).
- Representative ideas = top-5 nearest to centroid, deduped by normalised text.
- Unit-test with fixtures: 200 ideas with 3 planted themes + 20 singletons → themes recovered, singletons stay small.

## 9. Multilingual (flag)

- Player picks language at join (default from `navigator.language`).
- Distiller writes labels in the show language; a single batched fast-model call translates `{prompt, options, narration}` into the other active languages (max 6) and state carries `i18n: {lang: {...}}`. Ideas are shown original with a small translated line on tap (use Nexconn translation if finding U10 is positive, else LLM).

## 10. Mock mode (`LLM_MODE=mock`)

Deterministic implementations with the same schemas: embeddings = hashed bag-of-words vectors; distiller = heuristic labels; narrator = template; prompts = preset list. All tests run in mock mode with no network.

## 11. Latency budget (STORM end → options visible)

| Step | Budget |
|---|---|
| Flush last embedding batch | 0.8 s |
| Cluster + build candidates | 0.2 s |
| Distiller LLM | 3.5 s typical, 5 s cap |
| Validate + save + publish | 0.5 s |
| **Total** | **≈5 s typical, 8 s p95, 10 s hard cap → heuristic** |
