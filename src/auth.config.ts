import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

const authRoutes = ["/login", "/signup", "/forgot-password", "/reset-password"];

const authConfig = {
  pages: {
    signIn: "/login",
    newUser: "/",
  },
  providers: [],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = Boolean(auth?.user);
      const isAuthRoute = authRoutes.some((route) =>
        nextUrl.pathname.startsWith(route),
      );

      if (
        nextUrl.pathname.startsWith("/client/") ||
        nextUrl.pathname.startsWith("/api/client-portal/") ||
        nextUrl.pathname === "/api/cron/due-soon" ||
        nextUrl.pathname === "/api/billing/webhook" ||
        nextUrl.pathname === "/api/notifications" ||
        nextUrl.pathname.startsWith("/api/notifications/") ||
        nextUrl.pathname === "/api/settings/notifications" ||
        ((nextUrl.pathname.startsWith("/api/attachments/") ||
          nextUrl.pathname.startsWith("/api/design-pins/")) &&
          nextUrl.searchParams.has("share"))
      ) return true;
      if (nextUrl.pathname.startsWith("/api/auth")) return true;
      if (isAuthRoute) return true;
      if (isLoggedIn) return true;

      const loginUrl = new URL("/login", nextUrl);
      loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;

export default authConfig;
