"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [loading, setLoading] = useState<"credentials" | "google" | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("credentials");
    const form = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", {
        email: String(form.get("email")),
        password: String(form.get("password")),
        redirect: false,
      });
      if (result?.error) {
        toast.error("Invalid email or password");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch (error) {
      console.error("[login] Sign-in failed", error);
      toast.error("Could not sign in. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function onGoogleSignIn() {
    setLoading("google");
    try {
      await signIn("google", { callbackUrl });
    } catch (error) {
      console.error("[login] Google sign-in failed", error);
      toast.error("Google sign-in could not be started. Please try again.");
      setLoading(null);
    }
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white/90 shadow-xl shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85 dark:shadow-black/20">
      <CardHeader className="space-y-1 px-6 pb-3 pt-6 sm:px-8 sm:pt-8">
        <CardTitle className="text-lg">Your workspace is waiting</CardTitle>
        <CardDescription>Sign in with your email and password</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4 px-6 sm:px-8">
          <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required className="h-11 rounded-lg bg-white/80 dark:bg-slate-950/50" /></div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link href="/forgot-password" className="text-xs font-medium text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-300">Forgot password?</Link></div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11 rounded-lg bg-white/80 dark:bg-slate-950/50" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 px-6 pb-7 sm:px-8 sm:pb-8">
          <Button type="submit" className="h-11 w-full rounded-lg bg-indigo-600 font-semibold shadow-md shadow-indigo-600/20 hover:bg-indigo-500" disabled={loading !== null}>{loading === "credentials" ? "Signing in…" : "Sign in"}</Button>
          <div className="flex w-full items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />or continue with<span className="h-px flex-1 bg-slate-200 dark:bg-white/10" /></div>
          <Button type="button" variant="outline" className="h-11 w-full rounded-lg border-slate-300 bg-white font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/15 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:bg-white/5" disabled={loading !== null} onClick={onGoogleSignIn}>
            <GoogleMark />{loading === "google" ? "Connecting to Google…" : "Continue with Google"}
          </Button>
          <p className="pt-1 text-center text-sm text-muted-foreground">No account? <Link href="/signup" className="font-semibold text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-300">Sign up</Link></p>
        </CardFooter>
      </form>
    </Card>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-[18px] w-[18px]">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.8 27.8a12 12 0 0 1 0-7.6V15H5.9a20 20 0 0 0 0 18Z" />
      <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.9-5.9A19.7 19.7 0 0 0 24 4 20 20 0 0 0 5.9 15l6.9 5.2C14.4 15.5 18.8 12 24 12Z" />
    </svg>
  );
}
