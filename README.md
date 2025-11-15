# Swarm Consensus

Swarm Consensus is a production-grade swarm-orchestrated chat workspace. Each turn:

1. **Worker** agents (mini/nano OpenAI models) propose diverse answers.
2. **Judge** agents review every proposal, submit JSON votes, and generate a ranked table.
3. A **finalizer** (stronger GPT-5.x tier) rewrites the winning idea into the user-facing message.
4. The UI defaults to the final answer but exposes every candidate, vote, and rationale inside a Swarm Drawer.

## Highlights

- **Worker/Judge/Finalizer pipeline** with strong typing end-to-end (`runSwarmTurn` returns structured candidates, votes, and winning rationale).
- **Voting transparency**: Borda-style aggregation, per-judge notes, heat-mapped voting table, and agent cards inside a responsive Drawer/Mobile sheet.
- **Rich uploads**: Images, PDFs, Word, PowerPoint, and plain text files are uploaded via the OpenAI Files API and injected as `input_file` parts.
- **Modern UI/UX**: Next.js App Router + Tailwind v4 + shadcn/ui + Radix. Includes Framer Motion transitions, Sonner toasts, responsive layout, and a swarm drawer.
- **React Query orchestration**: optimistic user turns, upload pipeline, and chat mutation with clear error handling.
- **Testing**: Vitest coverage for agent selection, voting aggregation, and orchestrator pipeline (mocked OpenAI helpers).

## Stack

| Layer | Tech |
| --- | --- |
| Framework | Next.js App Router (TypeScript, Node 20) |
| Styling | Tailwind CSS v4, shadcn/ui, Radix primitives, Framer Motion |
| State/Data | React Query (TanStack Query), Sonner toasts |
| AI | OpenAI JS SDK (`responses` + file inputs) |
| Tests | Vitest |

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Create `.env.local` and populate:

   ```bash
   OPENAI_API_KEY=sk-...
   # Optional overrides (replace with real model IDs from your control panel)
   SWARM_FAST_WORKER_MODEL=gpt-5-mini
   SWARM_FAST_JUDGE_MODEL=gpt-5-mini
   SWARM_FAST_FINALIZER_MODEL=gpt-5-mini
   SWARM_REASONING_WORKER_MODEL=gpt-5.1
   SWARM_REASONING_JUDGE_MODEL=gpt-5.1
   SWARM_REASONING_FINALIZER_MODEL=gpt-5.1
   NEXT_PUBLIC_MAX_FILES=5
   NEXT_PUBLIC_MAX_FILE_SIZE_MB=25
   ```

> **NOTE:** If your OpenAI org/project doesn't yet expose the GPT‑5.1 family, override the `SWARM_*` env vars with any model IDs you *do* have access to (e.g. `gpt-4.1-mini`). Restart the server after changing them.

3. **Run the dev server**

   ```bash
   npm run dev
   ```

4. Visit `http://localhost:3000`, drop supporting files, pick an agent count, and chat.

## Architecture Overview

- `src/lib/agentsConfig.ts`
  - `WORKER_AGENTS`: up to 64 configurable personas.
  - `JUDGE_AGENTS`: 4 complementary judging profiles.
  - `selectWorkers()` clamps swarm size to `MAX_WORKERS`.
- `src/lib/orchestrator.ts`
  - `runSwarmTurn` handles worker proposals, judge voting, Borda aggregation, and finalizer synthesis.
  - `aggregateVotes` is exported (and unit tested) for predictable scoring logic.
- `src/lib/openaiClient.ts`
  - Exposes helpers `callWorkerModel`, `callJudgeModel`, `callFinalizerModel` with JSON-only responses and optional reasoning effort.
- `src/app/api/upload/route.ts`
  - Receives multipart uploads, validates MIME/size, and forwards to OpenAI Files (`purpose: responses`).
- `src/app/api/chat/route.ts`
  - Validates payloads, clamps swarm size, sanitizes history, and invokes `runSwarmTurn`, returning `{ finalAnswer, finalReasoning, candidates, votes, votingResult }`.
- `components/chat`
  - `ChatLayout` wires React Query, local state, mode toggles, and persistent conversations.
  - `MessageInput` handles files + worker slider.
  - `MessageList` displays transcript with “Swarm vote complete” badges.
  - `SwarmDrawer` + `AgentCard` visualize winners, voting breakdown, and every worker’s full answer (initial + post-discussion).

### File-aware prompting

Uploaded documents are stored via OpenAI Files and injected as `input_file` content parts for every worker/judge prompt. Conversation history is condensed to the last few turns (`MAX_HISTORY_TURNS`) to stay within token budgets.

### UI flows

- **Desktop**: future conversation list (left), chat center, latest winner card (right), plus an on-demand swarm drawer.
- **Mobile**: tabs for **Chat**, **Perspectives** (summaries), and **Settings**, with the drawer expanding full-screen.
- Each assistant reply shows the final answer, vote counts, rationale, and a “View swarm details” button opening the drawer.
- Conversation sidebar exposes Fast vs Reasoning modes and the “Agent discussion” toggle per conversation.

## Testing & Quality

Run unit tests (Vitest):

```bash
npm run test
```

- `agentsConfig` covers worker clamping + judge variety.
- `voting.test.ts` verifies Borda aggregation + score tie breaks.
- `orchestrator` test mocks OpenAI helpers to cover worker/judge/finalizer interactions.

Lint/typecheck:

```bash
npm run lint
```

## Deployment Notes

- Works on any Node 20+ runtime (no serverless-specific APIs).
- Requires `OPENAI_API_KEY` and access to the named models in your org.
- Attachments per turn default to `5` (25 MB each) but can be tuned via env vars.

### Quick Deployment Options

**Vercel**
1. Push this repo to GitHub/GitLab.
2. Create a new Vercel project from the repo.
3. Add `OPENAI_API_KEY` (and any `SWARM_*` overrides) under Project → Settings → Environment Variables.
4. Build command: `npm run build` (default). Node 20 is auto-detected.
5. Deploy; share the Vercel URL with your teammates.

**Docker / Fly.io / Render**
1. Build locally: `npm run build`.
2. Use a Dockerfile such as:
   ```Dockerfile
   FROM node:20-slim
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build
   CMD ["npm","run","start"]
   ```
3. Push the image to your registry and deploy to Fly.io, Render, or AWS ECS/Fargate.
4. Inject `OPENAI_API_KEY` + overrides via the platform’s secret/env config.

**Bare Node VM**
1. Provision an Ubuntu VM with Node 20.x.
2. Clone the repo, run `npm ci && npm run build`.
3. Start with `npm run start` managed by PM2 or systemd.
4. Put Nginx/Caddy in front for HTTPS and share the hostname internally.

## Roadmap

- Persist conversations + uploads.
- Streaming worker/judge updates.
- Server-side caching for re-used files.
- Authenticated workspaces + saved swarms.
