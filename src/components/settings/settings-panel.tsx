"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SettingsResponse = {
  user: {
    name: string | null;
    email: string;
    image: string | null;
    bio: string | null;
    theme: "light" | "dark" | "system";
    accentColor: string | null;
    defaultWorkspaceId: string | null;
    hasPassword: boolean;
  };
  workspaces: Array<{ id: string; name: string; role: string }>;
};
type WorkspaceMembersResponse = {
  members: Array<{
    userId: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "CLIENT";
    joinedAt: string;
    user: { name: string | null; email: string; image: string | null };
  }>;
  invites: Array<{
    id: string;
    email: string;
    role: "ADMIN" | "MEMBER" | "VIEWER" | "CLIENT";
    expiresAt: string;
    createdAt: string;
  }>;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "CLIENT";
  currentUserId: string;
};
type BoardMembersResponse = {
  members: Array<{
    userId: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "CLIENT";
    boardRole: "ADMIN" | "MEMBER" | "OBSERVER" | "CLIENT" | null;
    user: { name: string | null; email: string };
  }>;
};
type NotificationPreference = {
  eventType: string;
  inApp: boolean;
  email: boolean;
};
type NotificationPreferencesResponse = { preferences: NotificationPreference[] };

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof result.error === "string"
        ? result.error
        : result.error && typeof result.error === "object"
          ? Object.values(result.error as Record<string, string[]>).flat()[0]
          : "Request failed";
    throw new Error(message || "Request failed");
  }
  return result as T;
}

const tabs = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "preferences", label: "Preferences" },
  { id: "notifications", label: "Notifications" },
  { id: "workspace", label: "Workspace members and roles" },
] as const;
type TabId = (typeof tabs)[number]["id"];

function notificationEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    ASSIGNED: "Assigned to a card",
    MENTION: "Mentioned",
    COMMENT: "Comment on followed or assigned card",
    DUE_SOON: "Due within 24 hours",
    APPROVAL_REQUESTED: "Approval requested",
    APPROVED: "Card approved",
    CHANGES_REQUESTED: "Changes requested",
  };
  return labels[eventType] ?? eventType;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function PermissionMatrix() {
  const rows = [
    ["View workspace/boards", true, true, true, true, false],
    ["View explicitly shared cards", false, false, false, false, true],
    ["Comment on client-visible cards", false, false, false, false, true],
    ["Upload and approve shared cards", false, false, false, false, true],
    ["Create and edit cards", true, true, true, false, false],
    ["Manage lists", true, true, true, false, false],
    ["Manage workspace members", true, true, false, false, false],
    ["Delete board", true, true, false, false, false],
    ["Delete workspace", true, false, false, false, false],
  ] as const;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[580px] text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="p-3 text-left font-semibold">Permission</th>
            {["Owner", "Admin", "Member", "Viewer", "Client"].map((role) => (
              <th key={role} className="p-3 text-center font-semibold">{role}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, owner, admin, member, viewer, client]) => (
            <tr key={label} className="border-t">
              <td className="p-3">{label}</td>
              {[owner, admin, member, viewer, client].map((allowed, index) => (
                <td key={index} className="p-3 text-center">
                  {allowed ? <span className="text-emerald-600">Allowed</span> : <span className="text-muted-foreground">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { update: updateSession } = useSession();
  const requestedTab = params.get("tab") as TabId | null;
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab! : "profile";
  const workspaceId = params.get("workspaceId");
  const boardId = params.get("boardId");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingsResponse>("/api/settings"),
  });
  const selectedWorkspace =
    data?.workspaces.find((workspace) => workspace.id === workspaceId) ??
    data?.workspaces.find((workspace) => workspace.id === data.user.defaultWorkspaceId) ??
    data?.workspaces[0];
  const membersQuery = useQuery({
    queryKey: ["workspace-settings", selectedWorkspace?.id],
    queryFn: () =>
      api<WorkspaceMembersResponse>(
        `/api/workspaces/${selectedWorkspace!.id}/members`,
      ),
    enabled: activeTab === "workspace" && Boolean(selectedWorkspace),
  });
  const boardMembersQuery = useQuery({
    queryKey: ["board-role-overrides", boardId],
    queryFn: () => api<BoardMembersResponse>(`/api/boards/${boardId}/members`),
    enabled: activeTab === "workspace" && Boolean(boardId),
  });
  const notificationPreferences = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api<NotificationPreferencesResponse>("/api/settings/notifications"),
    enabled: activeTab === "notifications",
  });
  const saveNotificationPreferences = useMutation({
    mutationFn: (preferences: NotificationPreference[]) =>
      api<NotificationPreferencesResponse>("/api/settings/notifications", "PATCH", { preferences }),
    onMutate: async (preferences) => {
      await queryClient.cancelQueries({ queryKey: ["notification-preferences"] });
      const previous = queryClient.getQueryData<NotificationPreferencesResponse>(["notification-preferences"]);
      queryClient.setQueryData(["notification-preferences"], { preferences });
      return { previous };
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["notification-preferences"], result);
      toast.success("Notification preferences saved");
    },
    onError: (error: Error, _preferences, context) => {
      if (context?.previous) queryClient.setQueryData(["notification-preferences"], context.previous);
      toast.error(error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });

  const saveSettings = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<{ user: SettingsResponse["user"] }>("/api/settings", "PATCH", payload),
    onSuccess: async ({ user }) => {
      queryClient.setQueryData<SettingsResponse>(["settings"], (old) =>
        old ? { ...old, user: { ...old.user, ...user } } : old,
      );
      await updateSession({ name: user.name, image: user.image });
      applyTheme(user.theme, user.accentColor);
      toast.success("Settings saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const changeRole = useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: string;
    }) =>
      api(
        `/api/workspaces/${selectedWorkspace!.id}/members/${userId}`,
        "PATCH",
        { role },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
      toast.success("Member role updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/api/workspaces/${selectedWorkspace!.id}/members/${userId}`, "DELETE"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
      toast.success("Member removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const inviteMember = useMutation({
    mutationFn: (payload: { email: string; role: string }) =>
      api(
        `/api/workspaces/${selectedWorkspace!.id}/invites`,
        "POST",
        payload,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
      toast.success("Invitation sent. Its link is in the development server console.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const mutateInvite = useMutation({
    mutationFn: ({
      inviteId,
      method,
    }: {
      inviteId: string;
      method: "POST" | "DELETE";
    }) =>
      api(
        `/api/workspaces/${selectedWorkspace!.id}/invites/${inviteId}`,
        method,
      ),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
      toast.success(variables.method === "POST" ? "Invitation resent" : "Invitation cancelled");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateBoardRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string | null }) =>
      role
        ? api(`/api/boards/${boardId}/members`, "PUT", { userId, role })
        : api(`/api/boards/${boardId}/members`, "DELETE", { userId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["board-role-overrides", boardId] });
      toast.success("Board role updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const revokeSessions = useMutation({
    mutationFn: () => api("/api/settings/sessions", "DELETE"),
    onSuccess: async () => {
      toast.success("All sessions have been signed out");
      await signOut({ callbackUrl: "/login" });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteAccount = useMutation({
    mutationFn: () => api("/api/settings/account", "DELETE", { confirmation: "DELETE" }),
    onSuccess: async () => {
      toast.success("Account deleted");
      await signOut({ callbackUrl: "/signup" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (data?.user.theme) applyTheme(data.user.theme, data.user.accentColor);
  }, [data?.user.theme, data?.user.accentColor]);
  useEffect(() => {
    if (data?.user.theme !== "system") return;
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme("system", data.user.accentColor);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, [data?.user.theme, data?.user.accentColor]);
  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveSettings.mutate({
      name: String(form.get("name") ?? ""),
      bio: String(form.get("bio") ?? ""),
    });
  }
  async function uploadAvatar(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("avatar", file);
    setAvatarBusy(true);
    try {
      const response = await fetch("/api/settings/avatar", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Avatar upload failed");
      queryClient.setQueryData<SettingsResponse>(["settings"], (old) =>
        old ? { ...old, user: { ...old.user, image: result.image } } : old,
      );
      await updateSession({ image: result.image });
      toast.success("Avatar updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Avatar upload failed");
    } finally {
      setAvatarBusy(false);
    }
  }
  async function removeAvatar() {
    const response = await fetch("/api/settings/avatar", { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(typeof result.error === "string" ? result.error : "Avatar removal failed");
      return;
    }
    queryClient.setQueryData<SettingsResponse>(["settings"], (old) =>
      old ? { ...old, user: { ...old.user, image: null } } : old,
    );
    await updateSession({ image: null });
    toast.success("Avatar removed");
  }
  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    api("/api/settings/password", "PATCH", {
      currentPassword: form.get("currentPassword"),
      newPassword: form.get("newPassword"),
    })
      .then(() => {
        toast.success("Password changed. Please sign in again.");
        return signOut({ callbackUrl: "/login" });
      })
      .catch((error: Error) => toast.error(error.message));
  }
  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    inviteMember.mutate({
      email: String(form.get("email") ?? ""),
      role: String(form.get("role") ?? "MEMBER"),
    });
    event.currentTarget.reset();
  }

  if (isPending) {
    return <div className="mx-auto max-w-4xl space-y-4"><div className="h-9 w-56 animate-pulse rounded bg-muted" /><div className="h-96 animate-pulse rounded-xl bg-muted" /></div>;
  }
  if (isError || !data) {
    return <div className="mx-auto max-w-xl rounded-xl border p-8 text-center"><p>Settings could not be loaded.</p><Button variant="outline" className="mt-4" onClick={() => void refetch()}>Retry</Button></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your profile, account security, preferences, and workspace access.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-2 md:flex-col" aria-label="Settings sections">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/settings?tab=${tab.id}${workspaceId ? `&workspaceId=${workspaceId}` : ""}${boardId ? `&boardId=${boardId}` : ""}`}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted ${activeTab === tab.id ? "bg-muted font-semibold" : "text-muted-foreground"}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 space-y-5">
          {activeTab === "profile" && (
            <Section title="Profile" description="Your email is the account identifier and cannot be changed here.">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={data.user.image || undefined} alt={data.user.name ?? ""} />
                  <AvatarFallback>{initials(data.user.name, data.user.email)}</AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Label htmlFor="avatar-upload">Profile photo</Label>
                  <Input id="avatar-upload" type="file" accept="image/jpeg,image/png,image/webp" className="max-w-xs" disabled={avatarBusy} onChange={(event) => void uploadAvatar(event.target.files?.[0])} />
                  <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP; maximum 2 MB.</p>
                  {data.user.image && <Button type="button" variant="ghost" size="sm" onClick={() => void removeAvatar()}>Remove photo</Button>}
                </div>
              </div>
              <form className="space-y-4" onSubmit={submitProfile}>
                <div className="space-y-2"><Label htmlFor="profile-name">Name</Label><Input id="profile-name" name="name" defaultValue={data.user.name ?? ""} minLength={2} maxLength={80} required /></div>
                <div className="space-y-2"><Label htmlFor="profile-email">Email</Label><Input id="profile-email" value={data.user.email} readOnly aria-readonly="true" /></div>
                <div className="space-y-2"><Label htmlFor="profile-bio">Bio</Label><textarea id="profile-bio" name="bio" defaultValue={data.user.bio ?? ""} maxLength={500} rows={4} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
                <Button type="submit" disabled={saveSettings.isPending}>{saveSettings.isPending ? "Saving…" : "Save profile"}</Button>
              </form>
            </Section>
          )}
          {activeTab === "security" && (
            <div className="space-y-5">
              <Section title="Change password" description={data.user.hasPassword ? "Use your current password to set a new one." : "This account has no password configured. Add-password flow is not enabled for social-only accounts."}>
                {data.user.hasPassword && (
                  <form className="space-y-4" onSubmit={submitPassword}>
                    <div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></div>
                    <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} required /><p className="text-xs text-muted-foreground">At least 8 characters with a letter and a number.</p></div>
                    <Button type="submit">Change password</Button>
                  </form>
                )}
              </Section>
              <Section title="Sign out of all devices" description="All existing sessions, including this one, will become invalid.">
                <Button variant="outline" disabled={revokeSessions.isPending} onClick={() => revokeSessions.mutate()}>Sign out everywhere</Button>
              </Section>
              <Section title="Delete account" description="This permanently deletes your account and any workspaces you own, including their boards and content.">
                <Button variant="destructive" disabled={deleteAccount.isPending} onClick={() => {
                  if (window.confirm("Permanently delete this account and all workspaces you own? This cannot be undone.")) deleteAccount.mutate();
                }}>Delete my account</Button>
              </Section>
              <Section title="Recent sign-in activity" description="Sign-in history is not currently recorded.">
                <p className="text-sm text-muted-foreground">No sign-in activity is available yet.</p>
              </Section>
            </div>
          )}
          {activeTab === "preferences" && (
            <Section title="Preferences" description="Personal display options and your default workspace.">
              <div className="space-y-2">
                <Label>Theme</Label>
                <Select value={data.user.theme} onValueChange={(theme) => saveSettings.mutate({ theme })}>
                  <SelectTrigger aria-label="Theme"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-accent">Accent color</Label>
                <Input id="settings-accent" type="color" value={data.user.accentColor ?? "#6366f1"} className="h-10 w-20 cursor-pointer p-1" onChange={(event) => saveSettings.mutate({ accentColor: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Default workspace</Label>
                <Select value={data.user.defaultWorkspaceId ?? "none"} onValueChange={(value) => saveSettings.mutate({ defaultWorkspaceId: value === "none" ? null : value })}>
                  <SelectTrigger aria-label="Default workspace"><SelectValue placeholder="Choose a workspace" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">No default</SelectItem>{data.workspaces.map((workspace) => <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </Section>
          )}
          {activeTab === "notifications" && (
            <Section title="Notifications" description="Choose which FlowBoard events appear in the bell and which are sent by email.">
              {notificationPreferences.isPending ? (
                <div className="space-y-3"><div className="h-10 animate-pulse rounded bg-muted" /><div className="h-10 animate-pulse rounded bg-muted" /></div>
              ) : notificationPreferences.isError ? (
                <div className="text-sm text-destructive">
                  <p>{notificationPreferences.error.message}</p>
                  <Button variant="outline" className="mt-3" onClick={() => void notificationPreferences.refetch()}>Retry</Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Event</th><th className="py-2 text-center font-medium">In-app</th><th className="py-2 text-center font-medium">Email</th></tr></thead>
                    <tbody>
                      {notificationPreferences.data.preferences.map((preference) => (
                        <tr key={preference.eventType} className="border-b last:border-0">
                          <td className="py-3 font-medium">{notificationEventLabel(preference.eventType)}</td>
                          {(["inApp", "email"] as const).map((channel) => (
                            <td key={channel} className="py-3 text-center">
                              <input
                                type="checkbox"
                                aria-label={`${notificationEventLabel(preference.eventType)} ${channel === "inApp" ? "in-app" : "email"} notifications`}
                                checked={preference[channel]}
                                disabled={saveNotificationPreferences.isPending}
                                className="h-4 w-4 accent-primary"
                                onChange={(event) => {
                                  const next = notificationPreferences.data.preferences.map((item) =>
                                    item.eventType === preference.eventType ? { ...item, [channel]: event.target.checked } : item,
                                  );
                                  saveNotificationPreferences.mutate(next);
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}
          {activeTab === "workspace" && (
            <div className="space-y-5">
              {boardId && (
                <Section title="Board role overrides" description="Workspace owners and admins keep their workspace permissions. Other members inherit their workspace role unless overridden here.">
                  {boardMembersQuery.isPending ? <div className="h-20 animate-pulse rounded bg-muted" /> : boardMembersQuery.isError ? <p className="text-sm text-destructive">Board members could not be loaded.</p> : (
                    <div className="space-y-2">
                      {boardMembersQuery.data?.members.filter((member) => member.role === "MEMBER" || member.role === "VIEWER" || member.role === "CLIENT").map((member) => (
                        <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                          <div><p className="text-sm font-medium">{member.user.name ?? member.user.email}</p><p className="text-xs text-muted-foreground">{member.user.email} · workspace {member.role.toLowerCase()}</p></div>
                          <Select value={member.boardRole ?? "INHERIT"} onValueChange={(role) => updateBoardRole.mutate({ userId: member.userId, role: role === "INHERIT" ? null : role })}>
                            <SelectTrigger className="w-40" aria-label={`Board role for ${member.user.email}`}><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="INHERIT">Inherit role</SelectItem><SelectItem value="ADMIN">Board admin</SelectItem><SelectItem value="MEMBER">Board member</SelectItem><SelectItem value="OBSERVER">Board viewer</SelectItem><SelectItem value="CLIENT">Client</SelectItem></SelectContent>
                          </Select>
                        </div>
                      ))}
                      {!boardMembersQuery.data?.members.some((member) => member.role === "MEMBER" || member.role === "VIEWER" || member.role === "CLIENT") && <p className="text-sm text-muted-foreground">There are no members eligible for a board override.</p>}
                    </div>
                  )}
                </Section>
              )}
              <Section title="Workspace members and roles" description="Invite teammates, assign access, and manage outstanding invitations.">
                <div className="space-y-2">
                  <Label>Workspace</Label>
                  <Select value={selectedWorkspace?.id} onValueChange={(value) => {
                    const url = new URL(window.location.href);
                    url.searchParams.set("workspaceId", value);
                    router.replace(url.toString(), { scroll: false });
                  }}>
                    <SelectTrigger aria-label="Choose workspace"><SelectValue placeholder="Choose a workspace" /></SelectTrigger>
                    <SelectContent>{data.workspaces.map((workspace) => <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {!selectedWorkspace ? <p className="text-sm text-muted-foreground">You do not belong to a workspace.</p> : membersQuery.isPending ? <div className="h-32 animate-pulse rounded bg-muted" /> : membersQuery.isError ? <p className="text-sm text-destructive">Workspace members could not be loaded. Confirm you are an Owner or Admin.</p> : (
                  <>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full min-w-[650px] text-sm">
                        <thead className="bg-muted/70"><tr><th className="p-3 text-left">Member</th><th className="p-3 text-left">Role</th><th className="p-3 text-left">Joined</th><th className="p-3 text-right">Actions</th></tr></thead>
                        <tbody>{membersQuery.data?.members.map((member) => {
                          const isOwner = member.role === "OWNER";
                          const isAdmin = membersQuery.data?.role === "ADMIN";
                          const ownerCount = membersQuery.data?.members.filter((item) => item.role === "OWNER").length ?? 0;
                          const canManageWorkspace = membersQuery.data?.role === "OWNER" || membersQuery.data?.role === "ADMIN";
                          const editable = canManageWorkspace && (isOwner
                            ? membersQuery.data?.role === "OWNER" && ownerCount > 1
                            : !isAdmin || member.role === "MEMBER" || member.role === "VIEWER" || member.role === "CLIENT");
                          return <tr key={member.userId} className="border-t">
                            <td className="p-3"><p className="font-medium">{member.user.name ?? member.user.email}</p><p className="text-xs text-muted-foreground">{member.user.email}</p></td>
                            <td className="p-3">{editable ? <Select value={member.role} onValueChange={(role) => changeRole.mutate({ userId: member.userId, role })}><SelectTrigger className="w-36" aria-label={`Role for ${member.user.email}`}><SelectValue /></SelectTrigger><SelectContent>{membersQuery.data?.role === "OWNER" && <><SelectItem value="OWNER">Owner</SelectItem><SelectItem value="ADMIN">Admin</SelectItem></>}<SelectItem value="MEMBER">Member</SelectItem><SelectItem value="VIEWER">Viewer</SelectItem><SelectItem value="CLIENT">Client</SelectItem></SelectContent></Select> : <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{member.role}</span>}</td>
                            <td className="p-3 text-muted-foreground">{new Date(member.joinedAt).toLocaleDateString()}</td>
                            <td className="p-3 text-right">{editable && <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => {
                              if (window.confirm(`Remove ${member.user.email} from this workspace?`)) removeMember.mutate(member.userId);
                            }}>Remove</Button>}</td>
                          </tr>;
                        })}</tbody>
                      </table>
                    </div>
                    {(membersQuery.data?.role === "OWNER" || membersQuery.data?.role === "ADMIN") && (
                      <form onSubmit={submitInvite} className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-[1fr_150px_auto]">
                        <div className="space-y-1"><Label htmlFor="invite-email">Invite by email</Label><Input id="invite-email" type="email" name="email" placeholder="name@example.com" required /></div>
                        <div className="space-y-1"><Label>Role</Label><Select name="role" defaultValue="MEMBER"><SelectTrigger aria-label="Invitation role"><SelectValue /></SelectTrigger><SelectContent>{membersQuery.data?.role === "OWNER" && <SelectItem value="ADMIN">Admin</SelectItem>}<SelectItem value="MEMBER">Member</SelectItem><SelectItem value="VIEWER">Viewer</SelectItem><SelectItem value="CLIENT">Client</SelectItem></SelectContent></Select></div>
                        <Button type="submit" className="self-end" disabled={inviteMember.isPending}>Invite</Button>
                      </form>
                    )}
                    <div className="space-y-3">
                      <h3 className="font-medium">Pending invitations</h3>
                      {membersQuery.data?.invites.length ? membersQuery.data.invites.map((invite) => (
                        <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                          <div><p className="text-sm font-medium">{invite.email}</p><p className="text-xs text-muted-foreground">{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</p></div>
                          <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => mutateInvite.mutate({ inviteId: invite.id, method: "POST" })}>Resend</Button><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => mutateInvite.mutate({ inviteId: invite.id, method: "DELETE" })}>Cancel</Button></div>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">No pending invitations.</p>}
                    </div>
                  </>
                )}
              </Section>
              <Section title="Role permissions" description="Workspace role capabilities. Board-level overrides can adjust board access for individual members.">
                <PermissionMatrix />
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function applyTheme(theme: "light" | "dark" | "system", accentColor?: string | null) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  if (accentColor) {
    const { hue, saturation, lightness } = toHsl(accentColor);
    document.documentElement.style.setProperty(
      "--primary",
      `${hue} ${saturation}% ${lightness}%`,
    );
    document.documentElement.style.setProperty(
      "--ring",
      `${hue} ${saturation}% ${lightness}%`,
    );
  }
}

function toHsl(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  let saturation = 0;
  const lightness = (maximum + minimum) / 2;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
  }
  return {
    hue: Math.round((hue + 360) % 360),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
  };
}

function initials(name: string | null, email: string) {
  return (name || email)
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
