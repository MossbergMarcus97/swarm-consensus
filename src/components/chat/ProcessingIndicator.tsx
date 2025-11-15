"use client";

import { motion } from "framer-motion";

const steps = [
  {
    title: "Workers proposing answers",
    description: "Parallel mini models exploring different angles.",
  },
  {
    title: "Judges ranking candidates",
    description: "Rigor, pragmatism, user impact, and safety judges vote.",
  },
  {
    title: "Finalizer composing reply",
    description: "Best candidate rewritten into the final answer.",
  },
];

export function ProcessingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border border-dashed border-border/70 bg-background/70 p-4 shadow-inner"
      aria-live="polite"
    >
      <p className="text-sm font-semibold text-foreground">
        Swarm in progress…
      </p>
      <p className="text-xs text-muted-foreground">
        Parallel workers, judges, and finalizer are collaborating on your reply.
      </p>
      <div className="mt-3 space-y-2">
        {steps.map((step, index) => (
          <div key={step.title} className="flex items-start gap-2">
            <motion.span
              className="mt-1 h-2.5 w-2.5 rounded-full bg-primary/70"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: index * 0.25,
              }}
            />
            <div>
              <p className="text-xs font-medium text-foreground">
                {step.title}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

