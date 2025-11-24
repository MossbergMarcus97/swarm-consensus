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
      <DrawerContent className="h-[92vh] max-h-[92vh] flex flex-col overflow-hidden rounded-t-[20px]">
        <div className="flex-1 overflow-hidden relative flex flex-col lg:flex-row">
          
          {/* Left Column (Desktop) / Top (Mobile) - Main Content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden border-r border-border/40">
             <div className="p-6 pb-4 shrink-0">
                <DrawerHeader className="p-0 text-left space-y-1">
                  <DrawerTitle className="text-xl font-semibold">Swarm Consensus</DrawerTitle>
                  <DrawerDescription className="text-sm">
                    Analysis complete. Review the debate and final synthesis below.
                  </DrawerDescription>
                </DrawerHeader>
             </div>
             
             {swarm ? (
               <div className="flex-1 overflow-y-auto px-6 pb-6">
                  <div className="space-y-8 max-w-3xl">
                    <section>
                      <SectionHeader title="Winner" />
                      <WinnerCard swarm={swarm} />
                    </section>
                    
                    <section>
                      <SectionHeader title="Candidate Proposals" />
                      <div className="mt-4 grid gap-4">
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
               </div>
             ) : (
               <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                 No swarm data loaded.
               </div>
             )}
          </div>

          {/* Right Column (Desktop) / Bottom (Mobile) - Metadata Side Panel */}
          {swarm && (
            <div className="w-full lg:w-[380px] xl:w-[420px] flex flex-col bg-muted/10 shrink-0 border-t lg:border-t-0">
               <div className="flex-1 overflow-y-auto p-6">
                  <div className="space-y-8">
                    <section>
                      <SectionHeader title="Voting Breakdown" />
                      <div className="mt-3">
                        <Scoreboard swarm={swarm} />
                      </div>
                    </section>

                    <section>
                      <SectionHeader title="Judge Feedback" />
                      <div className="mt-3">
                        <JudgeNotesList votes={swarm.votes} />
                      </div>
                    </section>

                    {swarm.webFindings?.length ? (
                      <section>
                        <SectionHeader title="Web Context" />
                        <div className="mt-3">
                          <WebFindingsList findings={swarm.webFindings} />
                        </div>
                      </section>
                    ) : null}

                    <section>
                      <SectionHeader title="Final Rationale" />
                      <div className="mt-3 p-4 rounded-xl border border-border/60 bg-card/50 text-xs leading-relaxed text-muted-foreground">
                         <ExpandableText content={swarm.finalReasoning} previewLength={300} />
                      </div>
                    </section>
                  </div>
               </div>
            </div>
          )}
        </div>
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

  return (
    <div className="mt-3 space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-6 relative overflow-hidden">
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <Badge className="bg-primary text-primary-foreground hover:bg-primary shadow-none border-0">WINNER</Badge>
             <span className="text-xs font-mono text-primary font-semibold uppercase tracking-wider">
               {swarm.votingResult.ranking[0]?.score.toFixed(1)} PTS
             </span>
          </div>
          <h3 className="text-lg font-bold text-foreground">{winner.workerName}</h3>
          <p className="text-sm text-muted-foreground opacity-90">{winner.workerRoleDescription}</p>
        </div>
      </div>

      <div className="relative z-10">
        {showWinnerAnswer ? (
          <div className="rich-text text-sm bg-background/50 rounded-lg p-4 border border-primary/10">
            <RichMarkdown content={swarm.finalAnswer} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {truncateText(swarm.finalAnswer, 320)}
          </p>
        )}
        <button
          type="button"
          className="mt-3 text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          onClick={() => setShowWinnerAnswer((prev) => !prev)}
        >
          {showWinnerAnswer ? "Collapse Answer" : "Read Full Answer"}
          <svg 
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 ${showWinnerAnswer ? "rotate-180" : ""}`}
          >
             <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Scoreboard({ swarm }: { swarm: SwarmTurnResult }) {
  return (
    <div className="space-y-3 text-sm">
      {swarm.votingResult.ranking.map((entry, index) => {
        const candidate = swarm.candidates.find((item) => item.id === entry.candidateId);
        if (!candidate) return null;
        const isWinner = index === 0;
        return (
          <div
            key={entry.candidateId}
            className={`rounded-xl border p-3 transition-all ${
               isWinner 
               ? "bg-primary/5 border-primary/20 shadow-sm" 
               : "bg-card border-border/50 hover:bg-card/80"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                   <span className="text-xs font-mono text-muted-foreground w-4">#{index + 1}</span>
                   <p className="text-sm font-semibold truncate">{candidate.workerName}</p>
                </div>
              </div>
              <Badge variant={isWinner ? "default" : "secondary"} className="text-[10px] h-5 px-1.5">
                {entry.score.toFixed(1)}
              </Badge>
            </div>
            
            <div className="flex flex-wrap gap-1.5 pl-6">
              {swarm.votes.map((vote) => (
                <div
                  key={`${vote.id}-${entry.candidateId}`}
                  className="inline-flex items-center rounded-full border border-border/50 bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  <span className="opacity-70 mr-1">{vote.judgeName}:</span>
                  <span className="font-medium text-foreground">{formatScore(vote.scores?.[entry.candidateId])}</span>
                </div>
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
    return <p className="text-sm text-muted-foreground italic">No judge feedback recorded.</p>;
  }

  return (
    <div className="space-y-3">
      {votes.map((vote) => (
        <div key={vote.id} className="group rounded-xl border border-border/50 bg-card/40 p-3 hover:border-border/80 transition-colors">
          <div className="flex items-center gap-2 mb-1.5">
             <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                {vote.judgeName[0]}
             </div>
             <p className="text-xs font-semibold text-foreground">{vote.judgeName}</p>
          </div>
          <div className="text-xs text-muted-foreground pl-7">
             <ExpandableText content={formatJudgeNotes(vote.notes)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function WebFindingsList({
  findings,
}: {
  findings: NonNullable<SwarmTurnResult["webFindings"]>;
}) {
  return (
    <div className="space-y-3">
      {findings.map((finding, index) => (
        <div
          key={`${finding.url}-${index}`}
          className="rounded-xl border border-border/50 bg-card/40 p-3 hover:bg-card/60 transition-colors"
        >
          <a
            href={finding.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-primary hover:underline line-clamp-1 mb-1"
          >
            {finding.title || `Source ${index + 1}`}
          </a>
          <p className="text-[10px] text-muted-foreground mb-2">
            {finding.publishedAt
              ? new Date(finding.publishedAt).toLocaleDateString()
              : new URL(finding.url).hostname}
          </p>
          <div className="text-[11px] text-muted-foreground leading-snug">
             <ExpandableText content={finding.snippet} previewLength={140} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/80">
        {title}
      </h4>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

function formatScore(score: unknown) {
  if (typeof score === "number" && Number.isFinite(score)) {
    return score.toFixed(1);
  }
  if (typeof score === "string") return score;
  return "-";
}

function formatJudgeNotes(
  notes: string | Record<string, unknown> | Array<unknown> | undefined,
) {
  if (!notes) return "No specific notes provided.";
  if (typeof notes === "string") return notes;
  try {
    if (Array.isArray(notes)) {
      return notes
        .map((entry, index) => `${index + 1}. ${stringifyValue(entry)}`)
        .join(" ");
    }
    return Object.entries(notes)
      .map(([key, value]) => `${key}: ${stringifyValue(value)}`)
      .join(" ");
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
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}...`;
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
    return <span className="text-muted-foreground/50 italic">Empty</span>;
  }
  const preview = truncateText(content, previewLength);
  const needsToggle = content.length > previewLength;
  
  return (
    <span>
      {expanded || !needsToggle ? content : preview}
      {needsToggle && (
        <button
          type="button"
          className="ml-1.5 inline-flex items-center gap-0.5 text-primary hover:underline font-medium cursor-pointer"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </span>
  );
}
