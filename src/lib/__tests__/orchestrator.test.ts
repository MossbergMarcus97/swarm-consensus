import { beforeEach, describe, expect, it, vi } from "vitest";

import { runSwarmTurn } from "@/lib/orchestrator";

type MockResponse = { output_text: string[]; output: unknown[] };

const workerMock = vi.fn<[], Promise<MockResponse>>();
const judgeMock = vi.fn<[], Promise<MockResponse>>();
const finalizerMock = vi.fn<[], Promise<MockResponse>>();
const webSearchMock = vi.fn<[], Promise<{ title: string; url: string; snippet: string }[]>>();

vi.mock("@/lib/openaiClient", () => ({
  callWorkerModel: (...args: unknown[]) => workerMock(...args),
  callJudgeModel: (...args: unknown[]) => judgeMock(...args),
  callFinalizerModel: (...args: unknown[]) => finalizerMock(...args),
}));

vi.mock("@/lib/tools/webSearch", () => ({
  runWebSearch: (...args: unknown[]) => webSearchMock(...args),
}));

describe("runSwarmTurn", () => {
  beforeEach(() => {
    workerMock.mockReset();
    judgeMock.mockReset();
    finalizerMock.mockReset();
    webSearchMock.mockReset();

    workerMock.mockResolvedValue({
      output_text: ['{"answer":"Sample answer","reasoning":"Because"}'],
      output: [],
    });

    judgeMock.mockResolvedValue({
      output_text: ['{"ranked_ids":[],"scores":{},"notes":"neutral"}'],
      output: [],
    });

    finalizerMock.mockResolvedValue({
      output_text: [
        '{"final_answer":"Winner answer","short_rationale":"It won","summary_title":"Launch Plan"}',
      ],
      output: [],
    });

    webSearchMock.mockResolvedValue([]);
  });

  it("returns final answer, votes, and candidates", async () => {
    const result = await runSwarmTurn({
      userMessage: "How do we launch?",
      agentsCount: 2,
      files: [],
      history: [],
      mode: "fast",
      discussionEnabled: false,
      webBrowsingEnabled: false,
    });

    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.votes.length).toBeGreaterThan(0);
    expect(result.votingResult.winnerId).toBeTruthy();
    expect(result.finalAnswer).toBe("Winner answer");
    expect(result.title).toBe("Launch Plan");
    expect(workerMock).toHaveBeenCalled();
    expect(judgeMock).toHaveBeenCalled();
    expect(finalizerMock).toHaveBeenCalled();
  });

  it("injects web search findings when enabled", async () => {
    webSearchMock.mockResolvedValue([
      { title: "News", url: "https://example.com", snippet: "Breaking news" },
    ]);

    const result = await runSwarmTurn({
      userMessage: "What happened today?",
      agentsCount: 1,
      files: [],
      history: [],
      mode: "fast",
      discussionEnabled: false,
      webBrowsingEnabled: true,
    });

    expect(webSearchMock).toHaveBeenCalled();
    expect(result.webFindings?.length).toBe(1);
    const workerCall = workerMock.mock.calls[0]?.[0] as {
      input?: Array<{ role: string; content: unknown }>;
    };
    expect(JSON.stringify(workerCall?.input)).toContain("Live web findings");
  });
});

