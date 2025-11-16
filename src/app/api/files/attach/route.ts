import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type AttachPayload = {
  fileIds?: string[];
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as AttachPayload | null;
  const fileIds = body?.fileIds?.filter(Boolean) ?? [];
  if (!fileIds.length) {
    return NextResponse.json(
      { error: "Provide at least one fileId." },
      { status: 400 },
    );
  }

  const files = await prisma.userFile.findMany({
    where: {
      userId: session.user.id,
      id: { in: fileIds },
    },
  });

  if (!files.length) {
    return NextResponse.json({ error: "No matching files found." }, { status: 404 });
  }

  return NextResponse.json({
    files: files.map((file: (typeof files)[number]) => ({
      id: crypto.randomUUID(),
      userFileId: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      openAiFileId: file.openAiFileId,
      createdAt: file.createdAt.toISOString(),
    })),
  });
}


