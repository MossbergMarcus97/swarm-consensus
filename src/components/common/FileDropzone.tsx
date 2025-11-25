"use client";

import { CloudUpload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type FileDropzoneProps = {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  className?: string;
  children?: React.ReactNode;
};

export function FileDropzone({
  onFilesSelected,
  disabled,
  accept,
  className,
  children,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      onFilesSelected(Array.from(fileList));
    },
    [onFilesSelected],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [disabled, handleFiles],
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    setIsDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center rounded-md border border-dashed border-muted-foreground/40 px-4 py-6 text-sm text-muted-foreground transition-colors",
        isDragging && "border-primary bg-primary/5 text-primary",
        disabled && "cursor-not-allowed opacity-70",
        className,
      )}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        disabled={disabled}
        accept={accept}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      {children ? (
        children
      ) : (
        <>
          <CloudUpload className="mb-2 h-4 w-4" />
          <p className="text-center">
            Drag & drop files, or{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              disabled={disabled}
            >
              browse
            </button>
          </p>
          <p className="text-xs text-muted-foreground">
            Images, PDFs, Word, PowerPoint, or text.
          </p>
        </>
      )}
    </div>
  );
}

