"use client";

import { useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RichMarkdown } from "@/components/common/RichMarkdown";
import type { CandidateAnswer } from "@/lib/types";

type AgentCardProps = {
  candidate: CandidateAnswer;
  score: number;
  rank: number;
};

export function AgentCard({ candidate, score, rank }: AgentCardProps) {
  const finalAnswer =
    candidate.answer || candidate.discussionAnswer || candidate.initialAnswer || "No answer provided.";
  const finalReasoning =
    candidate.reasoning ||
    candidate.discussionReasoning ||
    candidate.initialReasoning ||
    "No reasoning provided.";
  const [showAnswer, setShowAnswer] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const hasDiscussion =
    candidate.discussionAnswer &&
    candidate.discussionAnswer !== candidate.initialAnswer &&
    candidate.discussionAnswer !== finalAnswer;

  return (
    <Card className="border-border/80 bg-card/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{candidate.workerName}</p>
          <p className="text-xs text-muted-foreground">
            {candidate.workerRoleDescription}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rank === 1 ? (
            <Badge variant="default">Winner</Badge>
          ) : (
            <Badge variant="outline">Rank {rank}</Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {score.toFixed(1)}
          </Badge>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Final answer
          </p>
          {showAnswer ? (
            <div className="rich-text mt-2 rounded-lg border border-border/60 bg-background/70 p-3">
              <RichMarkdown content={finalAnswer} />
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground">{truncate(finalAnswer, 220)}</p>
          )}
          <button
            type="button"
            className="text-xs text-primary underline-offset-4 hover:underline"
            onClick={() => setShowAnswer((prev) => !prev)}
          >
            {showAnswer ? "Hide full answer" : "Show full answer"}
          </button>
        </section>

        {hasDiscussion ? (
          <section className="text-xs text-muted-foreground">
            <p className="font-semibold uppercase tracking-wide">After discussion</p>
            {showDiscussion ? (
              <div className="rich-text mt-2 rounded-lg border border-border/60 bg-background/60 p-3">
                <RichMarkdown content={candidate.discussionAnswer!} />
              </div>
            ) : (
              <p className="mt-2 text-muted-foreground">
                {truncate(candidate.discussionAnswer!, 220)}
              </p>
            )}
            <button
              type="button"
              className="mt-2 text-xs text-primary underline-offset-4 hover:underline"
              onClick={() => setShowDiscussion((prev) => !prev)}
            >
              {showDiscussion ? "Hide refinement" : "Show refinement"}
            </button>
            {candidate.discussionReasoning ? (
              <p className="mt-1 text-[11px]">
                {showDiscussion
                  ? candidate.discussionReasoning
                  : truncate(candidate.discussionReasoning, 160)}
              </p>
            ) : null}
          </section>
        ) : null}

        <Accordion type="multiple" className="space-y-2 text-sm">
          <AccordionItem value="reasoning">
            <AccordionTrigger className="text-sm font-semibold">
              Reasoning
            </AccordionTrigger>
            <AccordionContent>
              <div className="rich-text rounded-lg border border-border/60 bg-background/70 p-3">
                <RichMarkdown content={finalReasoning} />
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="initial">
            <AccordionTrigger className="text-sm font-semibold">
              Initial proposal
            </AccordionTrigger>
            <AccordionContent>
              <div className="rich-text rounded-lg border border-border/60 bg-background/70 p-3">
                <RichMarkdown content={candidate.initialAnswer || finalAnswer} />
              </div>
              {candidate.initialReasoning ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Initial reasoning: {candidate.initialReasoning}
                </p>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </Card>
  );
}

function truncate(text: string, max: number) {
  const normalized = text?.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 1)}…`;
}

