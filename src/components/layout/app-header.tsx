"use client";

"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import { Bell, LayoutGrid, LogOut, Menu, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeResult, setActiveResult] = useState(0);
  const debouncedSearch = useDebouncedValue(searchText.trim(), 250);
  const searchResults = useQuery<{ boards: { id: string; title: string; href: string }[]; cards: { id: string; title: string; description: string; list: string; boardId: string }[]; people: { id: string; name: string | null; image: string | null; workspaceId: string }[] }>({
    queryKey: ["global-search", debouncedSearch],
    queryFn: () => notificationRequest(`/api/search?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: searchOpen && debouncedSearch.length >= 2,
  });
  const resultItems = useMemo(() => [
    ...(searchResults.data?.boards ?? []).map((item) => ({ kind: "board", id: item.id, label: item.title, href: item.href })),
    ...(searchResults.data?.cards ?? []).map((item) => ({ kind: "card", id: item.id, label: item.title, detail: `${item.list} · ${item.description}`, href: `/boards/${item.boardId}?card=${encodeURIComponent(item.id)}` })),
    ...(searchResults.data?.people ?? []).map((item) => ({ kind: "person", id: item.id, label: item.name ?? "Workspace member", detail: "Person", href: `/settings?workspaceId=${encodeURIComponent(item.workspaceId)}` })),
  ], [searchResults.data]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (!typing && (event.key === "/" || (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)))) {
        event.preventDefault(); setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
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
          <Button type="button" variant="outline" size="sm" className="hidden gap-2 text-muted-foreground sm:inline-flex" onClick={() => setSearchOpen(true)} aria-label="Search boards, cards, and people"><Search className="h-4 w-4" />Search<span className="rounded border px-1 text-[10px]">/</span></Button>
          <Button type="button" variant="ghost" size="icon" className="sm:hidden" onClick={() => setSearchOpen(true)} aria-label="Search"><Search className="h-4 w-4" /></Button>
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
      <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) { setSearchText(""); setActiveResult(0); } }}>
        <DialogContent className="top-[18vh] max-h-[70vh] max-w-2xl translate-y-0 p-0">
          <DialogHeader className="border-b p-4 pb-3"><DialogTitle>Search FlowBoard</DialogTitle><DialogDescription>Search boards, cards, and workspace people.</DialogDescription></DialogHeader>
          <div className="px-4"><Input autoFocus value={searchText} onChange={(event) => { setSearchText(event.target.value); setActiveResult(0); }} onKeyDown={(event) => {
            if (event.key === "ArrowDown" && resultItems.length) { event.preventDefault(); setActiveResult((value) => (value + 1) % resultItems.length); }
            if (event.key === "ArrowUp" && resultItems.length) { event.preventDefault(); setActiveResult((value) => (value - 1 + resultItems.length) % resultItems.length); }
            if (event.key === "Enter" && resultItems[activeResult]) { router.push(resultItems[activeResult].href); setSearchOpen(false); }
          }} placeholder="Type at least two characters…" aria-label="Search boards, cards, and people" /></div>
          <div className="max-h-[48vh] overflow-y-auto px-2 pb-3" aria-live="polite">
            {searchText.trim().length < 2 ? <p className="p-6 text-center text-sm text-muted-foreground">Enter at least two characters to search.</p> : searchResults.isPending ? <div className="space-y-2 p-4" aria-label="Searching"><div className="h-10 animate-pulse rounded bg-muted" /><div className="h-10 animate-pulse rounded bg-muted" /></div> : searchResults.isError ? <div className="p-5 text-center text-sm text-destructive">{searchResults.error.message}</div> : !resultItems.length ? <p className="p-6 text-center text-sm text-muted-foreground">No matching boards, cards, or people.</p> : <>
              {(["board", "card", "person"] as const).map((kind) => {
                const group = resultItems.filter((item) => item.kind === kind); if (!group.length) return null;
                return <section key={kind} className="pt-2"><h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{kind === "person" ? "People" : `${kind}s`}</h3>{group.map((item) => { const index = resultItems.findIndex((result) => result.kind === item.kind && result.id === item.id); return <button key={`${item.kind}-${item.id}`} type="button" className={`block w-full rounded-md px-3 py-2 text-left ${activeResult === index ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`} onMouseEnter={() => setActiveResult(index)} onClick={() => { router.push(item.href); setSearchOpen(false); }}><span className="block text-sm font-medium">{item.label}</span>{"detail" in item && typeof item.detail === "string" && <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}</button>; })}</section>;
              })}
            </>}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return debounced;
}
