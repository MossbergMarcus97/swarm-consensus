"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import {
  MAX_FILES_PER_MESSAGE,
  MAX_WORKERS,
  SWARM_RUNTIME_BUDGET_SECONDS,
  estimateSwarmRuntimeSeconds,
} from "@/lib/config";
import { loadConversations, saveConversations } from "@/lib/storage";
import type {
  ChatMessage,
  Conversation,
  LibraryFile,
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
  webBrowsingEnabled = false,
): Conversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: title || DEFAULT_CONVERSATION_TITLE,
    createdAt: now,
    updatedAt: now,
    mode,
    discussionEnabled,
    webBrowsingEnabled,
    messages: [],
  };
}

export function ChatLayout() {
  const { data: session, status: sessionStatus } = useSession();
  const userId = session?.user?.id ?? null;
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
  const [conversationSearchQuery, setConversationSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const persistConversations = useCallback(
    (next: Conversation[]) => {
      if (!userId) return;
      saveConversations(next, userId);
    },
    [userId],
  );

  const {
    data: libraryFiles = [],
    isFetching: isLibraryLoading,
    refetch: refetchLibrary,
  } = useQuery({
    queryKey: ["user-file-library", userId],
    queryFn: async () => {
      const response = await fetch("/api/files");
      const payload = (await response.json().catch(() => ({}))) as {
        files?: LibraryFile[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load file library.");
      }
      return payload.files ?? [];
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete file.");
      }
      return true;
    },
    onSuccess: (_, fileId) => {
      void queryClient.invalidateQueries({
        queryKey: ["user-file-library", userId],
      });
      setAttachments((prev) =>
        prev.filter(
          (attachment) =>
            attachment.type !== "library" ||
            attachment.fileRef?.userFileId !== fileId,
        ),
      );
      toast.success("File removed from library.");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete the file.",
      );
    },
  });

  const attachLibraryMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await fetch("/api/files/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: [fileId] }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        files?: UploadedFileRef[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to attach file.");
      }
      const fileRef = payload.files?.[0];
      if (!fileRef) {
        throw new Error("File metadata is missing.");
      }
      return fileRef;
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (sessionStatus === "loading") {
      return;
    }
    if (!userId) {
      return;
    }
    const stored = loadConversations<Conversation>(userId);
    let list = stored;
    if (!stored.length) {
      list = [createConversation()];
      persistConversations(list);
    }
    list = list.map((conversation) => ({
      ...conversation,
      mode: conversation.mode ?? "fast",
      discussionEnabled: conversation.discussionEnabled ?? false,
      webBrowsingEnabled: conversation.webBrowsingEnabled ?? false,
    }));
    const timer = window.setTimeout(() => {
      setConversations(list);
      setConversationSearchQuery("");
      setAttachments([]);
      setSelectedSwarm(null);
      setDrawerOpen(false);
      setActiveTab("chat");
      setActiveConversationId((previous) => {
        if (previous && list.some((conversation) => conversation.id === previous)) {
          return previous;
        }
        return list[0]?.id ?? null;
      });
      setIsInitialized(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [persistConversations, sessionStatus, userId]);

  const filteredConversations = useMemo(() => {
    const term = conversationSearchQuery.trim().toLowerCase();
    if (!term) {
      return conversations;
    }
    return conversations.filter((conversation) => {
      const titleMatch = conversation.title.toLowerCase().includes(term);
      const messageMatch = conversation.messages.some((turn) =>
        turn.content.toLowerCase().includes(term),
      );
      return titleMatch || messageMatch;
    });
  }, [conversationSearchQuery, conversations]);
  const hasSearchQuery = conversationSearchQuery.trim().length > 0;
  const noConversationMatches = hasSearchQuery && filteredConversations.length === 0;

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
  const runtimeSecondsEstimate = estimateSwarmRuntimeSeconds({
    agentsCount,
    mode: currentMode,
    discussionEnabled,
  });
  const runtimeWarningThreshold = SWARM_RUNTIME_BUDGET_SECONDS * 0.85;
  const runtimeIsRisky = runtimeSecondsEstimate > runtimeWarningThreshold;
  const formattedRuntimeSeconds = Math.max(
    1,
    Math.round(runtimeSecondsEstimate),
  );
  const webBrowsingEnabled = activeConversation?.webBrowsingEnabled ?? false;

  const uploadMutation = useMutation({
    mutationFn: async (
      selectedAttachments: ComposerAttachment[],
    ): Promise<UploadedFileRef[]> => {
      const localFiles = selectedAttachments.filter(
        (attachment): attachment is Extract<ComposerAttachment, { type: "local" }> =>
          attachment.type === "local",
      );
      if (!localFiles.length) return [];
      const formData = new FormData();
      localFiles.forEach((item) => {
        formData.append("files", item.file, item.file.name);
      });
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
      webBrowsingEnabled: boolean;
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
          webBrowsingEnabled: payload.webBrowsingEnabled,
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

    const localAttachments = pendingAttachments.filter(
      (attachment): attachment is Extract<ComposerAttachment, { type: "local" }> =>
        attachment.type === "local",
    );
    const libraryAttachments = pendingAttachments.filter(
      (attachment): attachment is Extract<ComposerAttachment, { type: "library" }> =>
        attachment.type === "library",
    );

    let uploadedFiles: UploadedFileRef[] = [];
    try {
      uploadedFiles = await uploadMutation.mutateAsync(localAttachments);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "File upload failed.",
      );
      throw error;
    }

    const reusedFiles = libraryAttachments.map((attachment) => attachment.fileRef);
    const combinedFiles = [...uploadedFiles, ...reusedFiles];

    const userTurn: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
      files: combinedFiles,
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
      persistConversations(updated);
      return updated;
    });

    try {
      const result = await chatMutation.mutateAsync({
        message,
        files: combinedFiles,
        history: historyPayload,
        agentsCount,
        mode: currentMode,
        discussionEnabled,
        webBrowsingEnabled,
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
        persistConversations(updated);
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

  const handleCreateConversation = () => {
    const conversation = createConversation();
    setConversations((prev) => {
      const updated = [conversation, ...prev];
      persistConversations(updated);
      return updated;
    });
    setActiveConversationId(conversation.id);
    setConversationSearchQuery("");
  };

  const handleModeChange = (mode: SwarmMode) => {
    if (mode === currentMode || !activeConversationId) return;
    setConversations((prev) => {
      const updated = prev.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, mode }
          : conversation,
      );
      persistConversations(updated);
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
      persistConversations(updated);
      return updated;
    });
  };

  const handleWebBrowsingToggle = (enabled: boolean) => {
    if (!activeConversationId) return;
    setConversations((prev) => {
      const updated = prev.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, webBrowsingEnabled: enabled }
          : conversation,
      );
      persistConversations(updated);
      return updated;
    });
  };

  const handleDeleteConversation = (conversationId: string) => {
    setConversations((prev) => {
      const filtered = prev.filter((conversation) => conversation.id !== conversationId);
      if (!filtered.length) {
        const fallback = [createConversation()];
        persistConversations(fallback);
        setActiveConversationId(fallback[0].id);
        setSelectedSwarm(null);
        return fallback;
      }
      persistConversations(filtered);
      if (conversationId === activeConversationId) {
        setActiveConversationId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleAttachLibraryFile = async (fileId: string) => {
    if (attachments.length >= MAX_FILES_PER_MESSAGE) {
      toast.error(`You can only attach ${MAX_FILES_PER_MESSAGE} files per turn.`);
      return;
    }
    if (
      attachments.some(
        (attachment) =>
          attachment.type === "library" &&
          attachment.fileRef?.userFileId === fileId,
      )
    ) {
      toast.info("This file is already attached.");
      return;
    }
    try {
      const fileRef = await attachLibraryMutation.mutateAsync(fileId);
      setAttachments((prev) => [
        ...prev,
        { id: crypto.randomUUID(), type: "library", fileRef },
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to attach file.",
      );
    }
  };

  const handleRefreshLibrary = () => {
    if (!userId) return;
    void refetchLibrary();
  };

  const renderConversationRow = (conversation: Conversation) => (
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
  );

  if (!isInitialized || !activeConversationId || !activeConversation) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4 text-sm text-muted-foreground">
        Loading conversations…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[2200px] flex-col gap-4 px-4 pb-8 pt-4 lg:px-6 xl:px-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-primary">Swarm Consensus</p>
          <h1 className="text-2xl font-semibold leading-tight">
            Parallel perspectives for confident decisions
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload rich context, fan out up to 64 mini models, and keep the entire swarm
            in view. Adjust the panel widths as your screen grows—the center canvas scales
            with you.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-full border border-border/70 bg-card/70 px-4 py-2 text-sm">
          <div className="text-left">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate font-semibold text-foreground max-w-[220px]">
              {session?.user?.name ??
                session?.user?.email ??
                (sessionStatus === "loading" ? "Checking session…" : "Signed in")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/sign-in" })}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="hidden flex-1 gap-4 lg:grid lg:grid-cols-[minmax(250px,320px)_minmax(0,1.4fr)_minmax(320px,380px)] xl:grid-cols-[minmax(260px,360px)_minmax(0,1.6fr)_minmax(340px,420px)] 2xl:grid-cols-[minmax(280px,380px)_minmax(0,1.8fr)_minmax(360px,440px)]">
        <Card className="rounded-xl border border-border/60 bg-card/40 p-0 text-sm">
          <div className="flex items-center justify-between border-b border-border/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conversations
            </p>
            <button
              type="button"
              className="text-xs text-primary underline-offset-4 hover:underline"
              onClick={handleCreateConversation}
            >
              + New
            </button>
          </div>
          <div className="space-y-2 border-b border-border/50 p-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Search</span>
              {hasSearchQuery ? (
                <button
                  type="button"
                  className="text-[11px] font-medium lowercase text-primary underline-offset-4 hover:underline"
                  onClick={() => setConversationSearchQuery("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={conversationSearchQuery}
                onChange={(event) => setConversationSearchQuery(event.target.value)}
                placeholder="Search titles & transcripts"
                className="pl-9"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Showing {filteredConversations.length} of {conversations.length} chats.
            </p>
          </div>
          <div className="max-h-[calc(100vh-260px)] overflow-auto 2xl:max-h-[calc(100vh-220px)]">
            {noConversationMatches ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No matches for &quot;
                {conversationSearchQuery.trim()}
                &quot;. Adjust your search.
              </div>
            ) : filteredConversations.length ? (
              filteredConversations.map(renderConversationRow)
            ) : (
              <div className="p-4 text-xs text-muted-foreground">
                Start a conversation to see it here.
              </div>
            )}
          </div>
          <div className="border-t border-border/50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                File library
              </p>
              <button
                type="button"
                className="text-xs text-primary underline-offset-4 hover:underline disabled:opacity-50"
                onClick={handleRefreshLibrary}
                disabled={isLibraryLoading}
              >
                {isLibraryLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {libraryFiles.length ? (
                libraryFiles.map((file) => {
                  const isAttached = attachments.some(
                    (attachment) =>
                      attachment.type === "library" &&
                      attachment.fileRef?.userFileId === file.id,
                  );
                  return (
                    <div
                      key={file.id}
                      className="rounded-lg border border-border/50 bg-background/70 p-3 text-xs"
                    >
                      <p className="truncate text-sm font-semibold text-foreground">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatBytes(file.size)} ·{" "}
                        {new Date(file.createdAt).toLocaleDateString()}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-full border px-3 py-0.5 text-[11px] font-medium text-primary transition hover:bg-primary/10 disabled:opacity-60"
                          onClick={() => void handleAttachLibraryFile(file.id)}
                          disabled={
                            isAttached ||
                            attachments.length >= MAX_FILES_PER_MESSAGE ||
                            attachLibraryMutation.isPending
                          }
                        >
                          {isAttached ? "Attached" : "Attach"}
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-destructive/40 px-3 py-0.5 text-[11px] text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
                          onClick={() => deleteFileMutation.mutate(file.id)}
                          disabled={deleteFileMutation.isPending}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Uploaded files will appear here for reuse across conversations.
                </p>
              )}
            </div>
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4 overflow-hidden">
          <div className="flex-1 overflow-hidden min-w-0">
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
                Fast mode defaults to GPT-5 mini across workers/judges/finalizer. Reasoning switches
                the entire swarm to GPT-5 Thinking for deeper analysis.
              </p>
              <p
                className={`text-xs ${runtimeIsRisky ? "text-amber-600" : "text-muted-foreground"}`}
              >
                Est. runtime ≈ {formattedRuntimeSeconds}s (limit {SWARM_RUNTIME_BUDGET_SECONDS}s).
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
            <div className="rounded-lg border border-dashed border-border/80 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Web browsing
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Pull fresh search snippets (Tavily) for this conversation. Slower + external API usage.
                  </p>
                </div>
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    webBrowsingEnabled
                      ? "border-blue-500 bg-blue-500/10 text-blue-700"
                      : "border-border text-muted-foreground"
                  }`}
                  onClick={() => handleWebBrowsingToggle(!webBrowsingEnabled)}
                >
                  {webBrowsingEnabled ? "On" : "Off"}
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
            libraryFiles={libraryFiles}
            onAttachFromLibrary={handleAttachLibraryFile}
            onRefreshLibrary={handleRefreshLibrary}
            isLibraryLoading={isLibraryLoading || attachLibraryMutation.isPending}
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

      <div className="space-y-4 lg:hidden">
        <Card className="rounded-xl border border-border/60 bg-card/70 p-0 text-sm">
          <div className="flex items-center justify-between border-b border-border/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conversations
            </p>
            <button
              type="button"
              className="text-xs text-primary underline-offset-4 hover:underline"
              onClick={handleCreateConversation}
            >
              + New
            </button>
          </div>
          <div className="space-y-2 border-b border-border/50 p-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Search</span>
              {hasSearchQuery ? (
                <button
                  type="button"
                  className="text-[11px] font-medium lowercase text-primary underline-offset-4 hover:underline"
                  onClick={() => setConversationSearchQuery("")}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={conversationSearchQuery}
                onChange={(event) => setConversationSearchQuery(event.target.value)}
                placeholder="Search titles & transcripts"
                className="pl-9"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Showing {filteredConversations.length} of {conversations.length} chats.
            </p>
          </div>
          <div className="max-h-72 overflow-auto">
            {noConversationMatches ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No matches for &quot;
                {conversationSearchQuery.trim()}
                &quot;.
              </div>
            ) : filteredConversations.length ? (
              filteredConversations.map(renderConversationRow)
            ) : (
              <div className="p-4 text-xs text-muted-foreground">
                Start a conversation to see it here.
              </div>
            )}
          </div>
        </Card>

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
              <p
                className={`text-xs ${runtimeIsRisky ? "text-amber-600" : "text-muted-foreground"}`}
              >
                Est. runtime ≈ {formattedRuntimeSeconds}s (limit {SWARM_RUNTIME_BUDGET_SECONDS}s).
              </p>
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
            <div className="rounded-lg border border-dashed border-border/80 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Web browsing
                </p>
                <button
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    webBrowsingEnabled
                      ? "border-blue-500 bg-blue-500/10 text-blue-700"
                      : "border-border text-muted-foreground"
                  }`}
                  onClick={() => handleWebBrowsingToggle(!webBrowsingEnabled)}
                >
                  {webBrowsingEnabled ? "On" : "Off"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Fetch fresh context from the public web when crafting answers.
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
              libraryFiles={libraryFiles}
              onAttachFromLibrary={handleAttachLibraryFile}
              onRefreshLibrary={handleRefreshLibrary}
              isLibraryLoading={isLibraryLoading || attachLibraryMutation.isPending}
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

function formatBytes(bytes?: number) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "—";
  }
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[exponent]}`;
}

