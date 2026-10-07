import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { signInSchema } from "@/lib/validations/auth";
import { verifyPassword } from "@/lib/auth/password";
import { ensureDefaultWorkspace } from "@/lib/workspaces";
import authConfig from "@/auth.config";

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email.toLowerCase() },
          });

          if (!user?.passwordHash) {
            return null;
          }

          const valid = await verifyPassword(
            parsed.data.password,
            user.passwordHash,
          );
          if (!valid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            tokenVersion: user.tokenVersion,
          };
        } catch (error) {
          console.error("[auth/credentials] User lookup or password verification failed", error);
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (user.id) {
        try {
          await ensureDefaultWorkspace(user.id, user.name);
        } catch (error) {
          console.error("[auth/signIn] Default workspace verification failed", error);
          throw error;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      const userId =
        user?.id ??
        (typeof token.id === "string" ? token.id : undefined);
      if (userId && process.env.NEXT_RUNTIME !== "edge") {
        let currentUser;
        try {
          currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { tokenVersion: true },
          });
        } catch (error) {
          console.error("[auth/jwt] Could not load the user's token version", error);
          throw error;
        }
        if (
          !currentUser ||
          (!user &&
            (typeof token.tokenVersion !== "number" ||
              token.tokenVersion !== currentUser.tokenVersion))
        ) {
          delete token.id;
          token.invalid = true;
        } else {
          token.id = userId;
          token.tokenVersion = currentUser.tokenVersion;
          token.invalid = false;
        }
      } else if (userId) {
        token.id = userId;
        token.tokenVersion =
          typeof user?.tokenVersion === "number" ? user.tokenVersion : 0;
        token.invalid = false;
      }
      if (trigger === "update" && session?.name) {
        token.name = session.name;
      }
      if (trigger === "update" && session && "image" in session) {
        token.picture = session.image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && !token.invalid) {
        session.user.id = token.id as string;
        session.user.tokenVersion =
          typeof token.tokenVersion === "number" ? token.tokenVersion : 0;
        session.user.image = (token.picture as string | null | undefined) ?? null;
      } else if (session.user) {
        session.user.id = "";
        session.user.tokenVersion = -1;
      }
      return session;
    },
  },
});
