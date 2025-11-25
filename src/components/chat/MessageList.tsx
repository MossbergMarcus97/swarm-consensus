"use client";

import { useEffect, useRef } from "react";

import { FileChip } from "@/components/common/FileChip";
import { RichMarkdown } from "@/components/common/RichMarkdown";
import { ProcessingIndicator } from "@/components/chat/ProcessingIndicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-4">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Welcome to Swarm Consensus
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Start a conversation by asking a question. The swarm will recruit specialized agents, 
            debate the best approach, and vote on the final answer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full px-3 py-4 sm:px-4 sm:py-6 lg:px-8">
      <div ref={contentRef} className="flex flex-col gap-6 sm:gap-8 max-w-4xl mx-auto pb-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex flex-col gap-1.5 sm:gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
            
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
              <span className="font-medium">{message.role === "user" ? "You" : "Swarm"}</span>
              <span className="opacity-50">•</span>
              <time dateTime={message.timestamp}>
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>

            <div 
              className={`relative rounded-2xl px-4 py-3 sm:px-5 sm:py-4 shadow-sm max-w-[92%] sm:max-w-[90%] lg:max-w-[85%] ${
                message.role === "user" 
                  ? "bg-primary text-primary-foreground rounded-tr-sm" 
                  : "bg-card border border-border/50 text-foreground rounded-tl-sm"
              }`}
            >
              <div className={`rich-text text-[13px] sm:text-sm leading-relaxed ${message.role === "user" ? "prose-invert" : ""}`}>
                <RichMarkdown content={message.content} />
              </div>
            </div>

            {message.files?.length ? (
              <div className={`flex flex-wrap gap-1.5 sm:gap-2 max-w-[92%] sm:max-w-[90%] ${message.role === "user" ? "justify-end" : "justify-start"}`}>
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
              <div className="mt-1 flex flex-col gap-2.5 rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/20 p-3 text-xs text-muted-foreground w-full max-w-[92%] sm:max-w-[85%]">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground text-[13px]">Consensus Reached</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] sm:text-[10px] h-5 px-1.5 font-normal bg-background/50">
                        {message.swarm.candidates.length} workers
                      </Badge>
                      <Badge variant="outline" className="text-[9px] sm:text-[10px] h-5 px-1.5 font-normal bg-background/50">
                        {message.swarm.votes.length} judges
                      </Badge>
                    </div>
                  </div>
                  <p className="line-clamp-2 sm:line-clamp-1 text-[11px] sm:text-xs opacity-80">
                    {message.swarm.finalReasoning}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 sm:h-7 text-xs w-full sm:w-auto whitespace-nowrap bg-background hover:bg-background/80 shadow-sm border border-border/50 font-medium"
                  onClick={() => onViewSwarm(message.swarm!)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5 sm:hidden">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  View Swarm Details
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        
        {isStreaming && (
          <div className="flex flex-col gap-1.5 sm:gap-2 items-start max-w-[92%] sm:max-w-[85%]">
             <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
              <span className="font-medium">Swarm Working</span>
            </div>
            <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3 sm:px-5 sm:py-4 shadow-sm w-full">
              <ProcessingIndicator />
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
