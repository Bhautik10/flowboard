"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { positionBetween } from "@/lib/position";

type Field = { id: string; name: string; type: "TEXT" | "NUMBER" | "DROPDOWN" | "DATE" | "CHECKBOX"; options: unknown; required: boolean; position: string };
type FieldResponse = { fields: Field[] };
async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = result.error;
    const message = typeof error === "string" ? error : error && typeof error === "object" ? Object.values(error as Record<string, unknown>).flat().find((item): item is string => typeof item === "string") : undefined;
    throw new Error(message ?? "Custom fields could not be updated");
  }
  return result as T;
}
function fieldOptions(value: unknown) {
  if (Array.isArray(value)) return { choices: value.filter((item): item is string => typeof item === "string"), showOnCard: false };
  if (value && typeof value === "object") {
    const options = value as { choices?: unknown; showOnCard?: unknown };
    return { choices: Array.isArray(options.choices) ? options.choices.filter((item): item is string => typeof item === "string") : [], showOnCard: options.showOnCard === true };
  }
  return { choices: [], showOnCard: false };
}

export function CustomFieldManager({ boardId, open, onOpenChange }: { boardId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const fieldsQuery = useQuery({ queryKey: ["custom-fields", boardId], queryFn: () => request<FieldResponse>(`/api/boards/${boardId}/custom-fields`), enabled: open });
  const fields = fieldsQuery.data?.fields ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState(""); const [type, setType] = useState<Field["type"]>("TEXT"); const [options, setOptions] = useState(""); const [required, setRequired] = useState(false); const [showOnCard, setShowOnCard] = useState(false); const [saving, setSaving] = useState(false);
  const reset = () => { setEditingId(null); setName(""); setType("TEXT"); setOptions(""); setRequired(false); setShowOnCard(false); };
  const invalidate = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["custom-fields", boardId] }), queryClient.invalidateQueries({ queryKey: ["board", boardId] })]); };
  const startEdit = (field: Field) => { const config = fieldOptions(field.options); setEditingId(field.id); setName(field.name); setType(field.type); setOptions(config.choices.join("\n")); setRequired(field.required); setShowOnCard(config.showOnCard); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    const payload = { name: name.trim(), type, options: type === "DROPDOWN" ? options.split("\n").map((value) => value.trim()).filter(Boolean) : undefined, required, showOnCard };
    try { await request(`/api/boards/${boardId}/custom-fields${editingId ? `/${editingId}` : ""}`, editingId ? "PATCH" : "POST", payload); await invalidate(); toast.success(editingId ? "Custom field updated" : "Custom field created"); reset(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save custom field"); }
    finally { setSaving(false); }
  };
  const archive = async (field: Field) => {
    if (!window.confirm(`Remove “${field.name}” from this board? Existing values will be preserved.`)) return;
    try { await request(`/api/boards/${boardId}/custom-fields/${field.id}`, "DELETE"); await invalidate(); toast.success("Field archived; existing values were preserved"); if (editingId === field.id) reset(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not archive field"); }
  };
  const reorder = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= fields.length) return;
    const ordered = [...fields]; const [field] = ordered.splice(index, 1); ordered.splice(nextIndex, 0, field);
    const before = ordered[nextIndex - 1]?.position ?? null; const after = ordered[nextIndex + 1]?.position ?? null;
    try { await request(`/api/boards/${boardId}/custom-fields/${field.id}`, "PATCH", { position: positionBetween(before, after) }); await invalidate(); toast.success("Custom fields reordered"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not reorder fields"); }
  };
  return <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Board custom fields</DialogTitle><DialogDescription>Create reusable fields for cards. Removing a field archives it and preserves saved values.</DialogDescription></DialogHeader>
      <div className="max-h-52 space-y-2 overflow-y-auto">
        {fieldsQuery.isPending ? <div className="space-y-2" role="status"><div className="h-10 animate-pulse rounded bg-muted" /><div className="h-10 animate-pulse rounded bg-muted" /></div> : fieldsQuery.isError ? <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 p-3 text-sm"><span className="text-destructive">{fieldsQuery.error.message}</span><Button size="sm" variant="outline" onClick={() => void fieldsQuery.refetch()}>Retry</Button></div> : fields.length ? fields.map((field, index) => <div key={field.id} className="flex items-center gap-2 rounded-lg border p-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{field.name}{field.required ? " · required" : ""}</p><p className="text-xs text-muted-foreground">{field.type.toLowerCase()}{fieldOptions(field.options).showOnCard ? " · shown on card" : ""}</p></div><Button size="icon" variant="ghost" aria-label={`Move ${field.name} up`} disabled={index === 0} onClick={() => void reorder(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Move ${field.name} down`} disabled={index === fields.length - 1} onClick={() => void reorder(index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Edit ${field.name}`} onClick={() => startEdit(field)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Archive ${field.name}`} onClick={() => void archive(field)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>) : <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No custom fields yet. Add one below.</p>}
      </div>
      <form onSubmit={(event) => void submit(event)} className="space-y-3 border-t pt-4">
        <div className="flex items-center gap-2"><Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Field name" aria-label="Custom field name" required /><select className="h-10 rounded-md border bg-background px-2 text-sm" aria-label="Custom field type" value={type} onChange={(event) => setType(event.target.value as Field["type"])}><option value="TEXT">Text</option><option value="NUMBER">Number</option><option value="DROPDOWN">Dropdown</option><option value="DATE">Date</option><option value="CHECKBOX">Checkbox</option></select></div>
        {type === "DROPDOWN" && <label className="block space-y-1 text-xs text-muted-foreground">Options (one per line)<textarea className="min-h-20 w-full rounded-md border bg-background p-2 text-sm text-foreground" value={options} onChange={(event) => setOptions(event.target.value)} aria-label="Dropdown options" required /></label>}
        <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />Required</label><label className="flex items-center gap-2"><input type="checkbox" checked={showOnCard} onChange={(event) => setShowOnCard(event.target.checked)} />Show on card face</label></div>
        <DialogFooter><Button type="button" variant="outline" onClick={reset}>{editingId ? "Cancel edit" : "Clear"}</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : editingId ? "Save field" : <><Plus className="h-4 w-4" /> Add field</>}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
