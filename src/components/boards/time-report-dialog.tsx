"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Report = { rows: { cardId: string; cardTitle: string; userId: string; userName: string; week: string; seconds: number }[] };
async function loadReport(url: string): Promise<Report> { const response = await fetch(url); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Report could not be loaded"); return result as Report; }
function hours(seconds: number) { return (seconds / 3600).toFixed(2); }

export function TimeReportDialog({ boardId, open, onOpenChange }: { boardId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const today = new Date().toISOString().slice(0, 10); const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = React.useState(monthAgo); const [to, setTo] = React.useState(today);
  const query = useQuery({ queryKey: ["time-report", boardId, from, to], queryFn: () => loadReport(`/api/boards/${boardId}/time-report?from=${encodeURIComponent(`${from}T00:00:00.000Z`)}&to=${encodeURIComponent(`${to}T23:59:59.999Z`)}`), enabled: open && Boolean(from) && Boolean(to) && from <= to });
  const exportCsv = () => {
    const rows = query.data?.rows ?? []; const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [["Week starting", "Member", "Card", "Hours"], ...rows.map((row) => [row.week, row.userName, row.cardTitle, hours(row.seconds)])].map((row) => row.map((value) => quote(String(value))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "flowboard-time-report.csv"; anchor.click(); URL.revokeObjectURL(url);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Board time report</DialogTitle><DialogDescription>Tracked hours grouped by week, member, and card. Running timers are excluded until stopped.</DialogDescription></DialogHeader><div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs">From<Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label className="grid gap-1 text-xs">To<Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label><Button type="button" variant="outline" disabled={!query.data?.rows.length} onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</Button></div>{from > to && <p className="text-sm text-destructive">Start date must be before end date.</p>}<div className="max-h-[50vh] overflow-auto rounded-lg border">{query.isPending ? <div className="space-y-2 p-4" aria-label="Loading time report"><div className="h-8 animate-pulse rounded bg-muted" /><div className="h-8 animate-pulse rounded bg-muted" /></div> : query.isError ? <div className="flex items-center justify-between gap-2 p-4 text-sm"><span className="text-destructive">{query.error.message}</span><Button size="sm" variant="outline" onClick={() => void query.refetch()}>Retry</Button></div> : !query.data?.rows.length ? <p className="p-8 text-center text-sm text-muted-foreground">No tracked time in this date range.</p> : <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">Week</th><th className="p-2">Member</th><th className="p-2">Card</th><th className="p-2 text-right">Hours</th></tr></thead><tbody>{query.data.rows.map((row) => <tr key={`${row.week}-${row.userId}-${row.cardId}`} className="border-t"><td className="p-2">{row.week}</td><td className="p-2">{row.userName}</td><td className="max-w-64 truncate p-2">{row.cardTitle}</td><td className="p-2 text-right tabular-nums">{hours(row.seconds)}</td></tr>)}</tbody></table>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

