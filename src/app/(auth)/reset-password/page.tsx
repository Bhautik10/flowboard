import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <AuthShell
      title="Choose a new password"
      description="Use at least 8 characters with letters and numbers."
    >
      <ResetPasswordForm token={params.token ?? ""} />
    </AuthShell>
  );
}
