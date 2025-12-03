import { performance } from "node:perf_hooks";

import { getJudgeAgents } from "@/lib/agentsConfig";
import { generateAgents } from "@/lib/agentGenerator";
import {
  FINALIZER_RUNNER_UP_COUNT,
  getModelPreset,
  MAX_HISTORY_TURNS,
} from "@/lib/config";
import {
  callFinalizerModel,
  callJudgeModel,
  callWorkerModel,
  type ReasoningEffort,
} from "@/lib/openaiClient";
import { runWebSearch } from "@/lib/tools/webSearch";
import { parseJsonFromModel } from "@/lib/utils";
import type {
  CandidateAnswer,
  JudgeVote,
  MinimalHistory,
  SwarmTurnParams,
  SwarmTurnResult,
  UploadedFileRef,
  VotingResult,
  WorkerAgentProfile,
  JudgeAgentProfile,
  WebSearchFinding,
  AIProvider,
} from "@/lib/types";

// Using flexible type for content parts to support both OpenAI file refs and text
type ResponseInputContent =
  | { type: "text"; text: string }
  | { type: "input_file"; file_id: string }
  | { type: string; [key: string]: unknown };

type ResponseInputMessage = {
  role: "system" | "assistant" | "user" | "developer";
  content: string | ResponseInputContent[];
};

type WorkerJson = { answer: string; reasoning: string };
type JudgeJson = {
  ranked_ids: string[];
  scores: Record<string, number>;
  notes: unknown;
};
type FinalizerJson = {
  final_answer: string;
  short_rationale: string;
  summary_title?: string;
};
type ModelResponse =
  | Awaited<ReturnType<typeof callWorkerModel>>
  | Awaited<ReturnType<typeof callJudgeModel>>
  | Awaited<ReturnType<typeof callFinalizerModel>>;

type ResponseOutputItem = {
  type?: string;
  text?: string;
  content?: Array<{ type?: string; text?: string }>;
};

const HISTORY_CHAR_LIMIT = 2400;

export async function runSwarmTurn(
  params: SwarmTurnParams,
): Promise<SwarmTurnResult> {
  const {
    userMessage,
    agentsCount,
    files = [],
    history = [],
    mode,
    provider = "openai",
    discussionEnabled,
    webBrowsingEnabled,
  } = params;

  if (!userMessage?.trim()) {
    throw new Error("Message cannot be empty.");
  }

  const historySnippet = buildHistorySnippet(history);
  const fileParts = buildFileParts(files, provider);
  // Note: We pass provider here to ensure we get the right model string
  const modelPreset = getModelPresetWithProvider(mode, provider);
  const baseReasoningEffort: ReasoningEffort =
    mode === "reasoning" ? "high" : "none";
  
  const workers = await generateAgents({
    userMessage,
    count: agentsCount,
    model: modelPreset.generator,
    workerModel: modelPreset.worker,
    // We must propagate provider to the generator so it uses the right client/model
    provider,
  });
  
  let webFindings: WebSearchFinding[] = [];
  let webSummary = "";

  if (webBrowsingEnabled) {
    try {
      webFindings = await runWebSearch(userMessage, { maxResults: 5 });
      webSummary = formatWebFindings(webFindings);
    } catch (error) {
      console.warn("Web search failed", error);
    }
  }

  let candidates = await Promise.all(
    workers.map((worker) =>
      runWorkerCandidate({
        worker,
        userMessage,
        historySnippet,
        fileParts,
        webSummary,
        model: modelPreset.worker,
        reasoningEffort: baseReasoningEffort,
        provider,
      }),
    ),
  );

  if (!candidates.length) {
    throw new Error("No worker candidates were generated.");
  }

  if (discussionEnabled) {
    candidates = await runDiscussionRound({
      candidates,
      userMessage,
      model: modelPreset.worker,
      enableReasoning: mode === "reasoning",
      provider,
    });
  }

  const judges = getJudgeAgents();
  const votes = await Promise.all(
    judges.map((judge) =>
      runJudgeVote({
        judge,
        userMessage,
        candidates,
        webSummary,
        model: modelPreset.judge,
        reasoningEffort: baseReasoningEffort,
        provider,
      }),
    ),
  );

  const votingResult = aggregateVotes(votes, candidates);
  const finalAnswerPayload = await runFinalizer({
    userMessage,
    candidates,
    votingResult,
    webSummary,
    model: modelPreset.finalizer,
    enableReasoning: mode === "reasoning",
    provider,
  });

  return {
    finalAnswer: finalAnswerPayload.final_answer,
    finalReasoning: finalAnswerPayload.short_rationale,
    title:
      finalAnswerPayload.summary_title ||
      truncate(userMessage, 64) ||
      "Untitled conversation",
    candidates,
    votes,
    votingResult,
    webFindings: webFindings.length ? webFindings : undefined,
  };
}

// --- Helper to get presets respecting provider override ---
// We duplicate the logic from config temporarily or we could update config.ts
// But config.ts relies on env vars. Here we need per-request override.
// Let's define a local helper that mirrors config but takes provider arg.
function getModelPresetWithProvider(mode: "fast" | "reasoning", provider: AIProvider) {
  const isGemini = provider === "gemini";
  // Hardcoded fallback strings if env vars not set, mirroring config.ts default logic
  // but dynamic based on the provider argument.
  
  if (mode === "reasoning") {
    return {
      worker: isGemini ? "gemini-3-pro-preview" : (process.env.SWARM_REASONING_WORKER_MODEL ?? "gpt-5.1"),
      judge: isGemini ? "gemini-3-pro-preview" : (process.env.SWARM_REASONING_JUDGE_MODEL ?? "gpt-5.1"),
      finalizer: isGemini ? "gemini-3-pro-preview" : (process.env.SWARM_REASONING_FINALIZER_MODEL ?? "gpt-5.1"),
      generator: isGemini ? "gemini-3-pro-preview" : (process.env.SWARM_REASONING_GENERATOR_MODEL ?? "gpt-5.1"),
    };
  }
  
  // Fast mode
  return {
    worker: isGemini ? "gemini-3-pro-preview" : (process.env.SWARM_FAST_WORKER_MODEL ?? "gpt-5.1"),
    judge: isGemini ? "gemini-3-pro-preview" : (process.env.SWARM_FAST_JUDGE_MODEL ?? "gpt-5.1"),
    finalizer: isGemini ? "gemini-3-pro-preview" : (process.env.SWARM_FAST_FINALIZER_MODEL ?? "gpt-5.1"),
    generator: isGemini ? "gemini-3-pro-preview" : (process.env.SWARM_FAST_GENERATOR_MODEL ?? "gpt-5.1"),
  };
}

function buildHistorySnippet(history: MinimalHistory[]): string {
  const recent = history.slice(-MAX_HISTORY_TURNS);
  const combined = recent
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
    .join("\n");

  if (combined.length <= HISTORY_CHAR_LIMIT) {
    return combined;
  }
  return combined.slice(combined.length - HISTORY_CHAR_LIMIT);
}

function buildFileParts(files: UploadedFileRef[], provider: AIProvider): ResponseInputContent[] {
  // Gemini's OpenAI compatibility layer does not support input_file references.
  // Skip file attachments for Gemini to avoid API errors.
  if (provider === "gemini") {
    if (files.length > 0) {
      console.warn("File attachments are not supported with Gemini provider via OpenAI compatibility layer. Files will be skipped.");
    }
    return [];
  }
  
  return files
    .filter((file) => !!file.openAiFileId)
    .map((file) => ({
      type: "input_file" as const,
      file_id: file.openAiFileId!,
    }));
}

async function runWorkerCandidate({
  worker,
  userMessage,
  historySnippet,
  fileParts,
  webSummary,
  model,
  reasoningEffort,
  provider,
}: {
  worker: WorkerAgentProfile;
  userMessage: string;
  historySnippet: string;
  fileParts: ResponseInputContent[];
  webSummary: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  provider: AIProvider;
}): Promise<CandidateAnswer> {
  const started = performance.now();
  try {
    const response = await callWorkerModel({
      agent: worker,
      input: [
        {
          role: "system",
          content: `${worker.systemPrompt}\n\nAll attached files (.pdf, .doc, .docx, .ppt, .pptx, .txt, images) are already parsed and fully readable—never reject them. Respond strictly as JSON: {"answer": string, "reasoning": string}.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                historySnippet ? `Recent turns:\n${historySnippet}` : "",
                webSummary ? `Live web findings:\n${webSummary}` : "",
                `User question:\n${userMessage}`,
                "Provide your best answer and explain your reasoning.",
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
            ...fileParts,
          ],
        },
      ] as any,
      modelOverride: model,
      reasoningEffort,
      provider,
    });

    const json = parseJsonResponse<WorkerJson>(response, {
      answer: "Unable to provide an answer.",
      reasoning: "Worker model returned invalid response.",
    });

    return {
      id: crypto.randomUUID(),
      workerId: worker.id,
      workerName: worker.name,
      workerRoleDescription: worker.description,
      workerSystemPrompt: worker.systemPrompt,
      workerModel: model,
      initialAnswer: json.answer?.trim() || "No answer provided.",
      initialReasoning: json.reasoning?.trim() || "No reasoning provided.",
      answer: json.answer?.trim() || "No answer provided.",
      reasoning: json.reasoning?.trim() || "No reasoning provided.",
      latencyMs: Math.round(performance.now() - started),
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      id: crypto.randomUUID(),
      workerId: worker.id,
      workerName: worker.name,
      workerRoleDescription: worker.description,
      workerSystemPrompt: worker.systemPrompt,
      workerModel: model,
      initialAnswer: "Worker failed to respond.",
      initialReasoning: extractErrorMessage(error),
      answer: "Worker failed to respond.",
      reasoning: extractErrorMessage(error),
      latencyMs: Math.round(performance.now() - started),
      createdAt: new Date().toISOString(),
    };
  }
}

async function runDiscussionRound({
  candidates,
  userMessage,
  model,
  enableReasoning,
  provider,
}: {
  candidates: CandidateAnswer[];
  userMessage: string;
  model: string;
  enableReasoning: boolean;
  provider: AIProvider;
}): Promise<CandidateAnswer[]> {
  return Promise.all(
    candidates.map(async (candidate) => {
      const peerInsights = candidates
        .filter((peer) => peer.id !== candidate.id)
        .map(
          (peer, index) =>
            `${index + 1}. ${peer.workerName}: ${peer.answer}\nReasoning: ${peer.reasoning}`,
        )
        .join("\n\n") || "Peers could not provide any recommendations.";

      try {
        const response = await callWorkerModel({
          agent: {
            id: candidate.workerId,
            role: "worker",
            name: candidate.workerName,
            description: candidate.workerRoleDescription,
            systemPrompt: candidate.workerSystemPrompt,
            model: candidate.workerModel,
          },
          input: [
            {
              role: "system",
              content: `${candidate.workerSystemPrompt}\n\nYou are in a collaborative round with other experts. Use their insights to refine your answer, making it more concrete and aligned with the user's goals. Respond strictly as JSON: {"answer": string, "reasoning": string}.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: [
                    `User question:\n${userMessage}`,
                    `Your previous answer:\n${candidate.answer}`,
                    "Peer highlights:\n" + peerInsights,
                  ].join("\n\n"),
                },
              ],
            },
          ] as any,
          modelOverride: model,
          reasoningEffort: enableReasoning ? "high" : "none",
          provider,
        });

        const json = parseJsonResponse<WorkerJson>(response, {
          answer: candidate.answer,
          reasoning: candidate.reasoning,
        });

        return {
          ...candidate,
          discussionAnswer: json.answer?.trim(),
          discussionReasoning: json.reasoning?.trim(),
          answer: json.answer?.trim() || candidate.answer,
          reasoning: json.reasoning?.trim() || candidate.reasoning,
        };
      } catch (error) {
        return {
          ...candidate,
          discussionAnswer: candidate.answer,
          discussionReasoning: extractErrorMessage(error),
        };
      }
    }),
  );
}

async function runJudgeVote({
  judge,
  userMessage,
  candidates,
  webSummary,
  model,
  reasoningEffort,
  provider,
}: {
  judge: JudgeAgentProfile;
  userMessage: string;
  candidates: CandidateAnswer[];
  webSummary: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  provider: AIProvider;
}): Promise<JudgeVote> {
  try {
    const response = await callJudgeModel({
      judge,
      input: [
        {
          role: "system",
          content: `${judge.judgingPrompt}\nReturn JSON with ranked_ids (ordered best to worst), scores per candidate, and notes.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `User question:\n${userMessage}`,
                webSummary ? `Live web findings:\n${webSummary}` : "",
                "Candidate answers:",
                candidates
                  .map(
                    (candidate, index) =>
                      `${index + 1}. ${candidate.workerName} (id: ${candidate.id})\nAnswer: ${candidate.answer}\nReasoning: ${truncate(candidate.reasoning, 400)}`,
                  )
                  .join("\n\n"),
              ].join("\n\n"),
            },
          ],
        },
      ] as any,
      modelOverride: model,
      reasoningEffort,
      provider,
    });

    const json = parseJsonResponse<JudgeJson>(response, {
      ranked_ids: [],
      scores: {},
      notes: "Judge produced invalid JSON.",
    });

    const normalizedNotes =
      typeof json.notes === "string" || Array.isArray(json.notes)
        ? json.notes
        : typeof json.notes === "object" && json.notes !== null
          ? (json.notes as Record<string, unknown>)
          : "";

    return {
      id: crypto.randomUUID(),
      judgeId: judge.id,
      judgeName: judge.name,
      rankedIds: Array.isArray(json.ranked_ids) ? json.ranked_ids : [],
      scores: typeof json.scores === "object" && json.scores !== null ? json.scores : {},
      notes: normalizedNotes,
    };
  } catch (error) {
    return {
      id: crypto.randomUUID(),
      judgeId: judge.id,
      judgeName: judge.name,
      rankedIds: [],
      scores: {},
      notes: `Judge failed: ${extractErrorMessage(error)}`,
    };
  }
}

async function runFinalizer({
  userMessage,
  candidates,
  votingResult,
  webSummary,
  model,
  enableReasoning,
  provider,
}: {
  userMessage: string;
  candidates: CandidateAnswer[];
  votingResult: VotingResult;
  webSummary: string;
  model: string;
  enableReasoning: boolean;
  provider: AIProvider;
}): Promise<FinalizerJson> {
  const winner =
    candidates.find((candidate) => candidate.id === votingResult.winnerId) ??
    candidates[0];

  const runnerUps = votingResult.ranking
    .filter((entry) => entry.candidateId !== winner.id)
    .slice(0, FINALIZER_RUNNER_UP_COUNT)
    .map((entry) => {
      const candidate = candidates.find((c) => c.id === entry.candidateId);
      if (!candidate) return null;
      return {
        id: candidate.id,
        workerName: candidate.workerName,
        score: entry.score,
        answer: truncate(candidate.answer, 500),
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      workerName: string;
      score: number;
      answer: string;
    }>;

  const response = await callFinalizerModel({
    input: [
      {
        role: "system",
        content:
          "You are the final arbiter. Produce the single best user-facing answer, grounding heavily in the winning candidate but optionally borrowing improvements from others. The final_answer must be well-formatted Markdown with the following sections: ## Executive Summary, ## Key Recommendations, ## Risks & Mitigations, ## Next Actions. Respond strictly as JSON: {\"final_answer\": string, \"short_rationale\": string, \"summary_title\": string}. The summary title should be at most 6 words.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `User question:\n${userMessage}`,
              webSummary ? `Live web findings:\n${webSummary}` : "",
              "Winning candidate:",
              `Agent: ${winner.workerName} (${winner.workerRoleDescription})`,
              `Answer:\n${winner.answer}`,
              `Reasoning:\n${winner.reasoning}`,
              "Runner-ups:",
              runnerUps
                .map(
                  (runner, index) =>
                    `${index + 1}. ${runner.workerName} (score ${runner.score})\n${runner.answer}`,
                )
                .join("\n\n") || "None",
              "Voting totals:",
              votingResult.ranking
                .map(
                  (entry, index) =>
                    `${index + 1}. ${entry.candidateId} -> ${entry.score}`,
                )
                .join("\n"),
            ].join("\n\n"),
          },
        ],
      },
    ] as any,
    modelOverride: model,
    reasoningEffort: enableReasoning ? "high" : "none",
    provider,
  });

  return parseJsonResponse<FinalizerJson>(response, {
    final_answer: winner.answer,
    short_rationale:
      "Fell back to winning candidate because the finalizer returned invalid JSON.",
    summary_title: truncate(userMessage, 60),
  });
}

export function aggregateVotes(
  votes: JudgeVote[],
  candidates: CandidateAnswer[],
): VotingResult {
  const totals: Record<string, number> = Object.fromEntries(
    candidates.map((candidate) => [candidate.id, 0]),
  );

  votes.forEach((vote) => {
    const ranked = vote.rankedIds.filter((id) => id in totals);
    ranked.forEach((candidateId, index) => {
      const points = ranked.length - index - 1;
      totals[candidateId] += Math.max(points, 0);
    });

    Object.entries(vote.scores).forEach(([candidateId, score]) => {
      if (candidateId in totals && Number.isFinite(score)) {
        totals[candidateId] += Number(score);
      }
    });
  });

  const ranking = Object.entries(totals)
    .map(([candidateId, score]) => ({ candidateId, score }))
    .sort((a, b) => b.score - a.score);

  return {
    winnerId: ranking[0]?.candidateId ?? candidates[0].id,
    totals,
    ranking,
  };
}

function parseJsonResponse<T>(response: ModelResponse, fallback: T): T {
  const text = extractResponseText(response);
  return parseJsonFromModel(text, fallback);
}

function extractResponseText(response: ModelResponse): string {
  // Handle standard OpenAI response structure
  if ('choices' in response && Array.isArray((response as any).choices) && (response as any).choices.length > 0) {
    return (response as any).choices[0].message?.content || "";
  }

  const base = (response as unknown) as {
    output_text?: string[];
    output?: ResponseOutputItem[];
  };

  if (Array.isArray(base.output_text) && base.output_text.length) {
    return base.output_text.join("\n").trim();
  }

  if (Array.isArray(base.output)) {
    return base.output
      .map((item) => {
        if (item?.type === "message") {
          return item.content
            ?.map((contentItem) =>
              contentItem?.type === "output_text" ? contentItem.text : "",
            )
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

function truncate(text: string, maxLength: number) {
  const normalized = text?.toString().replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

function formatWebFindings(findings: WebSearchFinding[]) {
  if (!findings.length) {
    return "";
  }
  return findings
    .map((finding, index) => {
      const published = finding.publishedAt
        ? ` · Published: ${finding.publishedAt}`
        : "";
      return [
        `${index + 1}. ${finding.title}${published}`,
        `URL: ${finding.url}`,
        `Summary: ${truncate(finding.snippet, 320)}`,
      ].join("\n");
    })
    .join("\n\n");
}
