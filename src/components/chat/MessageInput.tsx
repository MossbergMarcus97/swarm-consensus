"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { FileChip } from "@/components/common/FileChip";
import { FileDropzone } from "@/components/common/FileDropzone";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_FILES_PER_MESSAGE } from "@/lib/config";

export type ComposerAttachment = {
  id: string;
  file: File;
};

type MessageInputProps = {
  agentsCount: number;
  maxAgents: number;
  onAgentsChange: (value: number) => void;
  attachments: ComposerAttachment[];
  onAttachmentsChange: (next: ComposerAttachment[]) => void;
  onSend: (payload: {
    message: string;
    attachments: ComposerAttachment[];
  }) => Promise<void>;
  isSending: boolean;
};

const ACCEPTED_FILES =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain";
const AGENT_PRESETS = [1, 4, 8, 16, 32, 64];

export function MessageInput({
  agentsCount,
  maxAgents,
  onAgentsChange,
  attachments,
  onAttachmentsChange,
  onSend,
  isSending,
}: MessageInputProps) {
  const [message, setMessage] = useState("");

  const canSend = message.trim().length > 0 || attachments.length > 0;

  const handleSend = useCallback(async () => {
    if (!canSend || isSending) return;
    try {
      await onSend({ message, attachments });
      setMessage("");
      onAttachmentsChange([]);
    } catch {
      // parent handles toast
    }
  }, [attachments, canSend, isSending, message, onAttachmentsChange, onSend]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const available = MAX_FILES_PER_MESSAGE - attachments.length;
      if (available <= 0) {
        toast.error(`You can only attach ${MAX_FILES_PER_MESSAGE} files per turn.`);
        return;
      }
      const nextFiles = files.slice(0, available).map((file) => ({
        id: crypto.randomUUID(),
        file,
      }));
      if (files.length > available) {
        toast.warning("Some files were skipped because they exceeded the limit.");
      }
      onAttachmentsChange([...attachments, ...nextFiles]);
    },
    [attachments, onAttachmentsChange],
  );

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      onAttachmentsChange(attachments.filter((item) => item.id !== id));
    },
    [attachments, onAttachmentsChange],
  );

  const sliderValue = useMemo(() => [agentsCount], [agentsCount]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
      <Textarea
        placeholder="Ask anything. Use ⌘+Enter or Ctrl+Enter to send."
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={onKeyDown}
        rows={4}
        disabled={isSending}
        className="resize-none bg-background/60"
      />

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <FileChip
              key={attachment.id}
              name={attachment.file.name}
              mimeType={attachment.file.type}
              size={attachment.file.size}
              onRemove={
                isSending ? undefined : () => handleRemoveAttachment(attachment.id)
              }
            />
          ))}
        </div>
      )}

      <FileDropzone
        onFilesSelected={handleFilesSelected}
        disabled={isSending}
        accept={ACCEPTED_FILES}
      />

      <Separator />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Workers</p>
          <div className="mt-2 flex flex-col gap-2">
            <Slider
              min={1}
              max={maxAgents}
              step={1}
              value={sliderValue}
              onValueChange={([value]) => onAgentsChange(value)}
              disabled={isSending}
            />
            <div className="flex flex-wrap gap-1">
              {AGENT_PRESETS.filter((preset) => preset <= maxAgents).map(
                (preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition",
                      preset === agentsCount
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary",
                    )}
                    disabled={isSending}
                    onClick={() => onAgentsChange(preset)}
                  >
                    {preset}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>

        <Button
          className="self-end"
          disabled={!canSend || isSending}
          onClick={() => void handleSend()}
        >
          {isSending ? "Thinking..." : "Send"}
        </Button>
      </div>
    </div>
  );
}

