export const MAX_WORKERS = 64;
export const MAX_FILES_PER_MESSAGE = Number(
  process.env.NEXT_PUBLIC_MAX_FILES ?? 5,
);
export const MAX_FILE_SIZE_MB = Number(
  process.env.NEXT_PUBLIC_MAX_FILE_SIZE_MB ?? 25,
);
export const MAX_HISTORY_TURNS = 6;
export const FINALIZER_RUNNER_UP_COUNT = 3;
export const SWARM_RUNTIME_BUDGET_SECONDS = Number(
  process.env.SWARM_RUNTIME_BUDGET_SECONDS ?? 280,
);
const FAST_AGENT_COST_SECONDS = Number(
  process.env.SWARM_FAST_AGENT_COST_SECONDS ?? 1.4,
);
const REASONING_AGENT_COST_SECONDS = Number(
  process.env.SWARM_REASONING_AGENT_COST_SECONDS ?? 4.25,
);
const DISCUSSION_TIME_MULTIPLIER = Number(
  process.env.SWARM_DISCUSSION_TIME_MULTIPLIER ?? 1.75,
);

export const AI_PROVIDER =
  process.env.AI_PROVIDER ?? process.env.NEXT_PUBLIC_AI_PROVIDER ?? "openai";

const isGemini = AI_PROVIDER === "gemini";

export const MODEL_PRESETS = {
  fast: {
    worker:
      process.env.SWARM_FAST_WORKER_MODEL ??
      process.env.NEXT_PUBLIC_SWARM_FAST_WORKER_MODEL ??
      (isGemini ? "gemini-3-pro-preview" : "gpt-5.1"),
    judge:
      process.env.SWARM_FAST_JUDGE_MODEL ??
      process.env.NEXT_PUBLIC_SWARM_FAST_JUDGE_MODEL ??
      (isGemini ? "gemini-3-pro-preview" : "gpt-5.1"),
    finalizer:
      process.env.SWARM_FAST_FINALIZER_MODEL ??
      process.env.NEXT_PUBLIC_SWARM_FAST_FINALIZER_MODEL ??
      (isGemini ? "gemini-3-pro-preview" : "gpt-5.1"),
    generator:
      process.env.SWARM_FAST_GENERATOR_MODEL ??
      process.env.NEXT_PUBLIC_SWARM_FAST_GENERATOR_MODEL ??
      (isGemini ? "gemini-3-pro-preview" : "gpt-5.1"),
  },
  reasoning: {
    worker:
      process.env.SWARM_REASONING_WORKER_MODEL ??
      process.env.NEXT_PUBLIC_SWARM_REASONING_WORKER_MODEL ??
      (isGemini ? "gemini-3-pro-preview" : "gpt-5.1"),
    judge:
      process.env.SWARM_REASONING_JUDGE_MODEL ??
      process.env.NEXT_PUBLIC_SWARM_REASONING_JUDGE_MODEL ??
      (isGemini ? "gemini-3-pro-preview" : "gpt-5.1"),
    finalizer:
      process.env.SWARM_REASONING_FINALIZER_MODEL ??
      process.env.NEXT_PUBLIC_SWARM_REASONING_FINALIZER_MODEL ??
      (isGemini ? "gemini-3-pro-preview" : "gpt-5.1"),
    generator:
      process.env.SWARM_REASONING_GENERATOR_MODEL ??
      process.env.NEXT_PUBLIC_SWARM_REASONING_GENERATOR_MODEL ??
      (isGemini ? "gemini-3-pro-preview" : "gpt-5.1"),
  },
} as const;

export type ModelPresetKey = keyof typeof MODEL_PRESETS;

export function getModelPreset(mode: ModelPresetKey) {
  return MODEL_PRESETS[mode] ?? MODEL_PRESETS.fast;
}

export function estimateSwarmRuntimeSeconds({
  agentsCount,
  mode,
  discussionEnabled,
}: {
  agentsCount: number;
  mode: ModelPresetKey;
  discussionEnabled: boolean;
}) {
  const perAgent =
    mode === "reasoning"
      ? REASONING_AGENT_COST_SECONDS
      : FAST_AGENT_COST_SECONDS;
  const discussionFactor = discussionEnabled ? DISCUSSION_TIME_MULTIPLIER : 1;
  return agentsCount * perAgent * discussionFactor;
}
