# v3 page restyle: shared brief (read with plans/design-v3.md and plans/ui-kit.md)

You restyle ONE surface of CROWDPLAY to design v3 "Live Sketchnote". The design system (tokens, fonts, primitives,
landing) is already done; build on it, do not fork it.

## Read first
1. plans/agent-rules.md (house rules).
2. plans/design-v3.md (the spec; §1 the yellow-thread rule and the "drawn for you" reward moments, §2 tokens, §4 your
   surface). It wins over anything older (plans/design-v2.md is dead).
3. plans/ui-kit.md (v3 primitive APIs). Use the primitives; if one is missing something, compose it locally in your files and
   say so in your report (do not edit src/components/ui).
4. The style source for look and feel: H:\ClaudeData\dot-claude\plugins\cache\brag-scaled\brag-scaled\0.10.2-scaled\skills\
   brag-styles\opuscar\styles\sketchnote\STYLE.md and poster.jpg in that folder (Read the image).
5. If a Skill tool is available, load `design-taste-frontend` and `motion-stack`; else Read
   H:\ClaudeData\dot-claude\skills\motion-stack\SKILL.md. Run their pre-flight checks before you report.
6. Your surface's current files, its unit tests, and the e2e specs that touch it (src/tests/e2e/*.spec.ts; grep for your
   data-testids) so you know what must keep working.

## Rules
- Edit only the files your prompt gives you. Frozen: src/lib/** contracts, PublicState, API routes, src/components/ui/**,
  tokens/globals/layout. If you need a change there, describe it in your report instead.
- Keep every data-testid, every aria role/label the e2e specs use, every route, and current behaviour. Visual and copy
  changes only, unless your prompt lists a behaviour fix.
- Move OFF the v2 alias utilities (the "v2 aliases" block in src/styles/tokens.css: stage-*, on-stage, gold, gel-*, etc.)
  onto the v3 names, so the alias block can be deleted at the end. grep your files for every alias name before you report;
  none may remain.
- Dead code: delete what your restyle orphans in your files (v2-only components, helpers, CSS classes, props, copy strings,
  stage-light/gel logic). Then run `node scripts/find-dead-exports.mjs` and fix every line that points into your files
  (delete unused exports; for "used inside its file only" drop the `export` keyword). Do not delete tests that still test
  live behaviour; update tests whose pinned values you changed on purpose.
- Yellow budget per view: the thread (your idea / your vote / the winner / canon), numbered banners, fat arrows, and the ONE
  primary button. Nothing else is yellow. No other colours except `--danger` for errors and destructive actions.
- Reward moments per design-v3 §1 must be drawn (SVG draw-on, marker swipe), never faded in. Reduced motion: complete, static.
- Hydration: anything seeded (tilt, wobble paths) must come from a stable key (id, slot, index), never Math.random in render.
- Accessibility: AA contrast on paper (ink-notes is the floor for text), focus ring visible, touch targets >= 44 px,
  no horizontal overflow at 360 px wide, no layout shift from typing text (ScriptText overlay).

## Checks before you report
- `pnpm typecheck` clean for the whole repo (other agents are editing in parallel; errors only in their files are theirs:
  note them, do not fix them).
- `pnpm exec eslint <your paths>` clean; `pnpm exec vitest run <your unit/integration tests>` green.
- Visual: the dev server at http://localhost:3000 runs in mock modes. Do NOT start/stop servers, run `pnpm build`, or run the
  e2e suite. Drive real rooms through the HTTP API (see src/app/api and src/lib/client/api.ts; the e2e specs show how) with
  throwaway Playwright scripts kept in H:\ClaudeData\Temp-claude\v3-<surface>\. Screenshot every phase of your surface at
  the sizes your prompt lists, Read the screenshots, and fix what looks wrong or cheap. The dev server may briefly 500 while
  another agent is mid-edit; wait and retry.
- Do not spawn subagents. Do not commit.

## Report (max 40 lines)
Files changed; what each view looks like now (one line each); the reward moments you built; dead code removed; alias
names remaining (must be none); behaviour changes (should be none unless asked); anything you needed outside your files;
checks run with their exact result lines; screenshot folder.
