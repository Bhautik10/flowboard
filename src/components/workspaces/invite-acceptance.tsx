"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type InviteResult = {
  invite: {
    email: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
    workspace: { name: string };
  };
};

export function InviteAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const response = await fetch(`/api/invites/${token}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Invitation could not be loaded");
      }
      return result as InviteResult;
    },
  });
  const accept = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/invites/${token}`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Invitation could not be accepted");
      }
      return result as { workspaceId: string };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("You joined the workspace");
      router.push("/");
      router.refresh();
    },
    onError: (cause: Error) => toast.error(cause.message),
  });

  return (
    <div className="mx-auto mt-12 max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold">Workspace invitation</h1>
      {isPending ? (
        <div className="mx-auto mt-6 h-16 w-full animate-pulse rounded bg-muted" aria-label="Loading invitation" />
      ) : error ? (
        <>
          <p className="mt-4 text-sm text-destructive">{error.message}</p>
          {error.message.includes("Sign in") && (
            <Button asChild className="mt-5">
              <Link href={`/login?callbackUrl=${encodeURIComponent(`/invites/${token}`)}`}>Sign in to accept</Link>
            </Button>
          )}
        </>
      ) : data ? (
        <>
          <p className="mt-4 text-muted-foreground">
            You were invited to join <strong className="text-foreground">{data.invite.workspace.name}</strong> as a{" "}
            {data.invite.role.toLowerCase()} using {data.invite.email}.
          </p>
          <Button className="mt-6" disabled={accept.isPending} onClick={() => accept.mutate()}>
            {accept.isPending ? "Joining…" : "Accept invitation"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
