import { performance } from "node:perf_hooks";

import { getJudgeAgents, selectWorkers } from "@/lib/agentsConfig";
import {
  FINALIZER_RUNNER_UP_COUNT,
  getModelPreset,
  MAX_HISTORY_TURNS,
} from "@/lib/config";
import {
  callFinalizerModel,
  callJudgeModel,
  callWorkerModel,
} from "@/lib/openaiClient";
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
} from "@/lib/types";

type ResponseInputContent =
  | { type: "input_text"; text: string }
  | { type: "input_file"; file_id: string };

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
  const { userMessage, agentsCount, files = [], history = [], mode, discussionEnabled } = params;

  if (!userMessage?.trim()) {
    throw new Error("Message cannot be empty.");
  }

  const historySnippet = buildHistorySnippet(history);
  const fileParts = buildFileParts(files);
  const workers = selectWorkers(agentsCount);
  const modelPreset = getModelPreset(mode);

  let candidates = await Promise.all(
    workers.map((worker) =>
      runWorkerCandidate({
        worker,
        userMessage,
        historySnippet,
        fileParts,
        model: modelPreset.worker,
        reasoningEffort: mode === "reasoning" ? "medium" : undefined,
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
    });
  }

  const judges = getJudgeAgents();
  const votes = await Promise.all(
    judges.map((judge) =>
      runJudgeVote({
        judge,
        userMessage,
        candidates,
        model: modelPreset.judge,
        reasoningEffort: mode === "reasoning" ? "medium" : undefined,
      }),
    ),
  );

  const votingResult = aggregateVotes(votes, candidates);
  const finalAnswerPayload = await runFinalizer({
    userMessage,
    candidates,
    votingResult,
    model: modelPreset.finalizer,
    enableReasoning: mode === "reasoning",
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

function buildFileParts(files: UploadedFileRef[]): ResponseInputContent[] {
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
  model,
  reasoningEffort,
}: {
  worker: WorkerAgentProfile;
  userMessage: string;
  historySnippet: string;
  fileParts: ResponseInputContent[];
  model: string;
  reasoningEffort?: "low" | "medium" | "high";
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
              type: "input_text",
              text: [
                historySnippet ? `Recent turns:\n${historySnippet}` : "",
                `User question:\n${userMessage}`,
                "Provide your best answer and explain your reasoning.",
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
            ...fileParts,
          ],
        },
      ] satisfies ResponseInputMessage[],
      modelOverride: model,
      reasoningEffort,
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
}: {
  candidates: CandidateAnswer[];
  userMessage: string;
  model: string;
  enableReasoning: boolean;
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
                  type: "input_text",
                  text: [
                    `User question:\n${userMessage}`,
                    `Your previous answer:\n${candidate.answer}`,
                    "Peer highlights:\n" + peerInsights,
                  ].join("\n\n"),
                },
              ],
            },
          ] satisfies ResponseInputMessage[],
          modelOverride: model,
          reasoningEffort: enableReasoning ? "medium" : undefined,
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
  model,
  reasoningEffort,
}: {
  judge: JudgeAgentProfile;
  userMessage: string;
  candidates: CandidateAnswer[];
  model: string;
  reasoningEffort?: "low" | "medium" | "high";
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
              type: "input_text",
              text: [
                `User question:\n${userMessage}`,
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
      ] satisfies ResponseInputMessage[],
      modelOverride: model,
      reasoningEffort,
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
  model,
  enableReasoning,
}: {
  userMessage: string;
  candidates: CandidateAnswer[];
  votingResult: VotingResult;
  model: string;
  enableReasoning: boolean;
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
            type: "input_text",
            text: [
              `User question:\n${userMessage}`,
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
    ] satisfies ResponseInputMessage[],
    modelOverride: model,
    reasoningEffort: enableReasoning ? "medium" : undefined,
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
  if (!text) {
    return fallback;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function extractResponseText(response: ModelResponse): string {
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

