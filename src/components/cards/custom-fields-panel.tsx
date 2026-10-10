"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Field = { id: string; name: string; type: "TEXT" | "NUMBER" | "DROPDOWN" | "DATE" | "CHECKBOX"; options: unknown; required: boolean };
type Value = { customFieldId: string; value: unknown };
function choices(options: unknown): string[] {
  if (Array.isArray(options)) return options.filter((item): item is string => typeof item === "string");
  if (options && typeof options === "object" && "choices" in options && Array.isArray((options as { choices: unknown }).choices)) return ((options as { choices: unknown[] }).choices).filter((item): item is string => typeof item === "string");
  return [];
}
function formatValue(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function displayValue(field: Field, value: unknown): string { const text = formatValue(value); return field.type === "DATE" && text ? text.slice(0, 10) : text; }

export function CustomFieldsPanel({ boardId, cardId, fields, values, canEdit }: { boardId: string; cardId: string; fields: Field[]; values: Value[]; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const initial = () => Object.fromEntries(values.map((item) => [item.customFieldId, item.value]));
  const [draft, setDraft] = useState<Record<string, unknown>>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(Object.fromEntries(values.map((item) => [item.customFieldId, item.value]))); }, [cardId, values]);
  if (!fields.length) return null;
  const save = async () => {
    setSaving(true);
    try {
      const next = fields.map((field) => {
        const raw = draft[field.id];
        const value = raw === "" || raw === undefined ? null : field.type === "NUMBER" && typeof raw === "string" ? Number(raw) : field.type === "DATE" && typeof raw === "string" ? new Date(`${raw}T00:00:00.000Z`).toISOString() : raw;
        return { fieldId: field.id, value };
      });
      const response = await fetch(`/api/cards/${cardId}/custom-fields`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: next }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not save custom fields");
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["card-detail", cardId] }), queryClient.invalidateQueries({ queryKey: ["board", boardId] })]);
      toast.success("Custom fields saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save custom fields"); }
    finally { setSaving(false); }
  };
  return <section className="space-y-3" aria-labelledby="custom-fields-heading">
    <h3 id="custom-fields-heading" className="text-sm font-semibold">Custom fields</h3>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map((field) => {
      const value = draft[field.id];
      return <label key={field.id} className="grid gap-1.5 text-xs font-medium text-muted-foreground">{field.name}{field.required ? " *" : ""}
        {field.type === "CHECKBOX" ? <input type="checkbox" aria-label={field.name} checked={value === true} disabled={!canEdit} onChange={(event) => setDraft((old) => ({ ...old, [field.id]: event.target.checked }))} className="h-4 w-4 accent-primary" />
          : field.type === "DROPDOWN" ? <select aria-label={field.name} value={formatValue(value)} disabled={!canEdit} onChange={(event) => setDraft((old) => ({ ...old, [field.id]: event.target.value }))} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"><option value="">Select…</option>{choices(field.options).map((option) => <option key={option} value={option}>{option}</option>)}</select>
          : <Input aria-label={field.name} type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"} value={displayValue(field, value)} disabled={!canEdit} onChange={(event) => setDraft((old) => ({ ...old, [field.id]: event.target.value }))} />}
      </label>;
    })}</div>
    {canEdit && <div className="flex justify-end"><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save fields"}</Button></div>}
  </section>;
}
