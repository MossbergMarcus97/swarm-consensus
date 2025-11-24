"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
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
import { Button } from "@/components/ui/button";
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
  AIProvider,
  SwarmTurnResult,
  UploadedFileRef,
} from "@/lib/types";

const DEFAULT_CONVERSATION_TITLE = "Untitled conversation";

type ChatResponse = SwarmTurnResult & { conversationId: string };

function createConversation(
  title = DEFAULT_CONVERSATION_TITLE,
  mode: SwarmMode = "fast",
  provider: AIProvider = "openai",
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
    provider,
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
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
      provider: conversation.provider ?? "openai",
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
  const currentProvider = activeConversation?.provider ?? "openai";
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
      provider: AIProvider;
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
          provider: payload.provider,
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
        provider: currentProvider,
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

  const handleProviderChange = (provider: AIProvider) => {
    if (provider === currentProvider || !activeConversationId) return;
    setConversations((prev) => {
      const updated = prev.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, provider }
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
      className={`flex flex-col gap-1 border-b border-border/40 p-3 text-left transition cursor-pointer ${
        conversation.id === activeConversationId
          ? "bg-muted/60 text-primary"
          : "text-foreground hover:bg-muted/40"
      }`}
      onClick={() => setActiveConversationId(conversation.id)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{conversation.title}</span>
        <div className="flex items-center gap-2 text-[10px] shrink-0">
          <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
            {conversation.mode}
          </span>
          {conversation.discussionEnabled && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/50" title="Discussion On" />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{new Date(conversation.updatedAt).toLocaleDateString()}</span>
        <button
          type="button"
          className="hover:text-destructive transition-colors px-1"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteConversation(conversation.id);
          }}
        >
          Delete
        </button>
      </div>
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
    <div className="mx-auto flex h-screen w-full max-w-[2200px] overflow-hidden bg-background">
      {/* Sidebar - Desktop */}
      <div
        className={`${
          sidebarOpen ? "w-[280px] xl:w-[320px]" : "w-0"
        } hidden flex-col border-r border-border/60 bg-card/30 transition-all duration-300 ease-in-out lg:flex relative shrink-0`}
      >
        <div className={`flex flex-col h-full w-[280px] xl:w-[320px] ${!sidebarOpen && "invisible"}`}>
          <div className="p-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">Conversations</h2>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={handleCreateConversation}
            >
              <span className="text-lg leading-none mb-0.5">+</span>
            </Button>
          </div>
          
          <div className="p-3 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={conversationSearchQuery}
                onChange={(event) => setConversationSearchQuery(event.target.value)}
                placeholder="Filter..."
                className="h-8 pl-8 text-xs bg-background/50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {noConversationMatches ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No matches found.
              </div>
            ) : filteredConversations.length ? (
              <div className="flex flex-col">
                {filteredConversations.map(renderConversationRow)}
              </div>
            ) : (
              <div className="p-4 text-xs text-muted-foreground text-center">
                Start a new chat.
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border/40 bg-card/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">File Library</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-[10px]"
                onClick={handleRefreshLibrary}
                disabled={isLibraryLoading}
              >
                Refresh
              </Button>
            </div>
            <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-1">
              {libraryFiles.map((file) => {
                 const isAttached = attachments.some(
                  (attachment) =>
                    attachment.type === "library" &&
                    attachment.fileRef?.userFileId === file.id,
                );
                return (
                  <div key={file.id} className="group flex items-center justify-between rounded-md border border-border/40 bg-background/50 px-2 py-1.5">
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="text-[11px] font-medium truncate">{file.name}</p>
                      <p className="text-[9px] text-muted-foreground">{formatBytes(file.size)}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="text-[10px] text-primary hover:underline disabled:opacity-50"
                        disabled={isAttached || attachments.length >= MAX_FILES_PER_MESSAGE}
                        onClick={() => void handleAttachLibraryFile(file.id)}
                      >
                        Add
                      </button>
                      <button
                        className="text-[10px] text-destructive hover:underline"
                        onClick={() => deleteFileMutation.mutate(file.id)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )
              })}
              {!libraryFiles.length && (
                <p className="text-[10px] text-muted-foreground italic text-center py-2">Empty library</p>
              )}
            </div>
          </div>

          <div className="p-3 border-t border-border/40 flex items-center justify-between text-xs">
             <div className="flex items-center gap-2 max-w-[180px]">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                  {(session?.user?.name?.[0] ?? "U").toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{session?.user?.name ?? "User"}</span>
                  <span className="text-muted-foreground text-[10px] truncate">{session?.user?.email}</span>
                </div>
             </div>
             <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
            >
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 2C2.44772 2 2 2.44772 2 3V12C2 12.5523 2.44772 13 3 13H12C12.5523 13 13 12.5523 13 12V8.5C13 8.22386 13.2239 8 13.5 8C13.7761 8 14 8.22386 14 8.5V12C14 13.1046 13.1046 14 12 14H3C1.89543 14 1 13.1046 1 12V3C1 1.89543 1.89543 1 3 1H6.5C6.77614 1 7 1.22386 7 1.5C7 1.77614 6.77614 2 6.5 2H3ZM12.8536 2.14645C12.9015 2.19439 12.9377 2.24964 12.9621 2.30861C12.9861 2.36669 12.9996 2.4303 13 2.497L13 2.5V2.50049V5.5C13 5.77614 12.7761 6 12.5 6C12.2239 6 12 5.77614 12 5.5V3.70711L6.85355 8.85355C6.65829 9.04882 6.34171 9.04882 6.14645 8.85355C5.95118 8.65829 5.95118 8.34171 6.14645 8.14645L11.2929 3H9.5C9.22386 3 9 2.77614 9 2.5C9 2.22386 9.22386 2 9.5 2H12.4999H12.5C12.5678 2 12.6324 2.01341 12.6914 2.03794C12.7504 2.06234 12.8056 2.09851 12.8536 2.14645Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
             </Button>
          </div>
        </div>
        
        {/* Desktop Sidebar Toggle (Inside Sidebar) */}
        <div className="absolute right-[-12px] top-1/2 z-10 translate-y-[-50%]">
           <Button
            variant="outline"
            size="icon"
            className="h-6 w-6 rounded-full border shadow-sm bg-background"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <PanelLeftClose className="h-3 w-3" /> : <PanelLeftOpen className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Desktop Sidebar Toggle (When Closed) */}
      {!sidebarOpen && (
        <div className="hidden lg:block absolute left-4 top-4 z-10">
           <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-md border shadow-sm bg-background/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex min-w-0 flex-1 flex-col h-full relative">
        <header className="flex items-center justify-between border-b border-border/40 px-6 py-3 bg-background/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-2">
             {!sidebarOpen && <div className="w-8" />} {/* Spacer for toggle button */}
             <div>
               <h1 className="text-sm font-semibold text-foreground">{activeConversation.title}</h1>
               <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                 <span>{currentMode === 'fast' ? 'Fast Mode' : 'Reasoning Mode'}</span>
                 <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground" />
                 <span>{currentProvider === 'openai' ? 'OpenAI' : 'Gemini'}</span>
               </p>
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative flex flex-col">
            <div className="flex-1 min-h-0 flex flex-col">
              <MessageList
                messages={messages}
                isStreaming={isSending}
                onViewSwarm={handleViewSwarm}
              />
            </div>
            
            <div className="p-4 lg:p-6 max-w-4xl mx-auto w-full shrink-0">
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
              <div className="mt-2 text-[10px] text-center text-muted-foreground/60">
                 Swarm Runtime: ~{formattedRuntimeSeconds}s / {SWARM_RUNTIME_BUDGET_SECONDS}s
              </div>
            </div>
        </div>
      </div>

      {/* Settings / Controls Sidebar (Right Side) */}
      <div className="hidden lg:flex w-[280px] flex-col border-l border-border/60 bg-card/20 p-4 gap-6 shrink-0 overflow-y-auto">
         <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Configuration</h3>
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-lg">
                 {(["fast", "reasoning"] as SwarmMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`text-xs py-1.5 px-2 rounded-md transition-all font-medium ${
                      currentMode === mode 
                      ? "bg-background shadow-sm text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => handleModeChange(mode)}
                  >
                    {mode === "fast" ? "Fast" : "Reasoning"}
                  </button>
                 ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-lg">
               {(["openai", "gemini"] as AIProvider[]).map((provider) => (
                <button
                  key={provider}
                  className={`text-xs py-1.5 px-2 rounded-md transition-all font-medium ${
                    currentProvider === provider 
                    ? "bg-background shadow-sm text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => handleProviderChange(provider)}
                >
                  {provider === "openai" ? "OpenAI" : "Gemini"}
                </button>
               ))}
            </div>

            <div className="space-y-3 pt-2">
               <div className="flex items-center justify-between rounded-md border border-border/40 p-3 bg-background/40">
                  <div>
                    <p className="text-xs font-medium">Discussion</p>
                    <p className="text-[9px] text-muted-foreground">Inter-agent refinement</p>
                  </div>
                  <button
                    className={`w-9 h-5 rounded-full transition-colors relative ${
                      discussionEnabled ? "bg-primary" : "bg-muted"
                    }`}
                    onClick={() => handleDiscussionToggle(!discussionEnabled)}
                  >
                    <div className={`absolute top-1 left-1 bg-background w-3 h-3 rounded-full transition-transform ${
                      discussionEnabled ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </button>
               </div>

               <div className="flex items-center justify-between rounded-md border border-border/40 p-3 bg-background/40">
                  <div>
                    <p className="text-xs font-medium">Web Search</p>
                    <p className="text-[9px] text-muted-foreground">Live context retrieval</p>
                  </div>
                  <button
                    className={`w-9 h-5 rounded-full transition-colors relative ${
                      webBrowsingEnabled ? "bg-primary" : "bg-muted"
                    }`}
                    onClick={() => handleWebBrowsingToggle(!webBrowsingEnabled)}
                  >
                    <div className={`absolute top-1 left-1 bg-background w-3 h-3 rounded-full transition-transform ${
                      webBrowsingEnabled ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </button>
               </div>
            </div>
         </div>

         <div className="flex-1 rounded-xl border border-border/40 bg-card/40 p-4 flex flex-col min-h-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Latest Swarm</h3>
            {latestSwarm ? (
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                 <div>
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">Winner</p>
                    <p className="text-sm font-semibold text-primary truncate">
                      {latestSwarm.candidates.find(c => c.id === latestSwarm.votingResult.winnerId)?.workerName}
                    </p>
                 </div>
                 <div className="flex-1 min-h-0 overflow-y-auto relative pr-1">
                    <p className="text-xs text-muted-foreground line-clamp-[10]">
                      {latestSwarm.finalReasoning}
                    </p>
                 </div>
                 <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full text-xs mt-auto"
                  onClick={() => handleViewSwarm(latestSwarm)}
                >
                  View Full Details
                 </Button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center p-4 border-2 border-dashed border-border/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Run a query to see swarm analysis here.</p>
              </div>
            )}
         </div>
      </div>

      {/* Mobile / Tablet View (Tabbed) */}
      <div className="lg:hidden flex flex-col h-full w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <div className="border-b border-border/60 px-4 pt-2">
             <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Swarm Consensus</span>
                <Button variant="ghost" size="sm" onClick={() => signOut()}>Sign Out</Button>
             </div>
             <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="settings">Config</TabsTrigger>
            </TabsList>
          </div>
          
          <div className="flex-1 overflow-hidden relative bg-background">
            <TabsContent value="chat" className="h-full flex flex-col data-[state=inactive]:hidden m-0 p-0">
               <div className="flex-1 min-h-0">
                  <MessageList
                    messages={messages}
                    isStreaming={isSending}
                    onViewSwarm={handleViewSwarm}
                  />
               </div>
               <div className="p-3 border-t border-border/40 bg-card/30">
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
            </TabsContent>

            <TabsContent value="history" className="h-full overflow-y-auto p-4 data-[state=inactive]:hidden m-0">
               <div className="space-y-4">
                  <Button className="w-full" onClick={handleCreateConversation}>+ New Chat</Button>
                  <Input 
                    placeholder="Search chats..." 
                    value={conversationSearchQuery}
                    onChange={(e) => setConversationSearchQuery(e.target.value)}
                  />
                  <div className="space-y-1">
                    {filteredConversations.map(renderConversationRow)}
                  </div>
               </div>
            </TabsContent>

            <TabsContent value="settings" className="h-full overflow-y-auto p-4 data-[state=inactive]:hidden m-0">
               <Card className="p-4 space-y-6">
                  <div>
                    <h3 className="font-medium mb-2">AI Model</h3>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                       <Button 
                        variant={currentMode === "fast" ? "default" : "outline"} 
                        onClick={() => handleModeChange("fast")}
                        size="sm"
                      >
                        Fast
                      </Button>
                       <Button 
                        variant={currentMode === "reasoning" ? "default" : "outline"} 
                        onClick={() => handleModeChange("reasoning")}
                        size="sm"
                      >
                        Reasoning
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                       <Button 
                        variant={currentProvider === "openai" ? "default" : "outline"} 
                        onClick={() => handleProviderChange("openai")}
                        size="sm"
                      >
                        OpenAI
                      </Button>
                       <Button 
                        variant={currentProvider === "gemini" ? "default" : "outline"} 
                        onClick={() => handleProviderChange("gemini")}
                        size="sm"
                      >
                        Gemini
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                     <div className="flex items-center justify-between">
                        <span>Discussion Round</span>
                        <Button 
                          variant={discussionEnabled ? "default" : "secondary"}
                          onClick={() => handleDiscussionToggle(!discussionEnabled)}
                          size="sm"
                        >
                          {discussionEnabled ? "On" : "Off"}
                        </Button>
                     </div>
                     <div className="flex items-center justify-between">
                        <span>Web Browsing</span>
                        <Button 
                          variant={webBrowsingEnabled ? "default" : "secondary"}
                          onClick={() => handleWebBrowsingToggle(!webBrowsingEnabled)}
                          size="sm"
                        >
                          {webBrowsingEnabled ? "On" : "Off"}
                        </Button>
                     </div>
                  </div>
               </Card>
            </TabsContent>
          </div>
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
