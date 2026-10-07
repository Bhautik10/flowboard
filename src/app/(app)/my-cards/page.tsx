"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";

type AssignedCard = {
  id: string;
  title: string;
  list: { id: string; title: string };
  board: { id: string; title: string; backgroundColor: string | null };
};

export default function MyCardsPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["my-cards"],
    queryFn: async () => {
      const response = await fetch("/api/cards/mine");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Cards could not be loaded");
      return result as { cards: AssignedCard[] };
    },
  });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">My cards</h1><p className="mt-1 text-muted-foreground">Cards assigned to you across your workspaces.</p></div>
      {isPending ? <div className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
        : isError ? <div className="rounded-xl border p-6 text-center"><p>Assigned cards could not be loaded.</p><button className="mt-3 text-primary underline" onClick={() => void refetch()}>Try again</button></div>
          : data?.cards.length ? <div className="space-y-2">{data.cards.map((card) => <Link key={card.id} href={`/boards/${card.board.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="h-10 w-1.5 rounded-full" style={{ backgroundColor: card.board.backgroundColor ?? "#6366f1" }} /><CreditCard className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{card.title}</p><p className="truncate text-sm text-muted-foreground">{card.board.title} · {card.list.title}</p></div></Link>)}</div>
            : <div className="rounded-xl border border-dashed p-10 text-center"><CreditCard className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No assigned cards</h2><p className="mt-1 text-sm text-muted-foreground">When a card is assigned to you, it will appear here.</p></div>}
    </div>
  );
}
