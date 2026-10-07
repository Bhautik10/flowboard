import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tokenVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      tokenVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    tokenVersion?: number;
    invalid?: boolean;
  }
}
