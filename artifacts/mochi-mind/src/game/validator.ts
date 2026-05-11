// Validator AI logic — calls the GenLayer Intelligent Contract on Bradbury testnet.
// Contract: 0x5647DB24B53fB34e4d9EF5Cd69CcD951e40C54D0 (v0.2.16)

import { abi } from "genlayer-js";
import { toHex, toRlp, fromHex } from "viem";
import type { Address } from "viem";

import type { Stage } from "./stages";

export const VALIDATOR_CONTRACT_ADDRESS: Address =
  "0x5647DB24B53fB34e4d9EF5Cd69CcD951e40C54D0";

const BRADBURY_RPC = "https://rpc-bradbury.genlayer.com";
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

export type ValidatorPick = {
  picks: [string, string];
  scores: Record<string, number>;
  source: "onchain" | "local-consensus";
  reasoning?: string;
  validators?: Array<{ name: string; colors: string[]; confidence: number }>;
};

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
  const confidence = Math.min(99, Math.max(40, Math.round(gap)));

  return { name, colors: ranked.slice(0, 2), confidence };
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
    for (const c of v.colors) {
      scoreMap[c] = (scoreMap[c] ?? 0) + v.confidence;
    }
  }
  const ranked = Object.entries(scoreMap)
    .sort(([, a], [, b]) => b - a)
    .map(([c]) => c);

  return {
    picks: [ranked[0], ranked[1]],
    scores: baseScores,
    source: "local-consensus",
    reasoning: "Local AI consensus via 3 simulated validators (Vision, Perception, Identity).",
    validators: [vision, perception, identity],
  };
}

async function validatorAnalyzeOnChain(stage: Stage): Promise<ValidatorPick> {
  const candidate_colors = stage.options.map((o) => o.name);
  const dominance_scores: Record<string, number> = {};
  for (const opt of stage.options) {
    dominance_scores[opt.name] = Math.round(stage.weights[opt.name] ?? 10);
  }
  const zone_weights: Record<string, Record<string, number>> = {};

  const { encode, decode, makeCalldataObject } = abi.calldata;
  const calldataObj = makeCalldataObject(
    "select_dominant_colors",
    [candidate_colors, dominance_scores, zone_weights],
    {},
  );
  const encodedBytes: Uint8Array = encode(calldataObj);
  const serialized: `0x${string}` = toRlp([toHex(encodedBytes), toHex(false)]);

  const response = await fetch(BRADBURY_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "gen_call",
      params: [
        {
          type: "read",
          to: VALIDATOR_CONTRACT_ADDRESS,
          from: NULL_ADDRESS,
          data: serialized,
          transaction_hash_variant: "latest-nonfinal",
        },
      ],
      id: Date.now(),
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    throw new Error(`Bradbury HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as {
    result?: string | { data: string; status?: { code: number; message?: string } };
    error?: { code: number; message: string };
  };

  if (json.error) {
    const msg = json.error.message
      .replace(/ReturnData:\[\]uint8\{[^}]*\}/g, "ReturnData:[...]")
      .replace(/GenVMLog:\[\].*$/gs, "")
      .replace(/StorageProof:\[32\]uint8\{[^}]*\}/g, "")
      .substring(0, 250);
    throw new Error(`gen_call error ${json.error.code}: ${msg}`);
  }

  if (!json.result) {
    throw new Error("gen_call returned null result");
  }

  let hexData: string;
  if (typeof json.result === "string") {
    hexData = json.result.startsWith("0x") ? json.result : `0x${json.result}`;
  } else {
    if (json.result.status && json.result.status.code !== 0) {
      throw new Error(
        `gen_call status error: ${json.result.status.message ?? json.result.status.code}`,
      );
    }
    hexData = `0x${json.result.data}`;
  }

  const resultBytes = fromHex(hexData as `0x${string}`, "bytes");
  const decoded = decode(resultBytes) as Map<string, unknown> | Record<string, unknown>;

  function mapGet(key: string): unknown {
    if (decoded instanceof Map) return decoded.get(key);
    return (decoded as Record<string, unknown>)[key];
  }

  let colors = mapGet("final_colors") as string[] | undefined;
  if (!Array.isArray(colors) || colors.length < 2) {
    colors = mapGet("colors") as string[] | undefined;
  }

  const reasoning =
    (mapGet("consensus_reasoning") as string | undefined) ??
    (mapGet("reasoning") as string | undefined);

  if (!Array.isArray(colors) || colors.length < 2) {
    throw new Error(
      `Contract returned no colors. Keys: ${
        decoded instanceof Map
          ? [...decoded.keys()].join(", ")
          : Object.keys(decoded as object).join(", ")
      }`,
    );
  }

  return {
    picks: [colors[0], colors[1]],
    scores: dominance_scores,
    source: "onchain",
    reasoning,
  };
}

function errorMsg(err: unknown): string {
  if (!err) return "unknown";
  if (typeof err === "string") return err;
  const e = err as Record<string, unknown>;
  const m = e["shortMessage"] ?? e["details"] ?? e["message"] ?? e["cause"];
  if (typeof m === "string" && m) return m.substring(0, 200);
  try {
    const s = JSON.stringify(err);
    if (s && s !== "{}") return s.substring(0, 200);
  } catch {}
  return String(err).substring(0, 200);
}

export async function validatorAnalyze(stage: Stage): Promise<ValidatorPick> {
  try {
    const result = await validatorAnalyzeOnChain(stage);
    console.info(
      `[MochiValidator] on-chain ✓  stage=${stage.id}  picks=${result.picks.join(",")}`,
    );
    return result;
  } catch (err) {
    console.warn(
      `[MochiValidator] on-chain unavailable (stage ${stage.id}) → ${errorMsg(err)} — running local consensus`,
    );
    return validatorAnalyzeLocal(stage);
  }
}

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
