import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign in to FlowBoard"
      description="Kanban boards, automations, and AI — in one place."
    >
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
