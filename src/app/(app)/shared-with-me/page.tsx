"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";

type SharedCard = { id: string; title: string; dueDate: string | null; approvalStatus: string; boardId: string; list: { title: string; board: { title: string; backgroundColor: string | null } } };

export default function SharedWithMePage() {
  const query = useQuery({ queryKey: ["shared-cards"], queryFn: async () => { const response = await fetch("/api/cards/shared"); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Shared cards could not be loaded"); return result as { cards: SharedCard[] }; } });
  return <main className="mx-auto max-w-4xl space-y-6">
    <header><h1 className="text-3xl font-bold tracking-tight">Shared with me</h1><p className="mt-1 text-muted-foreground">Cards your workspace shared with you.</p></header>
    {query.isPending ? <div className="space-y-3" aria-label="Loading shared cards">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      : query.isError ? <div role="alert" className="rounded-xl border p-6 text-center"><p>{query.error.message}</p><button type="button" className="mt-3 text-primary underline" onClick={() => void query.refetch()}>Try again</button></div>
        : query.data.cards.length ? <div className="grid gap-3 sm:grid-cols-2">{query.data.cards.map((card) => <Link key={card.id} href={`/boards/${card.boardId}?card=${encodeURIComponent(card.id)}`} className="flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: card.list.board.backgroundColor ?? "#6366f1" }} /><CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{card.title}</span><span className="block truncate text-sm text-muted-foreground">{card.list.board.title} · {card.list.title}</span></span><span className="shrink-0 text-xs text-muted-foreground">{card.approvalStatus.replaceAll("_", " ")}</span></Link>)}</div>
          : <div className="rounded-xl border border-dashed p-10 text-center"><CreditCard className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No cards shared yet</h2><p className="mt-1 text-sm text-muted-foreground">Cards shared with you will appear here.</p></div>}
  </main>;
}
