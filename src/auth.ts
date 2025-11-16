import NextAuth, { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import AzureAD from "next-auth/providers/azure-ad";

const allowedEmails = (process.env.AUTH_APPROVED_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

type AzureProfile = Record<string, string | undefined>;

function extractProfileEmail(profile?: AzureProfile) {
  if (!profile) {
    return undefined;
  }
  return (
    profile.email ??
    profile.mail ??
    profile.preferred_username ??
    profile.userPrincipalName
  );
}

function extractProfileName(profile?: AzureProfile) {
  if (!profile) {
    return undefined;
  }
  return (
    profile.name ??
    profile.displayName ??
    [profile.given_name, profile.family_name].filter(Boolean).join(" ").trim()
  );
}

const requiredEnvVars = [
  "AUTH_MICROSOFT_CLIENT_ID",
  "AUTH_MICROSOFT_CLIENT_SECRET",
  "AUTH_SECRET",
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingEnvVars.length) {
  console.warn(
    `[auth] Missing environment variables: ${missingEnvVars.join(
      ", ",
    )}. Authentication will not function until they are provided.`,
  );
}

const microsoftClientId =
  process.env.AUTH_MICROSOFT_CLIENT_ID ?? "missing-client-id";
const microsoftClientSecret =
  process.env.AUTH_MICROSOFT_CLIENT_SECRET ?? "missing-client-secret";
const microsoftTenantId = process.env.AUTH_MICROSOFT_TENANT_ID;
const sessionSecret = process.env.AUTH_SECRET ?? "local-placeholder-secret";

type AppAuthOptions = Record<string, unknown>;

export const authOptions: AppAuthOptions = {
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  providers: [
    AzureAD({
      clientId: microsoftClientId,
      clientSecret: microsoftClientSecret,
      tenantId: microsoftTenantId,
    }),
  ],
  callbacks: {
    async signIn({
      profile,
    }: {
      profile?: Record<string, unknown> | null;
    }) {
      if (!allowedEmails.length) {
        return true;
      }
      const candidateProfile =
        (profile as Record<string, string | undefined>) ?? {};
      const emailCandidate =
        candidateProfile.email ??
        candidateProfile.mail ??
        candidateProfile.preferred_username;
      const email = emailCandidate?.toLowerCase();
      return email ? allowedEmails.includes(email) : false;
    },
    async jwt({
      token,
      profile,
    }: {
      token: JWT;
      profile?: Record<string, unknown> | null;
    }) {
      if (profile) {
        const azureProfile = profile as AzureProfile;
        const email = extractProfileEmail(azureProfile);
        const name = extractProfileName(azureProfile);
        if (email) {
          token.email = email.toLowerCase();
        }
        if (name) {
          token.name = name;
        }
      }
      return token;
    },
    async session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }) {
      if (session.user) {
        session.user.id = token.sub ?? session.user.email ?? undefined;
        session.user.email = token.email ?? session.user.email ?? undefined;
        session.user.name =
          token.name ?? session.user.name ?? session.user.email ?? undefined;
      }
      return session;
    },
  },
  secret: sessionSecret,
};

export function auth(): Promise<Session | null> {
  return getServerSession(authOptions as never);
}

export const authHandler = NextAuth(authOptions as never);

