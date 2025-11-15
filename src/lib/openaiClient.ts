import OpenAI from "openai";

import { MODEL_PRESETS } from "@/lib/config";
import type { JudgeAgentProfile, WorkerAgentProfile } from "@/lib/types";

let cachedClient: OpenAI | null = null;

type ResponseCreateParams =
  OpenAI.Responses.ResponseCreateParamsNonStreaming;

export function getOpenAIClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Please add it to your environment to enable AI features.",
    );
  }

  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

export async function callWorkerModel({
  agent,
  input,
  modelOverride,
  reasoningEffort,
}: {
  agent: WorkerAgentProfile;
  input: ResponseCreateParams["input"];
  modelOverride?: string;
  reasoningEffort?: "low" | "medium" | "high";
}) {
  const fallbackModel = modelOverride ?? agent.model ?? MODEL_PRESETS.fast.worker;
  return getOpenAIClient().responses.create({
    model: fallbackModel,
    input,
    reasoning: reasoningEffort
      ? {
          effort: reasoningEffort,
        }
      : undefined,
  });
}

export async function callJudgeModel({
  judge,
  input,
  modelOverride,
  reasoningEffort,
}: {
  judge: JudgeAgentProfile;
  input: ResponseCreateParams["input"];
  modelOverride?: string;
  reasoningEffort?: "low" | "medium" | "high";
}) {
  const fallbackModel = modelOverride ?? judge.model ?? MODEL_PRESETS.fast.judge;
  return getOpenAIClient().responses.create({
    model: fallbackModel,
    input,
    reasoning: reasoningEffort
      ? {
          effort: reasoningEffort,
        }
      : undefined,
  });
}

export async function callFinalizerModel({
  input,
  modelOverride,
  reasoningEffort,
}: {
  input: ResponseCreateParams["input"];
  modelOverride?: string;
  reasoningEffort?: "low" | "medium" | "high";
}) {
  const model = modelOverride ?? MODEL_PRESETS.fast.finalizer;
  return getOpenAIClient().responses.create({
    model,
    input,
    reasoning: reasoningEffort
      ? {
          effort: reasoningEffort,
        }
      : undefined,
  });
}
