"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ComposerAttachment,
  MessageInput,
} from "@/components/chat/MessageInput";
import { MessageList } from "@/components/chat/MessageList";
import { SwarmDrawer } from "@/components/chat/SwarmDrawer";
import { Card } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { MAX_WORKERS } from "@/lib/config";
import { loadConversations, saveConversations } from "@/lib/storage";
import type {
  ChatMessage,
  Conversation,
  MinimalHistory,
  SwarmMode,
  SwarmTurnResult,
  UploadedFileRef,
} from "@/lib/types";

const DEFAULT_CONVERSATION_TITLE = "Untitled conversation";

type ChatResponse = SwarmTurnResult & { conversationId: string };

function createConversation(
  title = DEFAULT_CONVERSATION_TITLE,
  mode: SwarmMode = "fast",
  discussionEnabled = false,
): Conversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: title || DEFAULT_CONVERSATION_TITLE,
    createdAt: now,
    updatedAt: now,
    mode,
    discussionEnabled,
    messages: [],
  };
}

export function ChatLayout() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [agentsCount, setAgentsCount] = useState(4);
  const [activeTab, setActiveTab] = useState("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSwarm, setSelectedSwarm] = useState<SwarmTurnResult | null>(
    null,
  );
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = loadConversations<Conversation>();
    let list = stored;
    if (!stored.length) {
      list = [createConversation()];
      saveConversations(list);
    }
    list = list.map((conversation) => ({
      ...conversation,
      mode: conversation.mode ?? "fast",
      discussionEnabled: conversation.discussionEnabled ?? false,
    }));
    const timer = window.setTimeout(() => {
      setConversations(list);
      setActiveConversationId(list[0]?.id ?? null);
      setIsInitialized(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [conversations, activeConversationId],
  );
  const messages = useMemo(
    () => activeConversation?.messages ?? [],
    [activeConversation],
  );
  const currentMode = activeConversation?.mode ?? "fast";
  const discussionEnabled = activeConversation?.discussionEnabled ?? false;

  const uploadMutation = useMutation({
    mutationFn: async (
      selectedFiles: ComposerAttachment[],
    ): Promise<UploadedFileRef[]> => {
      if (!selectedFiles.length) return [];
      const formData = new FormData();
      selectedFiles.forEach((item) =>
        formData.append("files", item.file, item.file.name),
      );
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to upload files.");
      }
      const payload = (await response.json()) as { files: UploadedFileRef[] };
      return payload.files ?? [];
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (payload: {
      message: string;
      files: UploadedFileRef[];
      history: MinimalHistory[];
      agentsCount: number;
      mode: SwarmMode;
      discussionEnabled: boolean;
    }): Promise<ChatResponse> => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: payload.message,
          files: payload.files,
          history: payload.history,
          agentsCount: payload.agentsCount,
          mode: payload.mode,
          discussionEnabled: payload.discussionEnabled,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Multi-agent orchestration failed.");
      }
      return (await response.json()) as ChatResponse;
    },
  });

  const isSending = uploadMutation.isPending || chatMutation.isPending;

  const latestSwarm = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const turn = messages[i];
      if (turn.swarm) {
        return turn.swarm;
      }
    }
    return null;
  }, [messages]);

  const handleSend = async ({
    message,
    attachments: pendingAttachments,
  }: {
    message: string;
    attachments: ComposerAttachment[];
  }) => {
    if (!activeConversationId) {
      toast.error("Conversation is still loading. Please wait a moment.");
      return;
    }

    if (!message.trim() && !pendingAttachments.length) {
      toast.error("Please add a message or files to send.");
      throw new Error("Empty payload.");
    }

    const historyPayload: MinimalHistory[] = messages.map((turn) => ({
      role: turn.role,
      content: turn.content,
      timestamp: turn.timestamp,
      finalAnswer: turn.swarm?.finalAnswer,
    }));

    let uploadedFiles: UploadedFileRef[] = [];
    try {
      uploadedFiles = await uploadMutation.mutateAsync(pendingAttachments);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "File upload failed.",
      );
      throw error;
    }

    const userTurn: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
      files: uploadedFiles,
    };

    setConversations((prev) => {
      const updated = prev.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              updatedAt: new Date().toISOString(),
              messages: [...conversation.messages, userTurn],
            }
          : conversation,
      );
      saveConversations(updated);
      return updated;
    });

    try {
      const result = await chatMutation.mutateAsync({
        message,
        files: uploadedFiles,
        history: historyPayload,
        agentsCount,
      mode: currentMode,
        discussionEnabled,
      });

      const assistantTurn: ChatMessage = {
        id: result.conversationId,
        role: "assistant",
        content: result.finalAnswer,
        timestamp: new Date().toISOString(),
        swarm: result,
      };

      const derivedTitle = result.title?.trim() || generateTitleFromMessage(message);

      setConversations((prev) => {
        const updated = prev.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                updatedAt: new Date().toISOString(),
                messages: [...conversation.messages, assistantTurn],
                title:
                  (conversation.title === DEFAULT_CONVERSATION_TITLE ||
                    conversation.messages.length <= 1) &&
                  derivedTitle
                    ? derivedTitle
                    : conversation.title,
              }
            : conversation,
        );
        saveConversations(updated);
        return updated;
      });
      setSelectedSwarm(result);
      setDrawerOpen(true);
      setActiveTab("chat");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to retrieve agent responses.",
      );
      throw error;
    }
  };

  const handleViewSwarm = (swarm: SwarmTurnResult) => {
    setSelectedSwarm(swarm);
    setDrawerOpen(true);
  };

  const handleModeChange = (mode: SwarmMode) => {
    if (mode === currentMode || !activeConversationId) return;
    setConversations((prev) => {
      const updated = prev.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, mode }
          : conversation,
      );
      saveConversations(updated);
      return updated;
    });
  };

  const handleDiscussionToggle = (enabled: boolean) => {
    if (!activeConversationId) return;
    setConversations((prev) => {
      const updated = prev.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, discussionEnabled: enabled }
          : conversation,
      );
      saveConversations(updated);
      return updated;
    });
  };

  const handleDeleteConversation = (conversationId: string) => {
    setConversations((prev) => {
      const filtered = prev.filter((conversation) => conversation.id !== conversationId);
      if (!filtered.length) {
        const fallback = [createConversation()];
        saveConversations(fallback);
        setActiveConversationId(fallback[0].id);
        setSelectedSwarm(null);
        return fallback;
      }
      saveConversations(filtered);
      if (conversationId === activeConversationId) {
        setActiveConversationId(filtered[0].id);
      }
      return filtered;
    });
  };

  if (!isInitialized || !activeConversationId || !activeConversation) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4 text-sm text-muted-foreground">
        Loading conversations…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-primary">Swarm Consensus</p>
        <h1 className="text-2xl font-semibold">
          Parallel perspectives for confident decisions
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload rich context, fan out up to 64 mini models, and receive a
          synthesized plan plus transparent disagreements.
        </p>
      </header>

      <div className="hidden flex-1 gap-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_360px]">
        <Card className="rounded-xl border border-border/60 bg-card/40 p-0 text-sm">
          <div className="flex items-center justify-between border-b border-border/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conversations
            </p>
            <button
              type="button"
              className="text-xs text-primary underline-offset-4 hover:underline"
              onClick={() => {
                const conversation = createConversation();
                setConversations((prev) => {
                  const updated = [conversation, ...prev];
                  saveConversations(updated);
                  return updated;
                });
                setActiveConversationId(conversation.id);
              }}
            >
              + New
            </button>
          </div>
          <div className="max-h-[calc(100vh-200px)] overflow-auto">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`flex flex-col gap-1 border-b border-border/40 p-3 text-left transition ${
                  conversation.id === activeConversationId
                    ? "bg-muted text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left text-sm font-semibold"
                    onClick={() => setActiveConversationId(conversation.id)}
                  >
                    {conversation.title}
                  </button>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-muted-foreground/10 px-2 py-0.5 capitalize text-muted-foreground">
                      {conversation.mode}
                    </span>
                    {conversation.discussionEnabled ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                        Discussion
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="text-destructive underline-offset-4 hover:underline"
                      onClick={() => handleDeleteConversation(conversation.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(conversation.updatedAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <MessageList
              messages={messages}
              isStreaming={isSending}
              onViewSwarm={handleViewSwarm}
            />
          </div>
          <div className="rounded-xl border border-border/60 bg-card/70 p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Swarm mode
              </p>
              <div className="mt-2 inline-flex rounded-full border border-border bg-background">
                {(["fast", "reasoning"] as SwarmMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      mode === currentMode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => handleModeChange(mode)}
                  >
                    {mode === "fast" ? "Fast · 5.1 mini" : "Reasoning · 5.1 thinking"}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Fast mode defaults to GPT-5.1 mini across workers/judges/finalizer. Reasoning switches
                the entire swarm to GPT-5.1 Thinking for deeper analysis (slower, costlier).
              </p>
            </div>
            <div className="rounded-lg border border-dashed border-border/80 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Agent discussion
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Let workers see each other’s proposals and refine their answers before judges vote.
                  </p>
                </div>
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    discussionEnabled
                      ? "border-green-500 bg-green-500/10 text-green-700"
                      : "border-border text-muted-foreground"
                  }`}
                  onClick={() => handleDiscussionToggle(!discussionEnabled)}
                >
                  {discussionEnabled ? "On" : "Off"}
                </button>
              </div>
            </div>
          </div>
          <MessageInput
            agentsCount={agentsCount}
            maxAgents={MAX_WORKERS}
            onAgentsChange={setAgentsCount}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            onSend={handleSend}
            isSending={isSending}
          />
        </div>

        <Card className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Latest winner
          </p>
          {latestSwarm ? (
            <div className="mt-4 space-y-3">
              <p className="text-base font-semibold">
                {latestSwarm.candidates.find(
                  (candidate) =>
                    candidate.id === latestSwarm.votingResult.winnerId,
                )?.workerName ?? "Unknown agent"}
              </p>
              <p className="text-sm text-muted-foreground">
                {latestSwarm.finalReasoning}
              </p>
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => handleViewSwarm(latestSwarm)}
              >
                Inspect swarm →
              </button>
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground">
              Run your first prompt to see the swarm ranked results.
            </p>
          )}
        </Card>
      </div>

      <div className="lg:hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="perspectives">Perspectives</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-4 space-y-4">
            <MessageList
              messages={messages}
              isStreaming={isSending}
              onViewSwarm={handleViewSwarm}
            />
            <div className="rounded-xl border border-border/60 bg-card/70 p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Swarm mode
                </p>
                <div className="mt-2 inline-flex w-full flex-wrap gap-1 rounded-full border border-border bg-background p-1">
                  {(["fast", "reasoning"] as SwarmMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`flex-1 rounded-full px-3 py-1 text-xs transition ${
                        mode === currentMode
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => handleModeChange(mode)}
                    >
                      {mode === "fast" ? "Fast · 5.1 mini" : "Reasoning · 5.1 thinking"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-border/80 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Agent discussion
                  </p>
                  <button
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      discussionEnabled
                        ? "border-green-500 bg-green-500/10 text-green-700"
                        : "border-border text-muted-foreground"
                    }`}
                    onClick={() => handleDiscussionToggle(!discussionEnabled)}
                  >
                    {discussionEnabled ? "On" : "Off"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Workers share and revise ideas before the judges weigh in.
                </p>
              </div>
            </div>
            <MessageInput
              agentsCount={agentsCount}
              maxAgents={MAX_WORKERS}
              onAgentsChange={setAgentsCount}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              onSend={handleSend}
              isSending={isSending}
            />
          </TabsContent>
          <TabsContent value="perspectives" className="mt-4">
            {latestSwarm ? (
              <Card className="space-y-3 border border-border/60 bg-card/70 p-4 text-sm">
                <p className="text-sm font-semibold">
                  Workers voted for{" "}
                  <span className="text-primary">
                    {
                      latestSwarm.candidates.find(
                        (candidate) =>
                          candidate.id === latestSwarm.votingResult.winnerId,
                      )?.workerName
                    }
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {latestSwarm.finalReasoning}
                </p>
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => handleViewSwarm(latestSwarm)}
                >
                  View details
                </button>
              </Card>
            ) : (
              <Card className="border border-dashed border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
                Swarm details will appear after your first question.
              </Card>
            )}
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <Card className="space-y-3 border border-border/60 bg-card/70 p-4 text-sm">
              <h3 className="font-semibold text-foreground">Session Settings</h3>
              <p className="text-muted-foreground">
                Active mode: <strong>{currentMode === "fast" ? "Fast" : "Reasoning"}</strong>
              </p>
              <p className="text-muted-foreground">
                Discussion: <strong>{discussionEnabled ? "Enabled" : "Disabled"}</strong>
              </p>
              <p className="text-muted-foreground">
                Max workers: {MAX_WORKERS} · Attachments per turn:{" "}
                <strong>5</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                All state is stored locally; refresh clears the transcript.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <SwarmDrawer
        open={drawerOpen && !!selectedSwarm}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setSelectedSwarm(null);
          }
        }}
        swarm={selectedSwarm}
      />
    </div>
  );
}

function generateTitleFromMessage(message: string) {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
}

