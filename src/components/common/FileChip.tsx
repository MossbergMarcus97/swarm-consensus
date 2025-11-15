"use client";

import { Loader2, Paperclip, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type FileChipProps = {
  name: string;
  mimeType?: string;
  size?: number;
  status?: "idle" | "uploading" | "error";
  onRemove?: () => void;
  className?: string;
};

export function FileChip({
  name,
  mimeType,
  size,
  status = "idle",
  onRemove,
  className,
}: FileChipProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-dashed border-border bg-muted/60 px-3 py-1 text-sm text-muted-foreground",
        status === "error" && "border-destructive/60 text-destructive",
        className,
      )}
    >
      <Paperclip className="h-3.5 w-3.5" />
      <span className="max-w-[180px] truncate font-medium text-foreground">
        {name}
      </span>
      <Badge variant="secondary" className="text-[11px] capitalize">
        {mimeType ? mimeType.split("/").pop() : "file"}
      </Badge>
      {typeof size === "number" && (
        <span className="text-xs text-muted-foreground">
          {formatBytes(size)}
        </span>
      )}
      {status === "uploading" && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
      {onRemove && (
        <button
          type="button"
          className="rounded-full p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
          onClick={onRemove}
          aria-label="Remove file"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[exponent]}`;
}

