"use client";

"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import { Bell, LayoutGrid, LogOut, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type NotificationsResponse = {
  unreadCount: number;
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    readAt: string | null;
    createdAt: string;
  }>;
};

async function notificationRequest<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "Notification request failed");
  }
  return result as T;
}

type AppHeaderProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

export function AppHeader({ user }: AppHeaderProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationRequest<NotificationsResponse>("/api/notifications"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => notificationRequest(`/api/notifications/${id}`, "PATCH"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const markAllRead = useMutation({
    mutationFn: () => notificationRequest("/api/notifications/read-all", "POST"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const initials =
    user.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "FB";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="md:hidden"
          onClick={() => window.dispatchEvent(new Event("flowboard:toggle-sidebar"))}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white">
            <LayoutGrid className="h-4 w-4" />
          </span>
          FlowBoard
        </Link>
        <nav className="flex items-center gap-2">
          <Popover.Root open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <Popover.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Notifications${notifications.data?.unreadCount ? `, ${notifications.data.unreadCount} unread` : ""}`} className="relative">
                <Bell className="h-4 w-4" />
                {Boolean(notifications.data?.unreadCount) && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {notifications.data!.unreadCount > 99 ? "99+" : notifications.data!.unreadCount}
                  </span>
                )}
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={8} className="z-[100] w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-popover p-0 text-popover-foreground shadow-xl">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <Popover.Title className="font-semibold">Notifications</Popover.Title>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!notifications.data?.unreadCount || markAllRead.isPending}
                    onClick={() => markAllRead.mutate()}
                  >
                    Mark all read
                  </Button>
                </div>
                <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
                  {notifications.isPending ? (
                    <div className="space-y-3 p-4" aria-label="Loading notifications">
                      <div className="h-12 animate-pulse rounded bg-muted" />
                      <div className="h-12 animate-pulse rounded bg-muted" />
                    </div>
                  ) : notifications.isError ? (
                    <div className="p-5 text-center text-sm text-muted-foreground">
                      <p>{notifications.error.message}</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => void notifications.refetch()}>Retry</Button>
                    </div>
                  ) : notifications.data.notifications.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
                  ) : notifications.data.notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className={`block w-full border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/70 ${notification.readAt ? "" : "bg-primary/5"}`}
                      onClick={() => {
                        if (!notification.readAt) markRead.mutate(notification.id);
                        if (notification.link) {
                          router.push(notification.link);
                          setNotificationsOpen(false);
                        }
                      }}
                    >
                      <span className="flex items-start gap-2">
                        {!notification.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{notification.title}</span>
                          {notification.body && <span className="mt-1 block text-xs text-muted-foreground">{notification.body}</span>}
                          <span className="mt-1 block text-[11px] text-muted-foreground">{new Date(notification.createdAt).toLocaleString()}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings">Settings</Link>
          </Button>
          <div className="flex items-center gap-2 rounded-full border pl-1 pr-2 py-1">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? ""} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[140px] truncate text-sm sm:inline">
              {user.name ?? user.email}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </header>
  );
}
