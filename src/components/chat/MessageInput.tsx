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
    <div className="relative flex flex-col gap-2 sm:gap-3 rounded-2xl border border-border/60 bg-card/40 p-2 sm:p-3 shadow-sm backdrop-blur-sm transition-all focus-within:border-primary/40 focus-within:bg-card/60 focus-within:shadow-md">
      
      {/* Text Area */}
      <Textarea
        placeholder="Ask the swarm..."
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={isSending}
        className="min-h-[44px] sm:min-h-[48px] w-full resize-none border-0 bg-transparent p-2 text-[15px] sm:text-base focus-visible:ring-0 shadow-none placeholder:text-muted-foreground/50"
        style={{ height: message.length > 60 ? "auto" : "44px", maxHeight: "160px" }} 
      />

      {/* Attachments List */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 sm:gap-2 px-1 sm:px-2">
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
      <div className="flex items-center justify-between gap-2 px-1 pb-0.5 sm:pb-1">
        
        {/* Left Side: Attachments & Settings */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Popover open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition-transform" title="Attach File">
                <Paperclip className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80 p-0 mx-4 sm:mx-0" align="start" side="top">
               <div className="p-3 border-b border-border/40 flex items-center justify-between">
                  <h4 className="text-sm sm:text-xs font-semibold">File Library</h4>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 sm:h-6 text-xs sm:text-[10px]"
                    onClick={onRefreshLibrary}
                    disabled={isLibraryLoading}
                  >
                    Refresh
                  </Button>
               </div>
               <div className="max-h-[50vh] sm:max-h-60 overflow-y-auto p-2 space-y-1">
                  <FileDropzone
                    onFilesSelected={handleFilesSelected}
                    disabled={isSending}
                    accept={ACCEPTED_FILES}
                    className="mb-2 p-4 border-dashed border-2 border-muted hover:border-primary/50 rounded-lg transition-colors text-center cursor-pointer active:scale-[0.98]"
                  >
                     <div className="flex flex-col items-center gap-1">
                        <span className="text-sm sm:text-xs font-medium text-muted-foreground">Upload New</span>
                        <span className="text-xs sm:text-[9px] text-muted-foreground/60">Tap to select files</span>
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
                        <div key={file.id} className="flex items-center justify-between p-3 sm:p-2 rounded-lg sm:rounded-md hover:bg-muted/40 active:bg-muted/60 transition-colors">
                           <div className="min-w-0 flex-1 mr-3">
                              <p className="text-sm sm:text-xs font-medium truncate">{file.name}</p>
                              <p className="text-xs sm:text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
                           </div>
                           <Button
                              size="sm"
                              variant={isAttached ? "secondary" : "outline"}
                              className="h-8 sm:h-6 text-xs sm:text-[10px] px-3 sm:px-2"
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
                    <p className="text-sm sm:text-xs text-center text-muted-foreground py-6 sm:py-4">Library is empty.</p>
                  )}
               </div>
            </PopoverContent>
          </Popover>

          <Popover>
             <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 sm:h-8 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 border border-border/30 active:scale-95 transition-transform">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5 opacity-70">
                     <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                   </svg>
                   {agentsCount}
                </Button>
             </PopoverTrigger>
             <PopoverContent className="w-[calc(100vw-2rem)] sm:w-64 p-4 mx-4 sm:mx-0" align="start" side="top">
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Swarm Size</h4>
                      <span className="text-sm text-primary font-bold font-mono">{agentsCount}</span>
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
                    <div className="flex flex-wrap gap-2">
                      {AGENT_PRESETS.filter((preset) => preset <= maxAgents).map((preset) => (
                        <button
                          key={preset}
                          className={cn(
                            "flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-full text-xs sm:text-[10px] font-semibold transition-all active:scale-95 border-2",
                            preset === agentsCount
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-background hover:border-primary/50 hover:text-primary"
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
            "h-10 w-10 sm:h-9 sm:w-9 rounded-full transition-all duration-200 shadow-md active:scale-95",
            canSend 
              ? "opacity-100 scale-100 bg-primary hover:bg-primary/90" 
              : "opacity-50 scale-95 bg-muted text-muted-foreground hover:bg-muted"
          )}
          disabled={!canSend || isSending}
          onClick={() => void handleSend()}
        >
          {isSending ? (
             <div className="h-5 w-5 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
             <SendHorizontal className="h-5 w-5 sm:h-4 sm:w-4 ml-0.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
