// MochiMind — Validator AI powered by GenLayer Studio on-chain AI.
// Contract: 0x072a5f7B8D4ea7A4F876ebf89777B3dA0E64a5Ac (GenLayer Studio)
// Spender wallet covers gas so players never need a wallet.
// Falls back to local 3-validator consensus ONLY if Studio is unreachable.

import type { Address } from "viem";
import type { Stage } from "./stages";

export const VALIDATOR_CONTRACT_ADDRESS: Address =
  (import.meta.env.VITE_STUDIO_CONTRACT as Address | undefined) ??
  "0x072a5f7B8D4ea7A4F876ebf89777B3dA0E64a5Ac";

const SPENDER_PK = import.meta.env.VITE_SPENDER_PRIVATE_KEY as
  | `0x${string}`
  | undefined;

export type ValidatorPick = {
  picks: [string, string];
  scores: Record<string, number>;
  source: "onchain" | "local-consensus";
  reasoning?: string;
  validators?: Array<{ name: string; colors: string[]; confidence: number }>;
};

// ─── Local Consensus Fallback ─────────────────────────────────────────────────

function runSimulatedValidator(
  name: string,
  colors: string[],
  baseScores: Record<string, number>,
  strategy: "visual" | "perceived" | "identity",
): { name: string; colors: string[]; confidence: number } {
  const scored: Record<string, number> = {};
  for (const c of colors) {
    const base = baseScores[c] ?? 10;
    let score = base;
    if (strategy === "visual") {
      score = base * 1.1 + (Math.random() - 0.5) * base * 0.18;
    } else if (strategy === "perceived") {
      score = Math.pow(base, 1.15) + (Math.random() - 0.5) * base * 0.22;
    } else {
      score = base + (Math.random() - 0.5) * base * 0.35;
    }
    scored[c] = Math.max(1, score);
  }
  const ranked = Object.entries(scored)
    .sort(([, a], [, b]) => b - a)
    .map(([c]) => c);
  const vals = Object.values(scored).sort((a, b) => b - a);
  const gap = vals.length >= 3 ? ((vals[1] - vals[2]) / vals[1]) * 100 : 75;
  return { name, colors: ranked.slice(0, 2), confidence: Math.min(99, Math.max(40, Math.round(gap))) };
}

export function validatorAnalyzeLocal(stage: Stage): ValidatorPick {
  const colors = stage.options.map((o) => o.name);
  const baseScores: Record<string, number> = {};
  for (const opt of stage.options) {
    baseScores[opt.name] = Math.round(stage.weights[opt.name] ?? 10);
  }
  const vision = runSimulatedValidator("Vision Validator", colors, baseScores, "visual");
  const perception = runSimulatedValidator("Perception Validator", colors, baseScores, "perceived");
  const identity = runSimulatedValidator("Identity Validator", colors, baseScores, "identity");
  const scoreMap: Record<string, number> = {};
  for (const v of [vision, perception, identity]) {
    for (const c of v.colors) scoreMap[c] = (scoreMap[c] ?? 0) + v.confidence;
  }
  const ranked = Object.entries(scoreMap).sort(([, a], [, b]) => b - a).map(([c]) => c);
  return {
    picks: [ranked[0], ranked[1]],
    scores: baseScores,
    source: "local-consensus",
    reasoning: "Local AI consensus via 3 simulated validators (Vision, Perception, Identity).",
    validators: [vision, perception, identity],
  };
}

// ─── GenLayer Studio On-Chain Validation ────────────────────────────────────

/** Build a genlayer-js client connected to GenLayer Studio. */
async function buildClient() {
  const [{ createClient }, { studionet }] = await Promise.all([
    import("genlayer-js"),
    import("genlayer-js/chains"),
  ]);

  if (SPENDER_PK) {
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(SPENDER_PK);
    return createClient({ chain: studionet, account });
  }
  // No private key — try read-only (may fail for AI contracts that require gas)
  return createClient({ chain: studionet });
}

/** Extract color picks from whatever readContract returns (Map, object, or array). */
function extractResult(result: unknown): { colors: string[]; reasoning?: string } {
  if (!result) throw new Error("Contract returned null/undefined");

  if (result instanceof Map) {
    const colors =
      (result.get("final_colors") as string[] | undefined) ??
      (result.get("colors") as string[] | undefined) ??
      [];
    const reasoning =
      (result.get("consensus_reasoning") as string | undefined) ??
      (result.get("reasoning") as string | undefined);
    return { colors, reasoning };
  }

  if (Array.isArray(result)) {
    // Some contracts return [[color1, color2], reasoning]
    if (Array.isArray(result[0])) return { colors: result[0] as string[] };
    if (typeof result[0] === "string") return { colors: result as string[] };
  }

  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    const colors =
      (r["final_colors"] as string[] | undefined) ??
      (r["colors"] as string[] | undefined) ??
      [];
    const reasoning =
      (r["consensus_reasoning"] as string | undefined) ??
      (r["reasoning"] as string | undefined);
    return { colors, reasoning };
  }

  throw new Error(`Unexpected contract result type: ${typeof result}`);
}

async function validatorAnalyzeOnChain(stage: Stage): Promise<ValidatorPick> {
  const candidate_colors = stage.options.map((o) => o.name);
  const dominance_scores: Record<string, number> = {};
  for (const opt of stage.options) {
    dominance_scores[opt.name] = Math.round(stage.weights[opt.name] ?? 10);
  }
  const zone_weights: Record<string, Record<string, number>> = {};

  const client = await buildClient();

  // readContract — genlayer-js handles ABI encoding/decoding automatically
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawResult = await (client as any).readContract({
    address: VALIDATOR_CONTRACT_ADDRESS,
    functionName: "select_dominant_colors",
    args: [candidate_colors, dominance_scores, zone_weights],
    stateStatus: "accepted",
  });

  const { colors, reasoning } = extractResult(rawResult);

  if (!Array.isArray(colors) || colors.length < 2) {
    throw new Error(
      `Contract returned fewer than 2 colors. Got: ${JSON.stringify(colors)}`,
    );
  }

  return {
    picks: [colors[0], colors[1]],
    scores: dominance_scores,
    source: "onchain",
    reasoning,
  };
}

function shortError(err: unknown): string {
  if (!err) return "unknown";
  const e = err as Record<string, unknown>;
  const m = e["shortMessage"] ?? e["details"] ?? e["message"] ?? e["cause"];
  if (typeof m === "string" && m) return m.replace(/\s+/g, " ").substring(0, 200);
  try { return JSON.stringify(err).substring(0, 200); } catch { return String(err).substring(0, 200); }
}

export async function validatorAnalyze(stage: Stage): Promise<ValidatorPick> {
  try {
    const result = await validatorAnalyzeOnChain(stage);
    console.info(
      `[MochiMind] GenLayer Studio ✓  stage=${stage.id}  picks=${result.picks.join(",")}`,
    );
    return result;
  } catch (err) {
    console.warn(
      `[MochiMind] Studio unavailable (stage ${stage.id}) → ${shortError(err)} — running local consensus`,
    );
    return validatorAnalyzeLocal(stage);
  }
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

export type RoundResult =
  | "perfect-match"
  | "player-wins"
  | "validator-wins"
  | "shared-misread";

export function isExactMatch(picks: string[], correct: [string, string]): boolean {
  if (picks.length !== 2) return false;
  const a = new Set(picks);
  return a.has(correct[0]) && a.has(correct[1]);
}

export function scoreRound(
  playerPicks: string[],
  validatorPicks: [string, string],
  correct: [string, string],
): { player: 0 | 1; validator: 0 | 1; result: RoundResult } {
  const p = isExactMatch(playerPicks, correct) ? 1 : 0;
  const v = isExactMatch(validatorPicks, correct) ? 1 : 0;
  let result: RoundResult;
  if (p && v) result = "perfect-match";
  else if (p && !v) result = "player-wins";
  else if (!p && v) result = "validator-wins";
  else result = "shared-misread";
  return { player: p as 0 | 1, validator: v as 0 | 1, result };
}

export function endgameTitle(
  playerScore: number,
  validatorScore: number,
  total: number,
): string {
  const ratio = playerScore / total;
  if (playerScore >= validatorScore && ratio >= 0.9) return "True Color Master";
  if (playerScore > validatorScore) return "Validator Rival";
  if (playerScore === validatorScore) return "Mochi Reader";
  if (ratio >= 0.5) return "Blur Breaker";
  return "Apprentice of Mochi";
}
