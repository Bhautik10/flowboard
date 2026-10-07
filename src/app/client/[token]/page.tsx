"use client";

import { FormEvent, useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type PortalCard = {
  id: string;
  title: string;
  description: string | null;
  approvalStatus: "NONE" | "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
  revisionRound: number;
  attachments: { id: string; type: "IMAGE" | "FILE" | "LINK"; name: string; url?: string; sizeBytes: number | null }[];
  comments: { id: string; body: string; createdAt: string; authorName: string }[];
};
type PortalData = { board: { id: string; title: string }; clientName: string | null; lists: { id: string; title: string; cards: PortalCard[] }[] };
type PortalImage = { id: string; name: string; url: string; versionNumber: number };
type PortalPin = { id: string; body: string; x: number; y: number; resolvedAt: string | null; authorName: string };

function approvalLabel(card: PortalCard) {
  if (card.approvalStatus === "PENDING") return `Awaiting your approval · Round ${card.revisionRound}`;
  if (card.approvalStatus === "APPROVED") return `Approved · Round ${card.revisionRound}`;
  if (card.approvalStatus === "CHANGES_REQUESTED") return `Changes requested · Round ${card.revisionRound}`;
  return "Not yet submitted";
}

export default function ClientProjectPage({ params }: { params: { token: string } }) {
  const queryClient = useQueryClient();
  const queryKey = ["client-portal", params.token];
  const { data, isPending, isError } = useQuery<PortalData>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/client-portal/${params.token}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not open this client link");
      return result as PortalData;
    },
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [changeNotes, setChangeNotes] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PortalImage | null>(null);
  const pinsQuery = useQuery<{ pins: PortalPin[] }>({
    queryKey: ["client-pins", preview?.id, params.token],
    queryFn: async () => {
      const response = await fetch(`/api/attachments/${preview?.id}/pins?share=${params.token}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load pins");
      return result as { pins: PortalPin[] };
    },
    enabled: Boolean(preview),
  });
  const versionsQuery = useQuery<{ versions: PortalImage[] }>({
    queryKey: ["client-versions", preview?.id, params.token],
    queryFn: async () => {
      const response = await fetch(`/api/attachments/${preview?.id}/versions?share=${params.token}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load versions");
      return result as { versions: PortalImage[] };
    },
    enabled: Boolean(preview),
  });

  const action = useMutation({
    mutationFn: async ({ cardId, payload }: { cardId: string; payload: Record<string, string> }) => {
      const response = await fetch(`/api/client-portal/${params.token}/cards/${cardId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not save your response");
      return { cardId, payload, result };
    },
    onMutate: async ({ cardId, payload }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PortalData>(queryKey);
      if (previous) {
        queryClient.setQueryData<PortalData>(queryKey, {
          ...previous,
          lists: previous.lists.map((list) => ({
            ...list,
            cards: list.cards.map((card) => card.id !== cardId ? card : payload.action === "comment"
              ? { ...card, comments: [...card.comments, { id: `pending-${Date.now()}`, body: payload.body, createdAt: new Date().toISOString(), authorName: previous.clientName ?? "Client" }] }
              : { ...card, approvalStatus: payload.action === "approve" ? "APPROVED" : "CHANGES_REQUESTED", revisionRound: payload.action === "request-changes" ? card.revisionRound + 1 : card.revisionRound }),
          })),
        });
      }
      return { previous };
    },
    onError: (error, { cardId, payload }, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      if (payload.action === "comment") {
        setDrafts((current) => ({ ...current, [cardId]: payload.body ?? current[cardId] ?? "" }));
      }
      toast.error(error.message);
    },
    onSuccess: async ({ payload }) => {
      if (payload.action === "comment") toast.success("Comment added");
      else toast.success(payload.action === "approve" ? "Design approved" : "Changes requested");
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  async function submitComment(event: FormEvent<HTMLFormElement>, cardId: string) {
    event.preventDefault();
    const body = drafts[cardId]?.trim();
    if (!body) return;
    setDrafts((current) => ({ ...current, [cardId]: "" }));
    action.mutate({ cardId, payload: { action: "comment", body } });
  }

  async function uploadFile(cardId: string, file: File) {
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch(`/api/client-portal/${params.token}/cards/${cardId}`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Upload failed");
      toast.success("File uploaded");
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  }

    async function addPin(event: MouseEvent<HTMLDivElement>) {
      if (!preview) return;
      const image = event.currentTarget.querySelector("img");
      if (!image) return;
      const rect = image.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
      const body = window.prompt("What feedback should be pinned here?")?.trim();
      if (!body) return;
      try {
        const response = await fetch(`/api/attachments/${preview.id}/pins?share=${params.token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, x, y }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not add pin");
        await queryClient.invalidateQueries({ queryKey: ["client-pins", preview.id, params.token] });
        toast.success("Design feedback pinned");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add pin");
      }
    }

    async function uploadVersion(file: File) {
      if (!preview) return;
      const form = new FormData();
      form.set("file", file);
      try {
        const response = await fetch(`/api/attachments/${preview.id}/versions?share=${params.token}`, { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not upload version");
        setPreview(result.version as PortalImage);
        await queryClient.invalidateQueries({ queryKey });
        toast.success(`Uploaded version ${result.version.versionNumber}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not upload version");
      }
    }

    async function resolvePin(pin: PortalPin, resolved: boolean) {
      try {
        const response = await fetch(`/api/design-pins/${pin.id}?share=${params.token}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolved }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not update pin");
        await queryClient.invalidateQueries({ queryKey: ["client-pins", preview?.id, params.token] });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update pin");
      }
    }
  if (isPending) return <main className="mx-auto max-w-5xl space-y-4 p-6"><div className="h-10 w-1/2 animate-pulse rounded bg-muted" /><div className="h-48 animate-pulse rounded-xl bg-muted" /></main>;
  if (isError || !data) return <main className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold">Project link unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This client link may have expired or been revoked.</p></main>;

  return <main className="mx-auto min-h-screen max-w-5xl space-y-8 p-5 sm:p-8">
    <header className="border-b pb-5">
      <p className="text-sm text-muted-foreground">Client review portal{data.clientName ? ` · ${data.clientName}` : ""}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{data.board.title}</h1>
    </header>
    {data.lists.map((list) => <section key={list.id} className="space-y-3">
      <h2 className="text-lg font-semibold">{list.title}</h2>
      {!list.cards.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing to review in this section.</p>}
      {list.cards.map((card) => <article key={card.id} className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-xl font-semibold">{card.title}</h3>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{approvalLabel(card)}</span>
        </div>
        {card.description && <div className="prose prose-sm max-w-none break-words dark:prose-invert"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{card.description}</ReactMarkdown></div>}
        {card.attachments.length > 0 && <ul className="flex flex-wrap gap-3">{card.attachments.map((attachment) => <li key={attachment.id}>
          {attachment.type === "IMAGE" && attachment.url
            ? <button type="button" onClick={() => setPreview({ id: attachment.id, name: attachment.name, url: attachment.url!, versionNumber: 1 })} aria-label={`Review ${attachment.name}`}><img src={attachment.url} alt={attachment.name} className="max-h-56 max-w-72 rounded-lg border object-contain" /></button>
            : <a className="text-sm text-primary underline" href={attachment.url} target="_blank" rel="noreferrer">{attachment.name}</a>}
        </li>)}</ul>}
        <div className="space-y-2 border-t pt-3">
          <h4 className="text-sm font-semibold">Client conversation</h4>
          {card.comments.map((comment) => <div key={comment.id} className="rounded-lg bg-muted/60 p-3 text-sm"><p className="font-medium">{comment.authorName} <span className="font-normal text-muted-foreground">· {new Date(comment.createdAt).toLocaleString()}</span></p><p className="mt-1 whitespace-pre-wrap">{comment.body}</p></div>)}
          {!card.comments.length && <p className="text-sm text-muted-foreground">No client comments yet.</p>}
          <form className="flex gap-2" onSubmit={(event) => void submitComment(event, card.id)}>
            <input value={drafts[card.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [card.id]: event.target.value }))} maxLength={10000} className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Leave a comment" aria-label={`Comment on ${card.title}`} />
            <Button type="submit" size="sm" disabled={!drafts[card.id]?.trim() || action.isPending}>Comment</Button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <label className="cursor-pointer rounded-md border px-3 py-2 text-sm hover:bg-muted">
            Upload image/PDF
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void uploadFile(card.id, file);
              event.currentTarget.value = "";
            }} />
          </label>
          {card.approvalStatus === "PENDING" && <>
            <Button size="sm" disabled={action.isPending} onClick={() => action.mutate({ cardId: card.id, payload: { action: "approve" } })}>Approve</Button>
            <input value={changeNotes[card.id] ?? ""} onChange={(event) => setChangeNotes((current) => ({ ...current, [card.id]: event.target.value }))} maxLength={5000} className="min-w-[12rem] flex-1 rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Note required to request changes" aria-label={`Change request note for ${card.title}`} />
            <Button variant="outline" size="sm" disabled={action.isPending || !changeNotes[card.id]?.trim()} onClick={() => {
              const note = changeNotes[card.id]?.trim();
              if (note) action.mutate({ cardId: card.id, payload: { action: "request-changes", body: note } });
            }}>Request changes</Button>
          </>}
        </div>
      </article>)}
    </section>)}
    {!data.lists.some((list) => list.cards.length) && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">The team has not shared any work for review yet.</p>}
    <footer className="border-t pt-4 text-xs text-muted-foreground">This link only shows items the project team has shared with you.</footer>
    {preview && <div role="dialog" aria-modal="true" aria-label={`Review ${preview.name}`} className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-4" onClick={() => setPreview(null)}>
      <div className="grid max-h-[90dvh] w-full max-w-6xl gap-4 overflow-auto rounded-xl bg-background p-4 text-foreground lg:grid-cols-[minmax(0,1fr)_18rem]" onClick={(event) => event.stopPropagation()}>
        <section className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="truncate font-semibold">{preview.name} · v{preview.versionNumber}</h2>
            <div className="flex gap-2">
              {versionsQuery.data && <select aria-label="Choose design version" value={preview.id} onChange={(event) => {
                const selected = versionsQuery.data?.versions.find((version) => version.id === event.target.value);
                if (selected) setPreview(selected);
              }} className="max-w-40 rounded border bg-background px-2 py-1 text-sm">{versionsQuery.data.versions.map((version) => <option key={version.id} value={version.id}>v{version.versionNumber}</option>)}</select>}
              <label className="cursor-pointer rounded border px-2 py-1 text-xs hover:bg-muted">Upload version<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadVersion(file);
                event.currentTarget.value = "";
              }} /></label>
              <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)}>Close</Button>
            </div>
          </div>
          <div className="relative mx-auto inline-block max-h-[70dvh] max-w-full cursor-crosshair" onClick={(event) => void addPin(event)}>
            <img src={preview.url} alt={preview.name} className="block max-h-[70dvh] max-w-full object-contain" />
            {pinsQuery.data?.pins.map((pin, index) => <button key={pin.id} type="button" title={pin.body} aria-label={`Pin ${index + 1}: ${pin.body}`} onClick={(event) => event.stopPropagation()} style={{ left: `${pin.x}%`, top: `${pin.y}%` }} className={`absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${pin.resolvedAt ? "bg-emerald-600" : "bg-primary"}`}>{index + 1}</button>)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Click a point on the image to leave pinned feedback.</p>
        </section>
        <aside className="space-y-2 border-t pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <h3 className="font-semibold">Pinned feedback</h3>
          {pinsQuery.data?.pins.map((pin, index) => <article key={pin.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">#{index + 1} · Client · {pin.resolvedAt ? "Resolved" : "Open"}</p>
            <p className="mt-1 whitespace-pre-wrap">{pin.body}</p>
            <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => void resolvePin(pin, !pin.resolvedAt)}>{pin.resolvedAt ? "Reopen" : "Resolve"}</Button>
          </article>)}
          {!pinsQuery.data?.pins.length && <p className="text-sm text-muted-foreground">No pinned comments yet.</p>}
        </aside>
      </div>
    </div>}
  </main>;
}
