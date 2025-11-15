import { describe, expect, it } from "vitest";

import { getJudgeAgents, selectWorkers, WORKER_AGENTS } from "@/lib/agentsConfig";
import { MAX_WORKERS } from "@/lib/config";

describe("agentsConfig", () => {
  it("never selects more workers than allowed", () => {
    const requested = MAX_WORKERS + 100;
    const agents = selectWorkers(requested);
    expect(agents.length).toBeLessThanOrEqual(WORKER_AGENTS.length);
    expect(agents.length).toBeGreaterThan(0);
  });

  it("always returns at least one worker for invalid counts", () => {
    expect(selectWorkers(0)).toHaveLength(1);
    expect(selectWorkers(-10)).toHaveLength(1);
  });

  it("exposes multiple judge perspectives", () => {
    const judges = getJudgeAgents();
    expect(judges.length).toBeGreaterThanOrEqual(3);
    expect(new Set(judges.map((judge) => judge.id)).size).toEqual(judges.length);
  });
});

