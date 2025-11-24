import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  MAX_WORKERS,
  SWARM_RUNTIME_BUDGET_SECONDS,
  estimateSwarmRuntimeSeconds,
} from "@/lib/config";
import { runSwarmTurn } from "@/lib/orchestrator";
import { prisma } from "@/lib/prisma";
import type {
  MinimalHistory,
  SwarmMode,
  UploadedFileRef,
} from "@/lib/types";

export const runtime = "nodejs";

type IncomingBody = {
  message?: string;
  agentsCount?: number;
  files?: UploadedFileRef[];
  history?: MinimalHistory[];
  conversationId?: string;
  mode?: SwarmMode;
  provider?: string; // Using string loosely to avoid tight coupling on import if types aren't shared perfectly in route
  discussionEnabled?: boolean;
  webBrowsingEnabled?: boolean;
};

type UserFileRecord = Awaited<
  ReturnType<typeof prisma.userFile.findMany>
>[number];

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      message,
      agentsCount = 4,
      files = [],
      history = [],
      mode = "fast",
      provider = "openai",
      discussionEnabled = false,
      webBrowsingEnabled = false,
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
    let verifiedFiles: UploadedFileRef[] = [];
    const estimatedSeconds = estimateSwarmRuntimeSeconds({
      agentsCount: safeAgentsCount,
      mode: mode === "reasoning" ? "reasoning" : "fast",
      discussionEnabled: Boolean(discussionEnabled),
    });

    if (estimatedSeconds > SWARM_RUNTIME_BUDGET_SECONDS) {
      const rounded = Math.round(estimatedSeconds);
      return NextResponse.json(
        {
          error:
            `This swarm configuration will likely exceed the current hosting budget ` +
            `(${rounded}s > ${SWARM_RUNTIME_BUDGET_SECONDS}s). ` +
            `Reduce workers, turn off discussion, or switch to Fast mode.`,
        },
        { status: 400 },
      );
    }

    try {
      verifiedFiles = await resolveUserFiles(sanitizedFiles, session.user.id);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to verify attached files.",
        },
        { status: 400 },
      );
    }
    const sanitizedHistory = sanitizeHistory(history);

    const result = await runSwarmTurn({
      userMessage: message,
      agentsCount: safeAgentsCount,
      files: verifiedFiles,
      history: sanitizedHistory,
      mode: mode === "reasoning" ? "reasoning" : "fast",
      provider: provider === "gemini" ? "gemini" : "openai",
      discussionEnabled: Boolean(discussionEnabled),
      webBrowsingEnabled: Boolean(webBrowsingEnabled),
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
      userFileId:
        typeof file.userFileId === "string" ? file.userFileId : undefined,
      openAiFileId:
        typeof file.openAiFileId === "string" ? file.openAiFileId : undefined,
      createdAt:
        typeof file.createdAt === "string" ? file.createdAt : undefined,
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

async function resolveUserFiles(files: UploadedFileRef[], userId: string) {
  const libraryIds = files
    .map((file) => file.userFileId)
    .filter((id): id is string => Boolean(id));

  if (!libraryIds.length) {
    return files;
  }

  const records: UserFileRecord[] = await prisma.userFile.findMany({
    where: {
      userId,
      id: { in: libraryIds },
    },
  });

  const recordMap = new Map(
    records.map((item: (typeof records)[number]) => [item.id, item]),
  );

  const missing = libraryIds.filter((id) => !recordMap.has(id));
  if (missing.length) {
    throw new Error("One or more files could not be found.");
  }

  return files.map((file) => {
    if (file.userFileId && recordMap.has(file.userFileId)) {
      const record = recordMap.get(file.userFileId)!;
      return {
        ...file,
        name: record.name,
        mimeType: record.mimeType,
        size: record.size,
        openAiFileId: record.openAiFileId,
        createdAt: record.createdAt.toISOString(),
      };
    }
    return file;
  });
}

