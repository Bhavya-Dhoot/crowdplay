# Kickoff Prompt (paste into Claude Code with Opus 5.5, high effort)

## Before you paste
1. Create an empty folder, put every file from this pack in it (`CLAUDE.md` at the root, the rest under `docs/`).
2. Copy `env.example` to `.env` and fill in what you have. Best case: Nexconn App Key/Secret/API domains/area + Anthropic + OpenAI keys. The build works without them, but live verification needs them.
3. Start Claude Code in that folder with permissions that allow file edits, shell, package installs and local servers.

## Goal condition (use with the goal feature, or keep as the last paragraph of the prompt)

```
The goal is met only when `pnpm verify` exits 0 on a clean checkout in mock modes, every checkbox
in docs/GOAL.md sections A–F is implemented with test or documented evidence in docs/VERIFICATION.md,
docs/NEXCONN_FINDINGS.md answers U1–U10 (live if credentials exist in .env, otherwise marked
"needs creds" with exact commands), and README.md, docs/WRITEUP.md and docs/DEMO_SCRIPT.md match
the built product. Do not stop or ask for confirmation before then.
```

## Prompt

```
You are building CROWDPLAY, a complete, production-quality web app, in this repository, in one
continuous run.

Start by reading CLAUDE.md, then docs/GOAL.md, docs/PRD.md, docs/TECH_SPEC.md,
docs/NEXCONN_INTEGRATION.md, docs/AI_PROMPTS.md, docs/UX_SPEC.md, docs/BUILD_PLAN.md and
docs/SUBMISSION_KIT.md in full. They are the specification. docs/GOAL.md is the definition of done.

Then execute docs/BUILD_PLAN.md phase by phase, without pausing for approval:
- Keep docs/PROGRESS.md current and commit after every phase.
- Install the official Nexconn skill
  (npx skills add https://github.com/NexconnAI-Dev/nexconn-skills.git --skill nexconn-chat),
  read https://docs.nexconn.ai/llms.txt and the installed SDK type definitions before writing the
  Nexconn adapters. Never guess SDK APIs; the installed SDK is the truth.
- If .env has Nexconn / Anthropic / OpenAI credentials, use them for live smoke tests and one full
  live show; otherwise build and verify in mock modes and list the exact human steps left.
- Write tests first for the round engine, LLM output validators, ingestion and dedupe.
- Treat UX polish as half the product: every state in docs/UX_SPEC.md must exist and look finished.
- Never fabricate users, traction or verification output. Label bots.

When you believe you are done, run `pnpm verify`, re-read docs/GOAL.md line by line, fix every gap,
and only then give a final report: what was built, how to run and deploy it, what was verified
live vs. mock, the findings on Nexconn questions U1–U10, and any human-only steps.

Goal condition: the goal is met only when `pnpm verify` exits 0 on a clean checkout in mock modes,
every checkbox in docs/GOAL.md sections A–F is implemented with test or documented evidence in
docs/VERIFICATION.md, docs/NEXCONN_FINDINGS.md answers U1–U10 (live if credentials exist,
otherwise marked "needs creds" with exact commands), and README.md, docs/WRITEUP.md and
docs/DEMO_SCRIPT.md match the built product. Do not stop or ask for confirmation before then.
```

## After the run (human steps)
1. Read `docs/NEXCONN_FINDINGS.md` and `docs/VERIFICATION.md`.
2. Deploy (README has Railway/Fly steps), set the webhook URL in the Nexconn console.
3. Run one real show with 3–5 friends on phones. Fix anything odd with a follow-up prompt: "Here is what happened in a live session: … Fix it, add a regression test, re-run pnpm verify."
4. Follow `SUBMISSION_KIT.md`.
