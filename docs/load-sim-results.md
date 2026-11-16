### Load simulation (F5) - 2026-11-16T21:27:53.872Z

Command: `pnpm load:sim`
Mode: in-process (ingestIdea called directly; REALTIME_MODE=mock, LLM_MODE=mock; PGlite)
Host: Node v22.17.1, win32 x64, 11th Gen Intel(R) Core(TM) i9-11950H @ 2.60GHz x16; wall time 205 s
Load: 300 senders x 5 ideas per round, sends spread uniformly over 30000 ms (storm 31000 ms), >= 2250 ms between a sender's ideas, one IP per sender, 5 rounds of one show (autoAdvance on, vote 3000 ms). Ideas: synthetic, not real users (heist preset canned pool, 45% two obvious directions / 35% varied / 20% odd, repeated across senders with casual tails, plus a 20% long tail of one-off sentences).
Measured: distill = from the STORM phase's deadline to the first poll (every 15 ms) that finds the round's ballot options saved, so it includes the 250 ms ticker and the DISTILL_DONE hand-off; 'Distill effect' is the engine's own rounds.distill_ms (effect start to saved).

| Round | Attempted | Accepted | Rejected | Dropped | Ideas stored | Ingest ms p50 / p95 / max | Distill ms (STORM end -> options saved) | Distill effect ms | Provider | Fallback |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1500 | 1500 | 0 | 0 | 1500 | 12 / 25 / 100 | 1161 | 409 | mock | no |
| 2 | 1500 | 1500 | 0 | 0 | 1500 | 12 / 21 / 75 | 839 | 306 | mock | no |
| 3 | 1500 | 1500 | 0 | 0 | 1500 | 10 / 14 / 26 | 927 | 270 | mock | no |
| 4 | 1500 | 1500 | 0 | 0 | 1500 | 10 / 18 / 60 | 802 | 237 | mock | no |
| 5 | 1500 | 1500 | 0 | 0 | 1500 | 13 / 24 / 48 | 957 | 244 | mock | no |

Ideas attempted 7500 / accepted 7500 / rejected 0 (none) / dropped 0
Ingest latency over all attempts: p50 11 ms, p95 21 ms, max 100 ms
Distill ms per round: 1161, 839, 927, 802, 957
**Distill p50 927 ms, p95 1161 ms** (nearest rank over 5 rounds), budget p95 <= 8000 ms: PASS
Reconciliation: stored idea rows = accepted + filter-blocked rows, every round; finale reached with recap: yes
Result: PASS

Other mode: `pnpm load:sim --http http://localhost:3000` drives the same senders through a running server's HTTP API (start it with REALTIME_MODE=mock LLM_MODE=mock first; see the header of scripts/load-sim.ts).

Caveat: in-process PGlite shares one thread with the senders and the distiller, so this is a pessimistic stand-in for a server with a separate Postgres; mock mode has no LLM/embedding latency (the live budget is in AI_PROMPTS §11).
