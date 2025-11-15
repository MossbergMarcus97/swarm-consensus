import { beforeEach, describe, expect, it, vi } from "vitest";

import { runSwarmTurn } from "@/lib/orchestrator";

type MockResponse = { output_text: string[]; output: unknown[] };

const workerMock = vi.fn<[], Promise<MockResponse>>();
const judgeMock = vi.fn<[], Promise<MockResponse>>();
const finalizerMock = vi.fn<[], Promise<MockResponse>>();

vi.mock("@/lib/openaiClient", () => ({
  callWorkerModel: (...args: unknown[]) => workerMock(...args),
  callJudgeModel: (...args: unknown[]) => judgeMock(...args),
  callFinalizerModel: (...args: unknown[]) => finalizerMock(...args),
}));

describe("runSwarmTurn", () => {
  beforeEach(() => {
    workerMock.mockReset();
    judgeMock.mockReset();
    finalizerMock.mockReset();

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
  });

  it("returns final answer, votes, and candidates", async () => {
    const result = await runSwarmTurn({
      userMessage: "How do we launch?",
      agentsCount: 2,
      files: [],
      history: [],
      mode: "fast",
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
});

