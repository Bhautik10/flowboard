import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      description="No worries — we will help you get back in."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
