import OpenAI from "openai";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import { AI_PROVIDER, MODEL_PRESETS } from "@/lib/config";
import type { JudgeAgentProfile, WorkerAgentProfile } from "@/lib/types";

// Standard OpenAI Chat Completion types
type ChatCompletionCreateParams = OpenAI.Chat.ChatCompletionCreateParams;

// Gemini client singleton
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (geminiClient) {
    return geminiClient;
  }
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Please add it to your environment to enable Gemini features.",
    );
  }
  
  geminiClient = new GoogleGenAI({ apiKey });
  return geminiClient;
}

// OpenAI client cache
const openaiClientCache: Record<string, OpenAI> = {};

function getOpenAIClientInternal(): OpenAI {
  if (openaiClientCache["openai"]) {
    return openaiClientCache["openai"];
  }
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Please add it to your environment to enable AI features.",
    );
  }
  
  const client = new OpenAI({ apiKey });
  openaiClientCache["openai"] = client;
  return client;
}

export function getOpenAIClient(provider?: "openai" | "gemini"): OpenAI {
  // For backwards compatibility, return OpenAI client
  // Gemini calls should use the dedicated Gemini functions
  return getOpenAIClientInternal();
}

// Convert OpenAI messages to Gemini content format
function convertMessagesToGeminiFormat(
  messages: ChatCompletionCreateParams["messages"]
): { systemInstruction?: string; contents: string } {
  let systemInstruction: string | undefined;
  const userContents: string[] = [];
  
  for (const msg of messages) {
    if (msg.role === "system") {
      // Gemini uses systemInstruction for system messages
      if (typeof msg.content === "string") {
        systemInstruction = (systemInstruction ? systemInstruction + "\n\n" : "") + msg.content;
      }
    } else if (msg.role === "user" || msg.role === "assistant") {
      // Extract text content
      if (typeof msg.content === "string") {
        userContents.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text" && "text" in part) {
            userContents.push(part.text);
          }
        }
      }
    }
  }
  
  return {
    systemInstruction,
    contents: userContents.join("\n\n"),
  };
}

// Map reasoning effort to Gemini thinking level
function mapReasoningToThinkingLevel(
  reasoningEffort?: "low" | "medium" | "high"
): ThinkingLevel {
  // Gemini 3 Pro doesn't support "medium" at launch
  // "medium" maps to "high", undefined defaults to "low" for faster responses
  if (reasoningEffort === "high" || reasoningEffort === "medium") {
    return ThinkingLevel.HIGH;
  }
  return ThinkingLevel.LOW;
}

// Wrapper to normalize Gemini response to OpenAI-like format
type NormalizedResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
};

async function callGeminiModel({
  model,
  messages,
  reasoningEffort,
}: {
  model: string;
  messages: ChatCompletionCreateParams["messages"];
  reasoningEffort?: "low" | "medium" | "high";
}): Promise<NormalizedResponse> {
  const client = getGeminiClient();
  const { systemInstruction, contents } = convertMessagesToGeminiFormat(messages);
  const thinkingLevel = mapReasoningToThinkingLevel(reasoningEffort);
  
  try {
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel,
        },
      },
    });
    
    // Extract text from response
    const text = response.text || "";
    
    return {
      choices: [
        {
          message: {
            content: text,
          },
        },
      ],
    };
  } catch (error: any) {
    console.error(`Gemini API error for model ${model}:`, error?.message || error);
    throw error;
  }
}

// Helper to strip undefined values from an object
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

  if (provider === "gemini") {
    return callGeminiModel({
      model: fallbackModel,
      messages: input,
      reasoningEffort,
    });
  }

  // OpenAI path
  try {
    const payload = cleanParams({
      model: fallbackModel,
      messages: input,
      reasoning_effort: reasoningEffort,
    });

    // @ts-ignore - Using cleaned payload object
    return await getOpenAIClientInternal().chat.completions.create(payload);
  } catch (error: any) {
    console.error(`Error calling OpenAI model ${fallbackModel}:`, error);
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

  if (provider === "gemini") {
    return callGeminiModel({
      model: fallbackModel,
      messages: input,
      reasoningEffort,
    });
  }

  // OpenAI path
  const payload = cleanParams({
    model: fallbackModel,
    messages: input,
    reasoning_effort: reasoningEffort,
  });

  // @ts-ignore
  return getOpenAIClientInternal().chat.completions.create(payload);
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

  if (provider === "gemini") {
    return callGeminiModel({
      model,
      messages: input,
      reasoningEffort,
    });
  }

  // OpenAI path
  const payload = cleanParams({
    model,
    messages: input,
    reasoning_effort: reasoningEffort,
  });

  // @ts-ignore
  return getOpenAIClientInternal().chat.completions.create(payload);
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

  if (provider === "gemini") {
    return callGeminiModel({
      model,
      messages: input,
      reasoningEffort: "low", // Generator should be fast
    });
  }

  // OpenAI path
  const payload = cleanParams({
    model,
    messages: input,
  });

  // @ts-ignore
  return getOpenAIClientInternal().chat.completions.create(payload);
}
