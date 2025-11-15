"use client";

import { useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { AgentCard } from "@/components/chat/AgentCard";
import { Badge } from "@/components/ui/badge";
import type { SwarmTurnResult } from "@/lib/types";
import { RichMarkdown } from "@/components/common/RichMarkdown";

type SwarmDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  swarm: SwarmTurnResult | null;
};

export function SwarmDrawer({ open, onOpenChange, swarm }: SwarmDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] overflow-hidden lg:max-h-none">
        <DrawerHeader>
          <DrawerTitle>Swarm Overview</DrawerTitle>
          <DrawerDescription>
            Compare every worker’s proposal, judge feedback, and the final synthesis.
          </DrawerDescription>
        </DrawerHeader>
        <Separator />
        {swarm ? (
          <div className="grid gap-6 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <ScrollArea className="h-full">
              <div className="space-y-6 pr-4">
                <section>
                  <SectionHeader title="Winner" />
                  <WinnerCard swarm={swarm} />
                </section>
                <section>
                  <SectionHeader title="Candidate answers" />
                  <div className="mt-3 grid gap-3">
                    {swarm.votingResult.ranking.map((entry, index) => {
                      const candidate = swarm.candidates.find(
                        (item) => item.id === entry.candidateId,
                      );
                      if (!candidate) return null;
                      return (
                        <AgentCard
                          key={candidate.id}
                          candidate={candidate}
                          score={entry.score}
                          rank={index + 1}
                        />
                      );
                    })}
                  </div>
                </section>
              </div>
            </ScrollArea>
            <aside className="space-y-6 rounded-2xl border border-border/60 bg-card/70 p-4">
              <section>
                <SectionHeader title="Voting summary" />
                <Scoreboard swarm={swarm} />
              </section>
              <section>
                <SectionHeader title="Judge notes" />
                <JudgeNotesList votes={swarm.votes} />
              </section>
              <section>
                <SectionHeader title="Final rationale" />
                <ExpandableText content={swarm.finalReasoning} previewLength={260} />
              </section>
            </aside>
          </div>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">No swarm data available yet.</div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function WinnerCard({ swarm }: { swarm: SwarmTurnResult }) {
  const winner = swarm.candidates.find(
    (candidate) => candidate.id === swarm.votingResult.winnerId,
  );
  const [showWinnerAnswer, setShowWinnerAnswer] = useState(false);
  if (!winner) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
        Winner data is unavailable. Re-run the swarm.
      </div>
    );
  }

  const preview = truncateText(swarm.finalAnswer, 260);

  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-primary">Winner</p>
          <h3 className="mt-2 text-lg font-semibold">{winner.workerName}</h3>
          <p className="text-sm text-muted-foreground">{winner.workerRoleDescription}</p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {swarm.votingResult.ranking[0]?.score.toFixed(1)} pts
        </Badge>
      </div>
      {showWinnerAnswer ? (
        <div className="rich-text text-sm">
          <RichMarkdown content={swarm.finalAnswer} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{preview}</p>
      )}
      <button
        type="button"
        className="text-xs text-primary underline-offset-4 hover:underline"
        onClick={() => setShowWinnerAnswer((prev) => !prev)}
      >
        {showWinnerAnswer ? "Hide full answer" : "Show full answer"}
      </button>
    </div>
  );
}

function Scoreboard({ swarm }: { swarm: SwarmTurnResult }) {
  return (
    <div className="space-y-3 text-sm">
      {swarm.votingResult.ranking.map((entry, index) => {
        const candidate = swarm.candidates.find((item) => item.id === entry.candidateId);
        if (!candidate) return null;
        return (
          <div
            key={entry.candidateId}
            className="rounded-lg border border-border/70 bg-background/70 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  {index + 1}. {candidate.workerName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {candidate.workerRoleDescription}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {entry.score.toFixed(1)} pts
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {swarm.votes.map((vote) => (
                <span
                  key={`${vote.id}-${entry.candidateId}`}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {vote.judgeName}: {formatScore(vote.scores?.[entry.candidateId])}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JudgeNotesList({
  votes,
}: {
  votes: SwarmTurnResult["votes"];
}) {
  if (!votes.length) {
    return <p className="text-sm text-muted-foreground">No judge notes.</p>;
  }

  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      {votes.map((vote) => (
        <div key={vote.id} className="rounded-lg border border-border/70 bg-background/60 p-3">
          <p className="font-semibold text-foreground">{vote.judgeName}</p>
          <ExpandableText content={formatJudgeNotes(vote.notes)} />
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

function formatScore(score: unknown) {
  if (typeof score === "number" && Number.isFinite(score)) {
    return score.toFixed(1);
  }
  if (typeof score === "string") return score;
  return "—";
}

function formatJudgeNotes(
  notes: string | Record<string, unknown> | Array<unknown> | undefined,
) {
  if (!notes) return "—";
  if (typeof notes === "string") return notes;
  try {
    if (Array.isArray(notes)) {
      return notes
        .map((entry, index) => `${index + 1}. ${stringifyValue(entry)}`)
        .join(" · ");
    }
    return Object.entries(notes)
      .map(([key, value]) => `${key}: ${stringifyValue(value)}`)
      .join(" · ");
  } catch {
    return JSON.stringify(notes);
  }
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncateText(text: string, max: number) {
  const normalized = text?.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

function ExpandableText({
  content,
  previewLength = 200,
}: {
  content: string;
  previewLength?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!content?.trim()) {
    return <p className="text-xs text-muted-foreground">—</p>;
  }
  const preview = truncateText(content, previewLength);
  const needsToggle = preview !== content;
  return (
    <div className="text-xs text-muted-foreground">
      {expanded || !needsToggle ? content : preview}
      {needsToggle ? (
        <button
          type="button"
          className="ml-2 text-primary underline-offset-4 hover:underline"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "Hide" : "Show"}
        </button>
      ) : null}
    </div>
  );
}

