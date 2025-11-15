import { NextResponse } from "next/server";

import { MAX_WORKERS } from "@/lib/config";
import { runSwarmTurn } from "@/lib/orchestrator";
import type { MinimalHistory, SwarmMode, UploadedFileRef } from "@/lib/types";

export const runtime = "nodejs";

type IncomingBody = {
  message?: string;
  agentsCount?: number;
  files?: UploadedFileRef[];
  history?: MinimalHistory[];
  conversationId?: string;
  mode?: SwarmMode;
  discussionEnabled?: boolean;
};

export async function POST(request: Request) {
  try {
    const {
      message,
      agentsCount = 4,
      files = [],
      history = [],
      mode = "fast",
      discussionEnabled = false,
      conversationId,
    }: IncomingBody = await request.json();

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }

    const safeAgentsCount = clampAgents(agentsCount);
    const sanitizedFiles = sanitizeFiles(files);
    const sanitizedHistory = sanitizeHistory(history);

    const result = await runSwarmTurn({
      userMessage: message,
      agentsCount: safeAgentsCount,
      files: sanitizedFiles,
      history: sanitizedHistory,
      mode: mode === "reasoning" ? "reasoning" : "fast",
      discussionEnabled: Boolean(discussionEnabled),
    });

    return NextResponse.json({
      conversationId: conversationId ?? crypto.randomUUID(),
      ...result,
    });
  } catch (error) {
    console.error("chat route error", error);
    return NextResponse.json(
      { error: "Unable to complete chat request." },
      { status: 500 },
    );
  }
}

function clampAgents(desired: number) {
  if (!Number.isFinite(desired)) {
    return 1;
  }
  return Math.min(Math.max(1, Math.trunc(desired)), MAX_WORKERS);
}

function sanitizeFiles(files: unknown): UploadedFileRef[] {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .filter(
      (file): file is Partial<UploadedFileRef> & Record<string, unknown> =>
        typeof file === "object" && file !== null,
    )
    .map((file) => ({
      id: typeof file.id === "string" ? file.id : crypto.randomUUID(),
      name: typeof file.name === "string" ? file.name : "Attachment",
      mimeType:
        typeof file.mimeType === "string"
          ? file.mimeType
          : "application/octet-stream",
      size: typeof file.size === "number" ? file.size : 0,
      openAiFileId:
        typeof file.openAiFileId === "string" ? file.openAiFileId : undefined,
    }));
}

function sanitizeHistory(history: unknown): MinimalHistory[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (item): item is Partial<MinimalHistory> & Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((turn) => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: typeof turn.content === "string" ? turn.content : "",
      timestamp:
        typeof turn.timestamp === "string"
          ? turn.timestamp
          : new Date().toISOString(),
      finalAnswer:
        typeof turn.finalAnswer === "string" ? turn.finalAnswer : undefined,
    }));
}

