// Times the real distill + narration chain against the configured live providers (needs keys in .env).
//   pnpm exec tsx scripts/ai-bench.ts [model ...]   (each model is tried as OPENAI_FAST_MODEL; OPENAI_REASONING_EFFORT applies)
import { cannedIdeas } from "../src/lib/bots/canned";
import { PRESETS } from "../src/lib/presets";

async function main() {
  process.env.LLM_MODE = "live";
  const models = process.argv.slice(2);
  const { resetConfig } = await import("../src/lib/config");
  const { distillRound } = await import("../src/lib/ai/distill");
  const { narrateOutcome } = await import("../src/lib/ai/narrate");
  const ideas = cannedIdeas("heist").slice(0, 200).map((text, i) => ({ id: `i${i}`, userId: `u${i % 60}`, text, createdAt: 1000 + i * 50 }));
  const story = { premise: PRESETS.heist.premise, preset: "heist" as const, summary: "", lastNarrations: [], roundNo: 1, roundsTotal: 3, lang: "en" };
  for (const model of models.length ? models : [process.env.OPENAI_FAST_MODEL ?? ""]) {
    if (model) process.env.OPENAI_FAST_MODEL = model;
    resetConfig();
    for (let run = 1; run <= 3; run++) {
      const d = await distillRound({ roomId: `bench-${model}-${run}`, roundNo: 1, story, prompt: PRESETS.heist.round1, narratorOptions: PRESETS.heist.round1.narratorOptions, ideas });
      const n = await narrateOutcome({ story, prompt: PRESETS.heist.round1, winnerLabel: d.options[0].label, sourceIdeas: ideas.slice(0, 5).map((i) => i.text), isFinalRound: false });
      console.log(
        `${model.padEnd(14)} effort ${process.env.OPENAI_REASONING_EFFORT || "(unset)"} run ${run} | distill ${d.ms} ms ${d.provider}${d.fallbackUsed ? " (fallback)" : ""} backups ${d.backups.length} | ` +
          `narrate ${n.ms} ms ${n.provider}${n.fallbackUsed ? " (fallback)" : ""}`,
      );
      if (run === 1) console.log(`   options: ${d.options.map((o) => `[${o.kind}] ${o.label}`).join(" | ")}\n   narration: ${n.narration.slice(0, 160)}…`);
    }
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
