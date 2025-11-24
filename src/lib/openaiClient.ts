import OpenAI from "openai";

import { AI_PROVIDER, MODEL_PRESETS } from "@/lib/config";
import type { JudgeAgentProfile, WorkerAgentProfile } from "@/lib/types";

let cachedClient: OpenAI | null = null;

// Standard OpenAI Chat Completion types
type ChatCompletionCreateParams = OpenAI.Chat.ChatCompletionCreateParams;

export function getOpenAIClient(provider?: "openai" | "gemini") {
  return getClientForProvider(provider ?? AI_PROVIDER as "openai" | "gemini"); 
}

const clientCache: Record<string, OpenAI> = {};

function getClientForProvider(provider: string): OpenAI {
  const key = provider === "gemini" ? "gemini" : "openai";

  if (clientCache[key]) {
    return clientCache[key];
  }

  if (key === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Please add it to your environment to enable Gemini features.",
      );
    }
    // Gemini OpenAI compatibility endpoint.
    // Removing trailing slash to ensure .../openai/chat/completions is constructed correctly.
    const client = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    });
    clientCache["gemini"] = client;
    return client;
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Please add it to your environment to enable AI features.",
      );
    }
    const client = new OpenAI({ apiKey });
    clientCache["openai"] = client;
    return client;
  }
}

function getProviderSpecificReasoningParams(
  provider: string | undefined,
  providedEffort?: "low" | "medium" | "high",
): { reasoning_effort?: string } {
  if (provider === "gemini") {
    return {};
  }
  return {
    reasoning_effort: providedEffort,
  };
}

// Helper to strip undefined values from an object, 
// ensuring strict JSON serialization doesn't send `key: undefined` which some gateways reject.
function cleanParams(params: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(params).filter(([_, v]) => v !== undefined)
  );
}

export async function callWorkerModel({
  agent,
  input,
  modelOverride,
  reasoningEffort,
  provider,
}: {
  agent: WorkerAgentProfile;
  input: ChatCompletionCreateParams["messages"];
  modelOverride?: string;
  reasoningEffort?: "low" | "medium" | "high";
  provider?: "openai" | "gemini";
}) {
  const fallbackModel = modelOverride ?? agent.model ?? MODEL_PRESETS.fast.worker;
  const extraParams = getProviderSpecificReasoningParams(provider, reasoningEffort);

  try {
    const payload = cleanParams({
      model: fallbackModel,
      messages: input,
      ...extraParams,
    });

    // @ts-ignore - Using cleaned payload object
    return await getOpenAIClient(provider).chat.completions.create(payload);
  } catch (error: any) {
    console.error(`Error calling ${provider} model ${fallbackModel}:`, error);
    throw error;
  }
}

export async function callJudgeModel({
  judge,
  input,
  modelOverride,
  reasoningEffort,
  provider,
}: {
  judge: JudgeAgentProfile;
  input: ChatCompletionCreateParams["messages"];
  modelOverride?: string;
  reasoningEffort?: "low" | "medium" | "high";
  provider?: "openai" | "gemini";
}) {
  const fallbackModel = modelOverride ?? judge.model ?? MODEL_PRESETS.fast.judge;
  const extraParams = getProviderSpecificReasoningParams(provider, reasoningEffort);

  const payload = cleanParams({
    model: fallbackModel,
    messages: input,
    ...extraParams,
  });

  // @ts-ignore
  return getOpenAIClient(provider).chat.completions.create(payload);
}

export async function callFinalizerModel({
  input,
  modelOverride,
  reasoningEffort,
  provider,
}: {
  input: ChatCompletionCreateParams["messages"];
  modelOverride?: string;
  reasoningEffort?: "low" | "medium" | "high";
  provider?: "openai" | "gemini";
}) {
  const model = modelOverride ?? MODEL_PRESETS.fast.finalizer;
  const extraParams = getProviderSpecificReasoningParams(provider, reasoningEffort);

  const payload = cleanParams({
    model,
    messages: input,
    ...extraParams,
  });

  // @ts-ignore
  return getOpenAIClient(provider).chat.completions.create(payload);
}

export async function callGeneratorModel({
  input,
  modelOverride,
  provider,
}: {
  input: ChatCompletionCreateParams["messages"];
  modelOverride?: string;
  provider?: "openai" | "gemini";
}) {
  const model = modelOverride ?? MODEL_PRESETS.fast.generator;
  const extraParams = getProviderSpecificReasoningParams(provider, undefined);

  const payload = cleanParams({
    model,
    messages: input,
    ...extraParams,
  });

  // @ts-ignore
  return getOpenAIClient(provider).chat.completions.create(payload);
}
