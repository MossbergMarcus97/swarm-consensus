# Swarm Consensus

Swarm Consensus is a production-grade swarm-orchestrated chat workspace. Each turn:

1. **Worker** agents (mini/nano OpenAI models) propose diverse answers.
2. **Judge** agents review every proposal, submit JSON votes, and generate a ranked table.
3. A **finalizer** (stronger GPT-5.x tier) rewrites the winning idea into the user-facing message.
4. The UI defaults to the final answer but exposes every candidate, vote, and rationale inside a Swarm Drawer.

## Highlights

- **Worker/Judge/Finalizer pipeline** with strong typing end-to-end (`runSwarmTurn` returns structured candidates, votes, winning rationale, and optional web results).
- **Voting transparency**: Borda-style aggregation, per-judge notes, heat-mapped voting table, and agent cards inside a responsive Drawer/Mobile sheet.
- **Microsoft Entra ID login**: NextAuth + Azure AD provider with allow-listed emails so only approved teammates can access the swarm UI.
- **Persistent file library**: Uploads are pushed to OpenAI Files *and* recorded in Postgres via Prisma so Any user can re-attach prior files across conversations without re-uploading.
- **Web browsing toggle**: Optional Tavily search summaries are injected into worker/judge/finalizer prompts for live context.
- **Modern UI/UX**: Next.js App Router + Tailwind v4 + shadcn/ui + Radix + Framer Motion + Sonner toasts. Desktop = tri-column layout, mobile = tabbed view.
- **React Query orchestration**: optimistic user turns, upload pipeline, swarm mutation, conversation persistence, and offline-safe localStorage.
- **Testing**: Vitest coverage for agent selection, voting aggregation, orchestrator pipeline (mocked OpenAI + web search helpers).

## Stack

| Layer | Tech |
| --- | --- |
| Framework | Next.js App Router (TypeScript, Node 20) |
| Styling | Tailwind CSS v4, shadcn/ui, Radix primitives, Framer Motion |
| State/Data | React Query (TanStack Query), Sonner toasts |
| Data layer | Prisma ORM + Postgres/Neon (file library) |
| AI | OpenAI JS SDK (`responses` + file inputs) |
| Tests | Vitest |

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Create `.env.local` and populate the essentials:

   ```bash
   # OpenAI
   OPENAI_API_KEY=sk-...
  SWARM_FAST_WORKER_MODEL=gpt-5.1          # override if your org uses different IDs
  SWARM_FAST_JUDGE_MODEL=gpt-5.1
  SWARM_FAST_FINALIZER_MODEL=gpt-5.1
  SWARM_REASONING_WORKER_MODEL=gpt-5.1
  SWARM_REASONING_JUDGE_MODEL=gpt-5.1
  SWARM_REASONING_FINALIZER_MODEL=gpt-5.1
   NEXT_PUBLIC_MAX_FILES=5
   NEXT_PUBLIC_MAX_FILE_SIZE_MB=25

   # Authentication (Microsoft Entra ID)
   AUTH_MICROSOFT_CLIENT_ID=...
   AUTH_MICROSOFT_CLIENT_SECRET=...
   AUTH_MICROSOFT_TENANT_ID=common            # or your tenant GUID
   AUTH_SECRET=generate-a-long-random-string
   AUTH_APPROVED_EMAILS=you@example.com,teammate@example.com

   # Database (file library via Prisma/Postgres)
   DATABASE_URL=postgresql://user:pass@host:5432/swarm?schema=public

   # Web browsing (Tavily)
   TAVILY_API_KEY=tvly-...
   SWARM_RUNTIME_BUDGET_SECONDS=280          # lower this if your host has tighter limits
   ```

  > **Model availability:** If your OpenAI org/project doesn't expose GPT‑5.x yet, override the `SWARM_*` env vars with the models you *do* have access to (e.g. `gpt-4.1-mini`). Restart the dev server after changing them.
  >
  > **Reasoning effort presets:** Fast mode now runs `gpt-5.1` with `reasoning_effort=none` (per [latest-model guidance](https://platform.openai.com/docs/guides/latest-model)). Reasoning mode keeps the same model but requests `reasoning_effort=high` for deeper chains of thought.
>
> **Runtime budget:** Vercel’s Node runtime caps requests at 300 s. The `SWARM_RUNTIME_BUDGET_SECONDS` guard (default 280) keeps heavy swarms from triggering timeouts—reduce it further if you host on infra with smaller limits.

3. **Apply Prisma migrations**

   ```bash
   npx prisma migrate dev --name init
   ```

   Point `DATABASE_URL` at your preferred Postgres provider (Neon, Supabase, RDS, etc.). For Vercel you can use the built-in Postgres integration or Neon.

4. **Run the dev server**

   ```bash
   npm run dev
   ```

5. Visit `http://localhost:3000`, sign in with a permitted Microsoft account, drop supporting files, toggle fast vs reasoning vs browsing, and chat.

## Architecture Overview

- `src/lib/agentsConfig.ts`
  - `WORKER_AGENTS`: up to 64 configurable personas.
  - `JUDGE_AGENTS`: 4 complementary judging profiles.
  - `selectWorkers()` clamps swarm size to `MAX_WORKERS`.
- `src/lib/orchestrator.ts`
  - `runSwarmTurn` handles worker proposals, judge voting, Borda aggregation, and finalizer synthesis.
  - `aggregateVotes` is exported (and unit tested) for predictable scoring logic.
  - Injects Tavily search summaries when the “Web browsing” toggle is enabled.
- `src/lib/openaiClient.ts`
  - Exposes helpers `callWorkerModel`, `callJudgeModel`, `callFinalizerModel` with JSON-only responses and optional reasoning effort.
- `src/lib/prisma.ts` + `prisma/schema.prisma`
  - Prisma client + `UserFile` model (id, owner, OpenAI file ID, metadata).
- `src/app/api/upload/route.ts`
  - Receives multipart uploads, validates MIME/size, forwards to OpenAI Files, and records metadata in Postgres for re-use.
- `src/app/api/chat/route.ts`
  - Validates payloads, clamps swarm size, sanitizes history, and invokes `runSwarmTurn`, returning `{ finalAnswer, finalReasoning, candidates, votes, votingResult }`.
- `src/app/api/files/*`
  - `GET /api/files` lists the signed-in user’s library.
  - `DELETE /api/files` removes a file (OpenAI + DB).
  - `POST /api/files/attach` validates ownership and returns attachment metadata when reusing saved files.
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

### Authentication & authorization

- NextAuth App Router handler lives in `src/auth.ts`.
- Provider: Microsoft Entra ID (Azure AD). Configure an app registration, add redirect URI `https://YOUR_HOST/api/auth/callback/azure-ad`, and copy the client ID/secret.
- `AUTH_APPROVED_EMAILS` is a comma-separated allow list to keep the app internal-only.
- Middleware guards every route (including APIs) and redirects unauthenticated users to `/sign-in`.

### Persistent file library

- Uploads hit `/api/upload`, stream to OpenAI Files, and immediately persist metadata (`UserFile`) in Postgres.
- Users can browse/delete saved files via the sidebar + composer. Attachments no longer re-upload if already in the library.
- Conversation payloads verify that attached file IDs belong to the current user before passing them to the orchestrator.

### Web browsing toggle

- Enabling “Web browsing” in the sidebar makes a single Tavily search call per turn (`src/lib/tools/webSearch.ts`).
- Summaries are injected into worker, judge, and finalizer prompts; the Swarm Drawer displays the resulting citations.
- Provide `TAVILY_API_KEY` to use the feature; otherwise it gracefully no-ops.

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
- Long-running swarms are capped by `SWARM_RUNTIME_BUDGET_SECONDS` so Vercel (300 s limit) doesn’t kill the request. Increase the budget only if your hosting plan allows longer execution or move the orchestration to a background worker.

### Quick Deployment Options

**Vercel**
1. Push this repo to GitHub/GitLab.
2. Create a new Vercel project from the repo.
3. Provision a Postgres database (Vercel Postgres or Neon) and set `DATABASE_URL`.
4. Add all required env vars (`OPENAI_API_KEY`, `SWARM_*` overrides, `AUTH_*`, `DATABASE_URL`, `TAVILY_API_KEY`, file limits).
5. Build command: `npm run build` (default). Node 20 is auto-detected. Run `npx prisma migrate deploy` as a post-build script if desired.
6. Configure your Microsoft Entra ID app’s redirect URI to `https://your-vercel-domain/api/auth/callback/azure-ad`.
7. Deploy; invite teammates by adding their emails to `AUTH_APPROVED_EMAILS`.

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

- Streaming worker/judge updates over SSE/WebSockets.
- Org-wide dashboards (saved swarms, metrics, replay).
- Cost controls + per-conversation model overrides.