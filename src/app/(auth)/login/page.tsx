import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function LoginPage() {
  return (
    <AuthShell
      variant="login"
      title="Sign in to FlowBoard"
      description="Projects, feedback, and team plans, all in one place."
    >
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white/70 dark:bg-slate-900/70" />}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
