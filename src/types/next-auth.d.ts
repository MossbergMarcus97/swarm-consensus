declare module "next-auth" {
  interface Session {
    expires: string;
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}


