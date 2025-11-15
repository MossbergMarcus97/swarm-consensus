import { NextResponse } from "next/server";

import OpenAI from "openai";

import { MAX_FILE_SIZE_MB, MAX_FILES_PER_MESSAGE } from "@/lib/config";
import { getOpenAIClient } from "@/lib/openaiClient";
import type { UploadedFileRef } from "@/lib/types";

export const runtime = "nodejs";

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

const MAX_FILE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const incomingFiles = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (!incomingFiles.length) {
      return NextResponse.json(
        { error: "No files detected in request." },
        { status: 400 },
      );
    }

    if (incomingFiles.length > MAX_FILES_PER_MESSAGE) {
      return NextResponse.json(
        {
          error: `You can upload up to ${MAX_FILES_PER_MESSAGE} files per message.`,
        },
        { status: 400 },
      );
    }

    const client = getOpenAIClient();
    const uploaded: UploadedFileRef[] = [];

    for (const file of incomingFiles) {
      if (!SUPPORTED_MIME_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type}.` },
          { status: 415 },
        );
      }

      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          {
            error: `${file.name} exceeds the ${MAX_FILE_SIZE_MB}MB limit.`,
          },
          { status: 413 },
        );
      }

      const uploadable = await OpenAI.toFile(file, file.name);
      const uploadedFile = await client.files.create({
        file: uploadable,
        purpose: "assistants",
      });

      uploaded.push({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type,
        size: file.size,
        openAiFileId: uploadedFile.id,
      });
    }

    return NextResponse.json({ files: uploaded });
  } catch (error) {
    console.error("Upload error", error);
    return NextResponse.json(
      { error: "Failed to upload files. Please try again." },
      { status: 500 },
    );
  }
}

