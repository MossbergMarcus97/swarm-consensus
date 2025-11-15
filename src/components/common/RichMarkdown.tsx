"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type RichMarkdownProps = {
  content: string;
  className?: string;
};

export function RichMarkdown({ content, className }: RichMarkdownProps) {
  return (
    <div className={cn("rich-text", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            />
          ),
          code: ({ className, children, ...props }) => {
            const isInline = typeof className === "string" && className.includes("inline");
            return isInline ? (
              <code
                {...props}
                className="rounded bg-muted px-1 py-0.5 text-[13px]"
              >
                {children}
              </code>
            ) : (
              <code
                {...props}
                className="block rounded-md bg-muted p-3 text-sm"
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}

