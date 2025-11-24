import { WORKER_AGENTS } from "@/lib/agentsConfig";
import { callGeneratorModel } from "@/lib/openaiClient";
import { parseJsonFromModel } from "@/lib/utils";
import type { WorkerAgentProfile } from "@/lib/types";

type GeneratorJson = {
  agents: Array<{
    name: string;
    role: string;
    description: string;
    systemPrompt: string;
  }>;
};

export async function generateAgents({
  userMessage,
  count,
  model,
  workerModel,
  provider,
}: {
  userMessage: string;
  count: number;
  model: string;
  workerModel: string;
  provider?: "openai" | "gemini";
}): Promise<WorkerAgentProfile[]> {
  try {
    const response = await callGeneratorModel({
      input: [
        {
          role: "system",
          content: `You are an expert team recruiter. Analyze the user's request and recruit a team of ${count} specialized AI agents to solve it.
          
          For each agent, provide:
          - name: A creative, professional title (e.g., "Python Specialist", "Legal Analyst").
          - description: A one-sentence description of their role.
          - systemPrompt: A highly specific, second-person instruction set for that agent (e.g., "You are a...").
          
          Respond strictly as JSON: { "agents": [{ "name": string, "description": string, "systemPrompt": string }] }.`,
        },
        {
          role: "user",
          content: `User request: "${userMessage}"\n\nRecruit ${count} agents.`,
        },
      ] as any,
      modelOverride: model,
      provider,
    });

    const json = parseJsonResponse<GeneratorJson>(response, { agents: [] });

    if (!json.agents || !Array.isArray(json.agents) || json.agents.length === 0) {
      console.warn("Generator returned no agents, falling back to defaults.");
      return WORKER_AGENTS.slice(0, count);
    }

    return json.agents.slice(0, count).map((agent) => ({
      id: crypto.randomUUID(),
      role: "worker",
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      model: workerModel,
    }));
  } catch (error) {
    // If using Gemini, 404 might happen if the model alias isn't live yet or region restricted
    console.error("Agent generation failed (falling back to defaults):", error);
    // Fallback to static list
    return WORKER_AGENTS.slice(0, count);
  }
}

function parseJsonResponse<T>(response: any, fallback: T): T {
  const text = extractResponseText(response);
  return parseJsonFromModel(text, fallback);
}

function extractResponseText(response: any): string {
  const base = response as {
    output_text?: string[];
    choices?: Array<{ message?: { content?: string } }>;
    output?: Array<{ type?: string; text?: string; content?: Array<{ type?: string; text?: string }> }>;
  };

  if (base.choices && Array.isArray(base.choices) && base.choices.length > 0) {
     return base.choices[0].message?.content || "";
  }

  if (Array.isArray(base.output_text) && base.output_text.length) {
    return base.output_text.join("\n").trim();
  }

  if (Array.isArray(base.output)) {
    return base.output
      .map((item) => {
        if (item?.type === "message") {
          return item.content
            ?.map((contentItem) => (contentItem?.type === "output_text" ? contentItem.text : ""))
            .join("");
        }
        if (item?.type === "output_text") {
          return item.text ?? "";
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}
