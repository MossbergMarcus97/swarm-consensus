"use client";

"use client";

import { useEffect, useRef } from "react";

import { FileChip } from "@/components/common/FileChip";
import { RichMarkdown } from "@/components/common/RichMarkdown";
import { ProcessingIndicator } from "@/components/chat/ProcessingIndicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage, SwarmTurnResult } from "@/lib/types";

type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  onViewSwarm: (swarm: SwarmTurnResult) => void;
};

export function MessageList({
  messages,
  isStreaming,
  onViewSwarm,
}: MessageListProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = contentRef.current?.parentElement;
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isStreaming]);

  if (!messages.length) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-2 border-dashed text-center text-muted-foreground">
        <p className="text-lg font-semibold text-foreground">
          Swarm Consensus
        </p>
        <p className="max-w-md text-sm">
          Upload supporting documents, pick a swarm size, and ask a question to
          receive a swarm-voted answer plus transparent worker/judge details.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex h-full min-h-[520px] min-w-0 flex-col">
      <ScrollArea className="flex-1 px-6 py-6">
        <div ref={contentRef} className="flex flex-col gap-6">
          {messages.map((message) => (
            <div key={message.id} className="space-y-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                <span>{message.role === "user" ? "You" : "Swarm Decision"}</span>
                <time dateTime={message.timestamp}>
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 shadow-sm">
                <RichMarkdown content={message.content} />
              </div>

              {message.files?.length ? (
                <div className="flex flex-wrap gap-2">
                  {message.files.map((file) => (
                    <FileChip
                      key={file.id}
                      name={file.name}
                      mimeType={file.mimeType}
                      size={file.size}
                    />
                  ))}
                </div>
              ) : null}

              {message.swarm ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/60 p-3 text-xs text-muted-foreground">
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">
                      Swarm vote complete
                    </span>
                    <span>
                      {message.swarm.candidates.length} workers ·{" "}
                      {message.swarm.votes.length} judges
                    </span>
                    <span className="text-foreground/80">
                      {message.swarm.finalReasoning}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => onViewSwarm(message.swarm!)}
                  >
                    View swarm details
                  </Button>
                </div>
              ) : message.role === "assistant" ? (
                <Badge variant="secondary">Assistant response</Badge>
              ) : null}
            </div>
          ))}
          {isStreaming ? <ProcessingIndicator /> : null}
        </div>
      </ScrollArea>
    </Card>
  );
}

