import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck, Sparkles, Users } from "lucide-react";

import { auth } from "@/auth";
import { Card } from "@/components/ui/card";

const MICROSOFT_ROUTE = "/api/auth/signin/azure-ad";
export const dynamic = "force-dynamic";

const stats = [
  { label: "Parallel agents", value: "64", helper: "Fast & reasoning stacks" },
  { label: "Reusable context", value: "PDF · PPTX · DOCX", helper: "Persistent file library" },
];

const reasons = [
  {
    icon: Sparkles,
    copy: "Flip between GPT-5 reasoning and mini swarms without leaving the workspace.",
  },
  {
    icon: ShieldCheck,
    copy: "Conversations and uploads stay scoped to your Microsoft identity.",
  },
  {
    icon: Users,
    copy: "Judges, workers, and finalizers stay transparent for every turn.",
  },
];

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const callbackUrl = encodeURIComponent("/");

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#040713] to-black" />
        <div className="absolute -left-16 top-24 h-72 w-72 rounded-full bg-primary/30 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-blue-500/20 blur-[160px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-4 py-16 sm:px-6 lg:px-10">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_minmax(320px,380px)]">
          <div className="space-y-8 text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Private preview
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                Unlock the swarm workspace.
              </h1>
              <p className="text-base text-white/80">
                Bring multi-agent orchestration, runtime guardrails, and persistent context to every
                decision. Sign in with Microsoft 365 to join your organization’s isolated instance.
              </p>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/20 bg-white/5 p-4 backdrop-blur"
                >
                  <dt className="text-xs uppercase tracking-wide text-white/60">{stat.label}</dt>
                  <dd className="mt-2 text-3xl font-semibold text-white">{stat.value}</dd>
                  <p className="text-xs text-white/70">{stat.helper}</p>
                </div>
              ))}
            </dl>
            <div className="rounded-3xl border border-white/15 bg-black/40 p-6 shadow-2xl shadow-black/30 backdrop-blur">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
                Why sign in
              </p>
              <ul className="mt-4 space-y-3 text-sm text-white/80">
                {reasons.map((reason) => (
                  <li key={reason.copy} className="flex items-start gap-3">
                    <reason.icon className="mt-0.5 h-4 w-4 text-primary" />
                    <span>{reason.copy}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Card className="space-y-6 border border-white/20 bg-card/95 p-8 text-left shadow-2xl shadow-black/30">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Swarm Consensus
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Microsoft login required</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Only allow-listed emails can access this environment. Files and chats live within your
                tenant’s encrypted workspace.
              </p>
            </div>
            <Link
              href={`${MICROSOFT_ROUTE}?callbackUrl=${callbackUrl}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/40 transition hover:bg-primary/90"
            >
              Continue with Microsoft
              <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-xs text-muted-foreground">
              Need access added to the allow list? Email{" "}
              <a href="mailto:ops@kvikk.no" className="font-medium text-primary underline-offset-4 hover:underline">
                ops@kvikk.no
              </a>{" "}
              and include your Microsoft 365 address.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}


