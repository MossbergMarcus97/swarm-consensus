"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Paperclip, SendHorizontal, X } from "lucide-react";

import { FileChip } from "@/components/common/FileChip";
import { FileDropzone } from "@/components/common/FileDropzone";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_FILES_PER_MESSAGE } from "@/lib/config";
import type { LibraryFile, UploadedFileRef } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ComposerAttachment =
  | {
      id: string;
      type: "local";
      file: File;
    }
  | {
      id: string;
      type: "library";
      fileRef: UploadedFileRef;
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
  libraryFiles: LibraryFile[];
  onAttachFromLibrary: (fileId: string) => Promise<void>;
  onRefreshLibrary: () => void;
  isLibraryLoading: boolean;
};

const ACCEPTED_FILES =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain";
const AGENT_PRESETS = [1, 4, 8, 16, 32, 64];

function formatBytes(bytes?: number) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB"];
  if (bytes === 0) return "0 B";
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[exponent]}`;
}

export function MessageInput({
  agentsCount,
  maxAgents,
  onAgentsChange,
  attachments,
  onAttachmentsChange,
  onSend,
  isSending,
  libraryFiles,
  onAttachFromLibrary,
  onRefreshLibrary,
  isLibraryLoading,
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const canSend = message.trim().length > 0 || attachments.length > 0;
  const attachmentSlotsRemaining = MAX_FILES_PER_MESSAGE - attachments.length;

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
        type: "local" as const,
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
    <div className="relative flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 shadow-sm backdrop-blur-sm transition-all focus-within:border-primary/40 focus-within:bg-card/60 focus-within:shadow-md">
      
      {/* Text Area */}
      <Textarea
        placeholder="Ask the swarm..."
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={isSending}
        className="min-h-[48px] w-full resize-none border-0 bg-transparent p-2 text-base focus-visible:ring-0 shadow-none placeholder:text-muted-foreground/50"
        style={{ height: message.length > 60 ? "auto" : "48px", maxHeight: "200px" }} 
      />

      {/* Attachments List */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2">
          {attachments.map((attachment) => (
            <FileChip
              key={attachment.id}
              name={
                attachment.type === "local"
                  ? attachment.file?.name ?? "Untitled"
                  : attachment.fileRef?.name ?? "Untitled"
              }
              mimeType={
                attachment.type === "local"
                  ? attachment.file?.type
                  : attachment.fileRef?.mimeType
              }
              size={
                attachment.type === "local"
                  ? attachment.file?.size
                  : attachment.fileRef?.size
              }
              onRemove={
                isSending ? undefined : () => handleRemoveAttachment(attachment.id)
              }
            />
          ))}
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        
        {/* Left Side: Attachments & Settings */}
        <div className="flex items-center gap-2">
          <Popover open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60" title="Attach File">
                <Paperclip className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start" side="top">
               <div className="p-3 border-b border-border/40 flex items-center justify-between">
                  <h4 className="text-xs font-semibold">File Library</h4>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-[10px]"
                    onClick={onRefreshLibrary}
                    disabled={isLibraryLoading}
                  >
                    Refresh
                  </Button>
               </div>
               <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                  <FileDropzone
                    onFilesSelected={handleFilesSelected}
                    disabled={isSending}
                    accept={ACCEPTED_FILES}
                    className="mb-2 p-4 border-dashed border-2 border-muted hover:border-primary/50 rounded-lg transition-colors text-center cursor-pointer"
                  >
                     <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-medium text-muted-foreground">Upload New</span>
                        <span className="text-[9px] text-muted-foreground/60">Drag & drop or click</span>
                     </div>
                  </FileDropzone>
                  
                  {libraryFiles.length > 0 ? (
                    libraryFiles.map((file) => {
                      const isAttached = attachments.some(
                        (attachment) =>
                          attachment.type === "library" &&
                          attachment.fileRef?.userFileId === file.id,
                      );
                      return (
                        <div key={file.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/40 transition-colors group">
                           <div className="min-w-0 flex-1 mr-3">
                              <p className="text-xs font-medium truncate">{file.name}</p>
                              <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
                           </div>
                           <Button
                              size="sm"
                              variant={isAttached ? "secondary" : "outline"}
                              className="h-6 text-[10px] px-2"
                              disabled={isAttached || attachmentSlotsRemaining <= 0}
                              onClick={() => {
                                void onAttachFromLibrary(file.id);
                                setIsLibraryOpen(false);
                              }}
                           >
                              {isAttached ? "Added" : "Add"}
                           </Button>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-xs text-center text-muted-foreground py-4">Library is empty.</p>
                  )}
               </div>
            </PopoverContent>
          </Popover>

          <Popover>
             <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 border border-transparent hover:border-border/40">
                   {agentsCount} Workers
                </Button>
             </PopoverTrigger>
             <PopoverContent className="w-64 p-4" align="start" side="top">
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Swarm Size</h4>
                      <span className="text-xs text-muted-foreground font-mono">{agentsCount}</span>
                   </div>
                   <Slider
                      min={1}
                      max={maxAgents}
                      step={1}
                      value={sliderValue}
                      onValueChange={([value]) => onAgentsChange(value)}
                      disabled={isSending}
                      className="py-2"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {AGENT_PRESETS.filter((preset) => preset <= maxAgents).map((preset) => (
                        <button
                          key={preset}
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-medium transition-colors border",
                            preset === agentsCount
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:border-primary hover:text-primary"
                          )}
                          onClick={() => onAgentsChange(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                </div>
             </PopoverContent>
          </Popover>
        </div>

        {/* Right Side: Send Button */}
        <Button
          size="icon"
          className={cn(
            "h-9 w-9 rounded-full transition-all duration-200 shadow-sm",
            canSend ? "opacity-100 scale-100" : "opacity-50 scale-95 bg-muted text-muted-foreground hover:bg-muted"
          )}
          disabled={!canSend || isSending}
          onClick={() => void handleSend()}
        >
          {isSending ? (
             <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
             <SendHorizontal className="h-4 w-4 ml-0.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
