import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getOpenAIClient } from "@/lib/openaiClient";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const files = await prisma.userFile.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    files: files.map((file: (typeof files)[number]) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      openAiFileId: file.openAiFileId,
      createdAt: file.createdAt.toISOString(),
    })),
  });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { fileId?: string }
    | null;

  if (!body?.fileId) {
    return NextResponse.json(
      { error: "Missing fileId in request body." },
      { status: 400 },
    );
  }

  const record = await prisma.userFile.findUnique({
    where: { id: body.fileId },
  });

  if (!record || record.userId !== session.user.id) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const client = getOpenAIClient();
  try {
    await client.files.delete(record.openAiFileId);
  } catch (error) {
    console.warn("Failed to delete OpenAI file", error);
  }

  await prisma.userFile.delete({ where: { id: record.id } });

  return NextResponse.json({ success: true });
}


