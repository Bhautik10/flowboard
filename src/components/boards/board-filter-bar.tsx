"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cardMatchesFilters } from "@/lib/board-filters";

type Card = Parameters<typeof cardMatchesFilters>[0];
type Option = { id: string; name: string; color?: string; image?: string | null };
type CustomField = { id: string; name: string; type: string; options: unknown };

function FilterMultiSelect({ label, options, selected, onChange, searchable = true }: { label: string; options: Option[]; selected: string[]; onChange: (value: string[]) => void; searchable?: boolean }) {
  const [query, setQuery] = useState("");
  const filtered = options.filter((option) => option.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-9 max-w-48 justify-between gap-2"><span className="truncate">{label}{selected.length > 0 && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{selected.length}</span>}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" /></Button></PopoverTrigger>
    <PopoverContent className="w-64 p-2" onOpenAutoFocus={(event) => { if (!searchable) event.preventDefault(); }}>
      {searchable && <div className="relative mb-2"><Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} className="h-8 pl-7" /></div>}
      <div role="group" aria-label={label} className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
        {filtered.map((option) => {
          const checked = selected.includes(option.id);
          return <button key={option.id} type="button" role="checkbox" aria-checked={checked} onClick={() => toggle(option.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded border" data-checked={checked}>{checked && <Check className="h-3 w-3" />}</span>
            {option.image ? <img src={option.image} alt="" className="h-5 w-5 rounded-full object-cover" /> : option.color ? <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: option.color }} /> : null}
            <span className="min-w-0 truncate">{option.name}</span>
          </button>;
        })}
        {filtered.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matches</p>}
      </div>
      <div className="mt-2 flex justify-between border-t pt-2"><span className="self-center text-xs text-muted-foreground">{selected.length} selected</span><Button type="button" variant="ghost" size="sm" disabled={!selected.length} onClick={() => onChange([])}>Clear</Button></div>
    </PopoverContent>
  </Popover>;
}

export function BoardFilterBar({ boardId, userId, role, cards, labels, members, customFields = [], params, onChange }: {
  boardId: string; userId: string; role: string; cards: Card[]; labels: Option[]; members: Option[]; customFields?: CustomField[]; params: URLSearchParams; onChange: (params: URLSearchParams) => void;
}) {
  const [savedName, setSavedName] = useState("");
  const [savedFilters, setSavedFilters] = useState<Array<{ name: string; query: string }>>([]);
  useEffect(() => {
    try { const value = JSON.parse(localStorage.getItem(`flowboard-filters:${boardId}:${userId}`) ?? "[]"); setSavedFilters(Array.isArray(value) ? value : []); } catch { setSavedFilters([]); }
  }, [boardId, userId]);
  const matches = useMemo(() => cards.filter((card) => cardMatchesFilters(card, params)).length, [cards, params]);
  const setValues = (key: string, values: string[]) => { const next = new URLSearchParams(params); next.delete(key); values.forEach((value) => next.append(key, value)); onChange(next); };
  const setSingle = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); onChange(next); };
  const enumOptions = (items: Array<[string, string]>) => items.map(([id, name]) => ({ id, name }));
  const save = () => {
    const name = savedName.trim(); if (!name) return;
    const next = [...savedFilters.filter((item) => item.name !== name), { name, query: params.toString() }];
    setSavedFilters(next); localStorage.setItem(`flowboard-filters:${boardId}:${userId}`, JSON.stringify(next)); setSavedName("");
  };
  return <section aria-label="Board filters" className="mb-4 rounded-xl border bg-background/90 p-3 shadow-sm">
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-40 flex-1 gap-1 text-xs text-muted-foreground">Keyword<Input aria-label="Filter cards by keyword" value={params.get("q") ?? ""} onChange={(event) => setSingle("q", event.target.value)} placeholder="Title or description" className="h-9" /></label>
      {labels.length > 0 && <FilterMultiSelect label="Labels" options={labels} selected={params.getAll("label")} onChange={(value) => setValues("label", value)} />}
      {role !== "CLIENT" && members.length > 0 && <FilterMultiSelect label="Members" options={members} selected={params.getAll("member")} onChange={(value) => setValues("member", value)} />}
      <FilterMultiSelect label="Due date" options={enumOptions([["overdue", "Overdue"], ["today", "Today"], ["week", "This week"], ["none", "No date"]])} selected={params.getAll("due")} onChange={(value) => setValues("due", value)} searchable={false} />
      <FilterMultiSelect label="Priority" options={enumOptions([["LOW", "Low"], ["NORMAL", "Normal"], ["HIGH", "High"], ["URGENT", "Urgent"]])} selected={params.getAll("priority")} onChange={(value) => setValues("priority", value)} searchable={false} />
      <FilterMultiSelect label="Completion" options={enumOptions([["incomplete", "Incomplete"], ["complete", "Complete"]])} selected={params.getAll("status")} onChange={(value) => setValues("status", value)} searchable={false} />
      <FilterMultiSelect label="Approval" options={enumOptions([["NONE", "No approval"], ["PENDING", "Pending"], ["APPROVED", "Approved"], ["CHANGES_REQUESTED", "Changes requested"]])} selected={params.getAll("approval")} onChange={(value) => setValues("approval", value)} searchable={false} />
      {customFields?.map((field) => {
        const key = `custom_${field.id}`;
        const optionValue = field.options && typeof field.options === "object" && "choices" in field.options ? (field.options as { choices?: unknown }).choices : [];
        const choices = Array.isArray(optionValue) ? optionValue.filter((item): item is string => typeof item === "string") : [];
        if (field.type === "DROPDOWN" || field.type === "CHECKBOX") return <label key={field.id} className="grid min-w-28 gap-1 text-xs text-muted-foreground">{field.name}<Select value={params.get(key) ?? "any"} onValueChange={(value) => setSingle(key, value === "any" ? "" : value)}><SelectTrigger aria-label={`Filter by ${field.name}`} className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Any</SelectItem>{field.type === "DROPDOWN" ? choices.map((choice) => <SelectItem key={choice} value={choice}>{choice}</SelectItem>) : <><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></>}</SelectContent></Select></label>;
        return <label key={field.id} className="grid min-w-28 gap-1 text-xs text-muted-foreground">{field.name}<Input aria-label={`Filter by ${field.name}`} type={field.type === "DATE" ? "date" : field.type === "NUMBER" ? "number" : "text"} value={params.get(key) ?? ""} onChange={(event) => setSingle(key, event.target.value)} className="h-9 max-w-44" /></label>;
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => { const next = new URLSearchParams(params); ["q", "label", "member", "due", "priority", "status", "approval", "only", ...customFields.map((field) => `custom_${field.id}`)].forEach((key) => next.delete(key)); onChange(next); }}><X className="mr-1 h-3.5 w-3.5" />Clear filters</Button>
      <label className="flex h-9 items-center gap-2 rounded-md border px-2 text-xs text-foreground"><input type="checkbox" checked={params.get("only") === "1"} onChange={(event) => setSingle("only", event.target.checked ? "1" : "")} className="accent-primary" />Hide non-matching</label>
      <span className="px-2 py-2 text-sm font-medium" aria-live="polite">{matches} of {cards.length} cards</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"><label className="sr-only" htmlFor="saved-filter-name">Saved filter name</label><Input id="saved-filter-name" className="h-8 max-w-48" placeholder="Name this filter" value={savedName} onChange={(event) => setSavedName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") save(); }} /><Button type="button" size="sm" variant="secondary" disabled={!savedName.trim()} onClick={save}>Save filter</Button>
      {savedFilters.map((filter) => <span key={filter.name} className="inline-flex items-center gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => onChange(new URLSearchParams(filter.query))}>{filter.name}</Button><button type="button" className="rounded px-1 text-muted-foreground hover:text-destructive" aria-label={`Delete ${filter.name}`} onClick={() => { const next = savedFilters.filter((item) => item.name !== filter.name); setSavedFilters(next); localStorage.setItem(`flowboard-filters:${boardId}:${userId}`, JSON.stringify(next)); }}>×</button></span>)}
    </div>
  </section>;
}
