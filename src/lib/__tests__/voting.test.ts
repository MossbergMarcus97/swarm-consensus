import { describe, expect, it } from "vitest";

import { aggregateVotes } from "@/lib/orchestrator";
import type { CandidateAnswer, JudgeVote } from "@/lib/types";

const baseCandidates: CandidateAnswer[] = [
  {
    id: "a",
    workerId: "worker-a",
    workerName: "Worker A",
    workerRoleDescription: "Role A",
    answer: "Answer A",
    reasoning: "Reasoning A",
    latencyMs: 10,
    createdAt: new Date().toISOString(),
  },
  {
    id: "b",
    workerId: "worker-b",
    workerName: "Worker B",
    workerRoleDescription: "Role B",
    answer: "Answer B",
    reasoning: "Reasoning B",
    latencyMs: 12,
    createdAt: new Date().toISOString(),
  },
];

describe("aggregateVotes", () => {
  it("selects a winner based on ranked order", () => {
    const votes: JudgeVote[] = [
      {
        id: "j1",
        judgeId: "judge-1",
        judgeName: "Judge 1",
        rankedIds: ["a", "b"],
        scores: {},
        notes: "",
      },
      {
        id: "j2",
        judgeId: "judge-2",
        judgeName: "Judge 2",
        rankedIds: ["a", "b"],
        scores: {},
        notes: "",
      },
    ];

    const result = aggregateVotes(votes, baseCandidates);
    expect(result.winnerId).toBe("a");
    expect(result.ranking[0]?.candidateId).toBe("a");
  });

  it("uses judge scores as tie breakers", () => {
    const votes: JudgeVote[] = [
      {
        id: "j1",
        judgeId: "judge-1",
        judgeName: "Judge 1",
        rankedIds: ["a", "b"],
        scores: {},
        notes: "",
      },
      {
        id: "j2",
        judgeId: "judge-2",
        judgeName: "Judge 2",
        rankedIds: ["b", "a"],
        scores: { b: 2 },
        notes: "",
      },
    ];

    const result = aggregateVotes(votes, baseCandidates);
    expect(result.winnerId).toBe("b");
    expect(result.totals.b).toBeGreaterThan(result.totals.a);
  });
});

