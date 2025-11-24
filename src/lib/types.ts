export type UploadedFileRef = {
  id: string;
  userFileId?: string;
  name: string;
  mimeType: string;
  size: number;
  openAiFileId?: string;
  createdAt?: string;
};

export type LibraryFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  openAiFileId: string;
  createdAt: string;
};

export type WebSearchFinding = {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
};

export type WorkerAgentProfile = {
  id: string;
  role: "worker";
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
};

export type JudgeAgentProfile = {
  id: string;
  role: "judge";
  name: string;
  description: string;
  judgingPrompt: string;
  model: string;
};

export type CandidateAnswer = {
  id: string;
  workerId: string;
  workerName: string;
  workerRoleDescription: string;
  workerSystemPrompt: string;
  workerModel: string;
  initialAnswer: string;
  initialReasoning: string;
  answer: string;
  reasoning: string;
  discussionAnswer?: string;
  discussionReasoning?: string;
  latencyMs: number;
  createdAt: string;
};

export type JudgeVote = {
  id: string;
  judgeId: string;
  judgeName: string;
  rankedIds: string[];
  scores: Record<string, number>;
  notes: string | Record<string, unknown> | Array<unknown>;
};

export type VotingResult = {
  winnerId: string;
  totals: Record<string, number>;
  ranking: Array<{
    candidateId: string;
    score: number;
  }>;
};

export type MinimalHistory = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  finalAnswer?: string;
};

export type SwarmMode = "fast" | "reasoning";
export type AIProvider = "openai" | "gemini";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  files?: UploadedFileRef[];
  swarm?: SwarmTurnResult;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mode: SwarmMode;
  provider: AIProvider;
  discussionEnabled: boolean;
  webBrowsingEnabled: boolean;
  messages: ChatMessage[];
};


export type SwarmTurnParams = {
  userMessage: string;
  agentsCount: number;
  files: UploadedFileRef[];
  history: MinimalHistory[];
  mode: SwarmMode;
  provider: AIProvider;
  discussionEnabled: boolean;
  webBrowsingEnabled: boolean;
};

export type SwarmTurnResult = {
  finalAnswer: string;
  finalReasoning: string;
  title: string;
  candidates: CandidateAnswer[];
  votes: JudgeVote[];
  votingResult: VotingResult;
  webFindings?: WebSearchFinding[];
};
