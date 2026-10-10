"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Home,
  CreditCard,
  BadgeDollarSign,
  Archive,
  Settings,
  Menu,
  PanelLeftClose,
  X,
  FolderPlus,
  Plus,
  Star,
  Users,
  Pencil,
  Trash2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Board = {
  id: string;
  title: string;
  backgroundColor: string | null;
  isFavorite: boolean;
  backgroundImage?: string | null;
};
function cssImageUrl(value: string) {
  return encodeURI(value).replace(/["'()\\\s]/g, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`);
}
type Workspace = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "CLIENT";
  boards: Board[];
  _count: { members: number };
};
type DialogState =
  | { kind: "workspace" }
  | { kind: "rename"; workspace: Workspace }
  | { kind: "invite"; workspace: Workspace }
  | { kind: "board"; workspace: Workspace }
  | null;

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = result.error;
    const message =
      typeof error === "string"
        ? error
        : error && typeof error === "object"
          ? Object.values(error as Record<string, string[]>).flat()[0]
          : "Request failed";
    throw new Error(message || "Request failed");
  }
  return result as T;
}

export function WorkspaceSidebar() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recentBoardIds, setRecentBoardIds] = useState<string[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);
  const [boardColor, setBoardColor] = useState("#2563eb");
  const [boardImage, setBoardImage] = useState("");
  const [starredOpen, setStarredOpen] = useState(false);
  const { data, isPending, isError } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<{ workspaces: Workspace[] }>("/api/workspaces"),
  });
  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem("flowboard-sidebar-collapsed") === "true");
    try {
      const stored = JSON.parse(window.localStorage.getItem("flowboard-recent-boards") ?? "[]");
      if (Array.isArray(stored)) setRecentBoardIds(stored.filter((id): id is string => typeof id === "string").slice(0, 8));
    } catch {
      setRecentBoardIds([]);
    }
    const toggleMobile = () => setMobileOpen((open) => !open);
    window.addEventListener("flowboard:toggle-sidebar", toggleMobile);
    const updateRecent = () => {
      try {
        const stored = JSON.parse(window.localStorage.getItem("flowboard-recent-boards") ?? "[]");
        if (Array.isArray(stored)) setRecentBoardIds(stored.filter((id): id is string => typeof id === "string").slice(0, 8));
      } catch {
        setRecentBoardIds([]);
      }
    };
    window.addEventListener("flowboard:recent-boards-updated", updateRecent);
    const openWorkspace = () => setDialog({ kind: "workspace" });
    const openBoard = () => {
      const manageableWorkspace = queryClient.getQueryData<{ workspaces: Workspace[] }>(["workspaces"])?.workspaces.find((workspace) => workspace.role === "OWNER" || workspace.role === "ADMIN");
      if (manageableWorkspace) setDialog({ kind: "board", workspace: manageableWorkspace });
      else toast.error("Create a workspace before creating a board.");
    };
    window.addEventListener("flowboard:create-workspace", openWorkspace);
    window.addEventListener("flowboard:create-board", openBoard);
    return () => {
      window.removeEventListener("flowboard:toggle-sidebar", toggleMobile);
      window.removeEventListener("flowboard:recent-boards-updated", updateRecent);
      window.removeEventListener("flowboard:create-workspace", openWorkspace);
      window.removeEventListener("flowboard:create-board", openBoard);
    };
  }, [queryClient]);
  useEffect(() => setMobileOpen(false), [pathname]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  };
  const createWorkspace = useMutation({
    mutationFn: (name: string) => api("/api/workspaces", "POST", { name }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Workspace created");
      setDialog(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateWorkspace = useMutation({
    mutationFn: ({
      workspaceId,
      name,
    }: {
      workspaceId: string;
      name: string;
    }) => api(`/api/workspaces/${workspaceId}`, "PATCH", { name }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Workspace renamed");
      setDialog(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const invite = useMutation({
    mutationFn: ({
      workspaceId,
      email,
      role,
    }: {
      workspaceId: string;
      email: string;
      role: string;
    }) => api(`/api/workspaces/${workspaceId}/invites`, "POST", { email, role }),
    onSuccess: () => {
      toast.success("Invitation created. Check the development server console for its link.");
      setDialog(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const createBoard = useMutation({
    mutationFn: ({
      workspaceId,
      title,
      backgroundColor,
      backgroundImage,
    }: {
      workspaceId: string;
      title: string;
      backgroundColor: string;
      backgroundImage?: string;
    }) => api<{ board: Board }>("/api/boards", "POST", { workspaceId, title, backgroundColor, ...(backgroundImage ? { backgroundImage } : {}) }),
    onSuccess: async ({ board }) => {
      await invalidate();
      toast.success("Board created");
      setDialog(null);
      router.push(`/boards/${board.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteWorkspace = useMutation({
    mutationFn: (workspaceId: string) => api(`/api/workspaces/${workspaceId}`, "DELETE"),
    onSuccess: async () => {
      await invalidate();
      toast.success("Workspace deleted");
      router.push("/");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const favorite = useMutation({
    mutationFn: ({ boardId, value }: { boardId: string; value: boolean }) =>
      api(`/api/boards/${boardId}/favorite`, "POST", { favorite: value }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });
  const archiveBoard = useMutation({
    mutationFn: (boardId: string) => api(`/api/boards/${boardId}`, "PATCH", { archived: true }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Board archived");
      router.push("/");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeBoard = useMutation({
    mutationFn: (boardId: string) => api(`/api/boards/${boardId}`, "DELETE"),
    onSuccess: async () => {
      await invalidate();
      toast.success("Board deleted");
      router.push("/");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (dialog.kind === "workspace" && name) createWorkspace.mutate(name);
    if (dialog.kind === "rename" && name) {
      updateWorkspace.mutate({ workspaceId: dialog.workspace.id, name });
    }
    if (dialog.kind === "invite") {
      invite.mutate({
        workspaceId: dialog.workspace.id,
        email: String(form.get("email") ?? ""),
        role: String(form.get("role") ?? "MEMBER"),
      });
    }
    if (dialog.kind === "board" && name) {
      const imageUrl = String(form.get("backgroundImage") ?? "").trim();
      if (imageUrl) {
        try {
          const parsed = new URL(imageUrl);
          if (parsed.protocol !== "https:") throw new Error("Enter a valid HTTPS image URL");
          await new Promise<void>((resolve, reject) => {
            const image = new window.Image();
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("That image could not be loaded. Check the URL and try another image."));
            image.src = parsed.href;
          });
        } catch (error) { toast.error(error instanceof Error ? error.message : "Invalid image URL"); return; }
      }
      createBoard.mutate({
        workspaceId: dialog.workspace.id,
        title: name,
        backgroundColor: String(form.get("backgroundColor") ?? "#2563eb"),
        backgroundImage: imageUrl || undefined,
      });
    }
  }

  const pending =
    createWorkspace.isPending ||
    updateWorkspace.isPending ||
    invite.isPending ||
    createBoard.isPending;

  const allBoards = data?.workspaces.flatMap((workspace) => workspace.boards) ?? [];
  const clientOnly = Boolean(data?.workspaces.length && data.workspaces.every((workspace) => workspace.role === "CLIENT"));
  const starredBoards = allBoards.filter((board) => board.isFavorite);
  const recentBoards = recentBoardIds
    .map((id) => allBoards.find((board) => board.id === id))
    .filter((board): board is Board => Boolean(board));
  function toggleSidebarWidth() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    window.localStorage.setItem("flowboard-sidebar-collapsed", String(next));
  }

  return (
    <>
      {mobileOpen && <button type="button" aria-label="Close sidebar" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />}
      <button type="button" aria-label="Open navigation" className="fixed bottom-4 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border bg-background shadow-lg md:hidden" onClick={() => setMobileOpen(true)}>
        <Menu className="h-5 w-5" />
      </button>
    <aside className={cn(
      "fixed inset-y-14 left-0 z-50 flex shrink-0 flex-col border-r bg-background transition-[width,transform] duration-200 md:static md:inset-auto md:z-auto md:translate-x-0",
      sidebarCollapsed ? "w-16" : "w-64",
      mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
    )}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        {!sidebarCollapsed && <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Workspaces and boards
        </span>}
        {!clientOnly && <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", sidebarCollapsed && "mx-auto")}
          aria-label="Create workspace"
          title="Create workspace"
          onClick={() => setDialog({ kind: "workspace" })}
        >
          <Plus className="h-4 w-4" />
        </Button>}
        <Button variant="ghost" size="icon" className="hidden h-8 w-8 md:inline-flex" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleSidebarWidth}>
          {sidebarCollapsed ? <Menu className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" aria-label="Close sidebar" onClick={() => setMobileOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <nav className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-2" aria-label="Main navigation and workspaces">
        <div className="space-y-1 border-b pb-3">
          <Link href="/" title="Home" className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted", pathname === "/" && "bg-muted font-medium", sidebarCollapsed && "justify-center")}><Home className="h-4 w-4 shrink-0" />{!sidebarCollapsed && "Home"}</Link>
          {!clientOnly && <Link href="/my-cards" title="My cards" className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted", pathname.startsWith("/my-cards") && "bg-muted font-medium", sidebarCollapsed && "justify-center")}><CreditCard className="h-4 w-4 shrink-0" />{!sidebarCollapsed && "My cards"}</Link>}
          {clientOnly && <Link href="/shared-with-me" title="Shared with me" className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted", pathname.startsWith("/shared-with-me") && "bg-muted font-medium", sidebarCollapsed && "justify-center")}><CreditCard className="h-4 w-4 shrink-0" />{!sidebarCollapsed && "Shared with me"}</Link>}
          {!clientOnly && <button type="button" title="Starred boards" className={cn("flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted", sidebarCollapsed && "justify-center")} onClick={() => setStarredOpen((open) => !open)}><Star className="h-4 w-4 shrink-0 text-amber-500" />{!sidebarCollapsed && <><span className="flex-1">Starred boards</span>{starredOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</>}</button>}
          {!clientOnly && starredOpen && !sidebarCollapsed && starredBoards.map((board) => <Link key={board.id} href={`/boards/${board.id}`} className="ml-6 block truncate rounded px-2 py-1 text-xs hover:bg-muted">{board.title}</Link>)}
          {!clientOnly && <button type="button" title="Recent boards" className={cn("flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted", sidebarCollapsed && "justify-center")} onClick={() => setRecentOpen((open) => !open)}><Clock className="h-4 w-4 shrink-0" />{!sidebarCollapsed && <><span className="flex-1">Recent boards</span>{recentOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</>}</button>}
          {!clientOnly && recentOpen && !sidebarCollapsed && recentBoards.map((board) => <Link key={board.id} href={`/boards/${board.id}`} className="ml-6 block truncate rounded px-2 py-1 text-xs hover:bg-muted">{board.title}</Link>)}
          {!clientOnly && <Link href="/archived" title="Archived items" className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted", pathname.startsWith("/archived") && "bg-muted font-medium", sidebarCollapsed && "justify-center")}><Archive className="h-4 w-4 shrink-0" />{!sidebarCollapsed && "Archived items"}</Link>}
          {!clientOnly && <Link href="/settings" title="Settings" className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted", pathname.startsWith("/settings") && "bg-muted font-medium", sidebarCollapsed && "justify-center")}><Settings className="h-4 w-4 shrink-0" />{!sidebarCollapsed && "Settings"}</Link>}
          {!clientOnly && <Link href="/plans" title="Plans and billing" className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted", (pathname.startsWith("/plans") || pathname.startsWith("/billing")) && "bg-muted font-medium", sidebarCollapsed && "justify-center")}><BadgeDollarSign className="h-4 w-4 shrink-0" />{!sidebarCollapsed && "Plans & billing"}</Link>}
        </div>
        {isPending && (
          <div className="space-y-3 p-2" aria-label="Loading workspaces">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        )}
        {isError && (
          <div className="space-y-2 p-2 text-sm text-destructive">
            <p>Workspaces could not be loaded.</p>
            <Button variant="outline" size="sm" onClick={() => void invalidate()}>
              Retry
            </Button>
          </div>
        )}
        {!isPending && !isError && (data?.workspaces.length ?? 0) === 0 && (
          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No workspaces yet. Create one to get started.
          </div>
        )}
        {!clientOnly && data?.workspaces.map((workspace) => {
          const isCollapsed = collapsed[workspace.id] ?? false;
          const canManage = workspace.role === "OWNER" || workspace.role === "ADMIN";
          return (
            <section key={workspace.id} className="rounded-lg">
              <div className="group flex items-center gap-1 rounded-md px-1 py-1 hover:bg-muted/70">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() =>
                    setCollapsed((old) => ({ ...old, [workspace.id]: !isCollapsed }))
                  }
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  {!sidebarCollapsed && <span className="truncate text-sm font-semibold">{workspace.name}</span>}
                </button>
                {canManage && (
                  <div className="flex items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      title="Invite member"
                      aria-label={`Invite member to ${workspace.name}`}
                      onClick={() => setDialog({ kind: "invite", workspace })}
                    >
                      <Users className="h-3.5 w-3.5" />
                    </button>
                    {workspace.role === "OWNER" && (
                      <>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                          title="Rename workspace"
                          aria-label={`Rename ${workspace.name}`}
                          onClick={() => setDialog({ kind: "rename", workspace })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                          title="Delete workspace"
                          aria-label={`Delete ${workspace.name}`}
                          onClick={() => {
                            if (window.confirm(`Delete "${workspace.name}" and all its boards?`)) {
                              deleteWorkspace.mutate(workspace.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
                {canManage && !sidebarCollapsed && (
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground" title="Create board" aria-label={`Create board in ${workspace.name}`} onClick={() => setDialog({ kind: "board", workspace })}>
                    <FolderPlus className="h-4 w-4" />
                  </button>
                )}
              </div>
              {!isCollapsed && !sidebarCollapsed && (
                <div className="ml-3 mt-1 space-y-0.5 border-l pl-2">
                  {workspace.boards.length === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">No boards yet</p>
                  )}
                  {workspace.boards.map((board) => (
                    <div key={board.id} className="group/board flex items-center">
                      <Link
                        href={`/boards/${board.id}`}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                          pathname === `/boards/${board.id}` && "bg-muted font-medium",
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: board.backgroundColor ?? "#2563eb" }}
                        />
                        <span className="truncate">{board.title}</span>
                      </Link>
                      <button
                        type="button"
                        className={cn(
                          "rounded p-1 text-muted-foreground hover:text-amber-500",
                          board.isFavorite ? "text-amber-500" : "opacity-0 group-hover/board:opacity-100",
                        )}
                        aria-label={board.isFavorite ? "Remove favorite" : "Add favorite"}
                        title={board.isFavorite ? "Remove favorite" : "Add favorite"}
                        onClick={() =>
                          favorite.mutate({ boardId: board.id, value: !board.isFavorite })
                        }
                      >
                        <Star className="h-3.5 w-3.5" fill={board.isFavorite ? "currentColor" : "none"} />
                      </button>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><button type="button" className="rounded px-1.5 py-0.5 text-muted-foreground opacity-0 hover:bg-muted group-hover/board:opacity-100 focus:opacity-100" aria-label={`Board actions for ${board.title}`}>···</button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="right">
                            <DropdownMenuItem onClick={() => archiveBoard.mutate(board.id)}>Archive board</DropdownMenuItem>
                            <DropdownMenuItem destructive onClick={() => {
                              if (window.confirm(`Delete "${board.title}" and its content?`)) removeBoard.mutate(board.id);
                            }}>Delete board</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))}
                  {canManage && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setDialog({ kind: "board", workspace })}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create board
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </nav>
      {!sidebarCollapsed && <div className="border-t p-3 text-xs text-muted-foreground">
        FlowBoard · {data?.workspaces.reduce((total, workspace) => total + workspace._count.members, 0) ?? 0} workspace memberships
      </div>}
      <Dialog open={Boolean(dialog)} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        {dialog && <DialogContent className="max-w-md p-6">
          <form
            className="space-y-4"
            onSubmit={handleDialogSubmit}
          >
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                {dialog.kind === "workspace" && "Create workspace"}
                {dialog.kind === "rename" && "Rename workspace"}
                {dialog.kind === "invite" && `Invite to ${dialog.workspace.name}`}
                {dialog.kind === "board" && `Create board in ${dialog.workspace.name}`}
              </DialogTitle>
              <DialogDescription>Make a quick update to your FlowBoard workspace.</DialogDescription>
            </DialogHeader>
            {(dialog.kind === "workspace" || dialog.kind === "rename") && (
              <Input
                name="name"
                aria-label="Workspace name"
                placeholder="Workspace name"
                defaultValue={dialog.kind === "rename" ? dialog.workspace.name : ""}
                autoFocus
                maxLength={80}
                required
              />
            )}
            {dialog.kind === "board" && (
              <>
                <Input name="name" aria-label="Board title" placeholder="Board title" autoFocus maxLength={80} required />
                <input type="hidden" name="backgroundColor" value={boardColor} />
                <div className="space-y-2"><p className="text-sm font-medium">Background</p><div className="grid grid-cols-5 gap-2">{["#2563eb", "#0f766e", "#7c3aed", "#e11d48", "#f59e0b", "linear-gradient(120deg,#059669,#0f766e)", "linear-gradient(120deg,#f97316,#db2777)", "linear-gradient(120deg,#334155,#0f172a)"].map((color) => <button key={color} type="button" aria-label={`Choose ${color.startsWith("linear") ? "gradient" : color} background`} aria-pressed={boardColor === color} className={cn("h-9 rounded-md border-2", boardColor === color ? "border-foreground ring-2 ring-primary/30" : "border-transparent")} style={{ background: color }} onClick={() => { setBoardColor(color); setBoardImage(""); }} />)}</div></div>
                <label className="block space-y-1 text-sm">Optional image URL<Input name="backgroundImage" type="url" placeholder="https://example.com/image.jpg" value={boardImage} onChange={(event) => setBoardImage(event.target.value)} /></label>
                <div className="overflow-hidden rounded-lg border"><div className="flex h-16 items-end bg-cover bg-center p-3 text-sm font-semibold text-white" style={{ backgroundColor: boardColor, backgroundImage: boardImage ? `linear-gradient(#0003,#0006),url(\"${cssImageUrl(boardImage)}\")` : undefined, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}>Board preview</div></div>
              </>
            )}
            {dialog.kind === "invite" && (
              <>
                <Input name="email" type="email" aria-label="Invitee email" placeholder="name@example.com" required />
                <label className="block space-y-1 text-sm">
                  Workspace role
                  <Select name="role" defaultValue="MEMBER">
                    <SelectTrigger aria-label="Workspace invitation role"><SelectValue /></SelectTrigger>
                    <SelectContent>{dialog.workspace.role === "OWNER" && <SelectItem value="ADMIN">Admin</SelectItem>}<SelectItem value="MEMBER">Member</SelectItem><SelectItem value="VIEWER">Viewer</SelectItem><SelectItem value="CLIENT">Client</SelectItem></SelectContent>
                  </Select>
                </label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Continue"}</Button>
            </div>
          </form>
        </DialogContent>}
      </Dialog>
    </aside>
    </>
  );
}
