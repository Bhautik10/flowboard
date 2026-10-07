"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ArchivedData = {
  boards: Array<{ id: string; title: string; archivedAt: string | null; workspace: { name: string } }>;
  lists: Array<{ id: string; title: string; archivedAt: string | null; board: { id: string; title: string } }>;
  cards: Array<{ id: string; title: string; archivedAt: string | null; list: { title: string }; board: { id: string; title: string } }>;
};

async function restore(url: string) {
  const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: false }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not restore item");
}

export default function ArchivedPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["archived"],
    queryFn: async () => {
      const response = await fetch("/api/archived");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Archived items could not be loaded");
      return result as ArchivedData;
    },
  });
  const mutation = useMutation({
    mutationFn: restore,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["archived"] }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
        queryClient.invalidateQueries({ queryKey: ["board"] }),
      ]);
      toast.success("Item restored");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">Archived items</h1><p className="mt-1 text-muted-foreground">Boards, lists, and cards you have archived.</p></div>
      {isPending ? <div className="h-64 animate-pulse rounded-xl bg-muted" /> : isError ? <div className="rounded-xl border p-6 text-center"><p>Archived items could not be loaded.</p><Button variant="outline" className="mt-3" onClick={() => void refetch()}>Try again</Button></div> : (
        <div className="space-y-6">
          <ArchivedGroup title="Boards" empty="No archived boards." count={data?.boards.length ?? 0}>
            {data?.boards.map((board) => <div key={board.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{board.title}</p><p className="text-xs text-muted-foreground">{board.workspace.name}</p></div><Button size="sm" variant="outline" onClick={() => mutation.mutate(`/api/boards/${board.id}`)}><RotateCcw className="h-4 w-4" /> Restore</Button></div>)}
          </ArchivedGroup>
          <ArchivedGroup title="Lists" empty="No archived lists." count={data?.lists.length ?? 0}>
            {data?.lists.map((list) => <div key={list.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{list.title}</p><p className="text-xs text-muted-foreground"><Link href={`/boards/${list.board.id}`} className="hover:underline">{list.board.title}</Link></p></div><Button size="sm" variant="outline" onClick={() => mutation.mutate(`/api/lists/${list.id}`)}><RotateCcw className="h-4 w-4" /> Restore</Button></div>)}
          </ArchivedGroup>
          <ArchivedGroup title="Cards" empty="No archived cards." count={data?.cards.length ?? 0}>
            {data?.cards.map((card) => <div key={card.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="font-medium">{card.title}</p><p className="text-xs text-muted-foreground">{card.board.title} · {card.list.title}</p></div><Button size="sm" variant="outline" onClick={() => mutation.mutate(`/api/cards/${card.id}`)}><RotateCcw className="h-4 w-4" /> Restore</Button></div>)}
          </ArchivedGroup>
        </div>
      )}
    </div>
  );
}

function ArchivedGroup({ title, empty, count, children }: { title: string; empty: string; count: number; children: React.ReactNode }) {
  return <section className="space-y-3"><h2 className="font-semibold">{title}</h2>{count ? <div className="space-y-2">{children}</div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Archive className="mr-2 inline h-4 w-4" />{empty}</div>}</section>;
}
