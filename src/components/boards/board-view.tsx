"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Archive,
  CalendarDays,
  CheckSquare,
  Copy,
  FileText,
  Flag,
  GripHorizontal,
  MoreHorizontal,
  MessageSquare,
  Paperclip,
  Palette,
  Plus,
  Settings2,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CardDetailDialog } from "@/components/cards/card-detail-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MAX_POSITION_LENGTH,
  positionBetween,
  positionsNeedRebalance,
  rebalancePositions,
} from "@/lib/position";

type Card = {
  id: string;
  title: string;
  position: string;
  description?: string | null;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dueDate?: string | Date | null;
  isComplete?: boolean;
  labels?: { id: string; name: string; color: string }[];
  members?: { id: string; name: string | null; image: string | null }[];
  checklists?: { items: { isComplete: boolean }[] }[];
  coverValue?: string | null;
  approvalStatus?: "NONE" | "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
  revisionRound?: number;
  attachments?: { id: string }[];
  _count?: { attachments: number; comments: number };
};
type BoardList = {
  id: string;
  title: string;
  position: string;
  wipLimit: number | null;
  cards: Card[];
};
type Board = {
  id: string;
  title: string;
  backgroundColor: string | null;
  backgroundImage: string | null;
  visibility: "PRIVATE" | "WORKSPACE" | "PUBLIC";
  isFavorite: boolean;
  workspace: { id: string; name: string };
  lists: BoardList[];
};
type BoardResponse = { board: Board; role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "CLIENT" };
type DragItemData =
  | { type: "list"; listId: string; title: string }
  | { type: "card"; cardId: string; listId: string; title: string }
  | { type: "list-drop"; listId: string; title: string };

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

function getData(event: DragStartEvent | DragOverEvent | DragEndEvent): DragItemData | undefined {
  return event.active.data.current as DragItemData | undefined;
}

function getOverData(event: DragOverEvent | DragEndEvent): DragItemData | undefined {
  return event.over?.data.current as DragItemData | undefined;
}

function idForList(listId: string) {
  return `list:${listId}`;
}

function idForCard(cardId: string) {
  return `card:${cardId}`;
}

function rebalanceLists(lists: BoardList[]): BoardList[] {
  const ranks = new Map(
    rebalancePositions(lists).map((entry) => [entry.id, entry.position]),
  );
  return lists.map((list) => ({ ...list, position: ranks.get(list.id)! }));
}

function rankedCards(cards: Card[]): Card[] {
  if (positionsNeedRebalance(cards.map((card) => card.position))) {
    const ranks = new Map(
      rebalancePositions(cards).map((entry) => [entry.id, entry.position]),
    );
    return cards.map((card) => ({ ...card, position: ranks.get(card.id)! }));
  }
  return cards;
}

function WipLimitEditor({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (value: number | null) => void;
}) {
  const [input, setInput] = useState(value?.toString() ?? "");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = input.trim();
        const nextValue = trimmed ? Number(trimmed) : null;
        if (
          nextValue !== null &&
          (!Number.isInteger(nextValue) || nextValue < 1 || nextValue > 10000)
        ) {
          toast.error("WIP limit must be a whole number between 1 and 10,000");
          return;
        }
        onSave(nextValue);
      }}
    >
      <div>
        <p className="text-sm font-semibold">Work in progress limit</p>
        <p className="text-xs text-muted-foreground">Leave empty for no limit.</p>
      </div>
      <Input
        type="number"
        min={1}
        max={10000}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        aria-label="WIP limit"
      />
      <Button type="submit" size="sm" className="w-full">
        Save limit
      </Button>
    </form>
  );
}

function reorderListPositions(
  lists: BoardList[],
  order: string[],
  movedId: string,
): BoardList[] {
  const ordered = order.map((id) => lists.find((list) => list.id === id)!);
  if (positionsNeedRebalance(lists.map((list) => list.position))) {
    return rebalanceLists(ordered);
  }
  const index = ordered.findIndex((list) => list.id === movedId);
  const position = positionBetween(
    index ? ordered[index - 1].position : null,
    index < ordered.length - 1 ? ordered[index + 1].position : null,
  );
  if (
    position.length > MAX_POSITION_LENGTH ||
    lists.some((list) => list.id !== movedId && list.position === position)
  ) {
    return rebalanceLists(ordered);
  }
  return ordered.map((list) =>
    list.id === movedId ? { ...list, position } : list,
  );
}

function insertCard(
  lists: BoardList[],
  card: Card,
  targetListId: string,
  targetIndex: number,
): BoardList[] {
  const withoutCard = lists.map((list) => ({
    ...list,
    cards: list.cards.filter((item) => item.id !== card.id),
  }));
  return withoutCard.map((list) => {
    if (list.id !== targetListId) return list;
    const cards = [...list.cards];
    cards.splice(Math.max(0, Math.min(targetIndex, cards.length)), 0, card);
    const ranked = rankedCards(cards);
    if (ranked !== cards) return { ...list, cards: ranked };
    const index = cards.findIndex((item) => item.id === card.id);
    const position = positionBetween(
      index ? cards[index - 1].position : null,
      index < cards.length - 1 ? cards[index + 1].position : null,
    );
    if (
      position.length > MAX_POSITION_LENGTH ||
      cards.some((item) => item.id !== card.id && item.position === position)
    ) {
      const rebalanced = rankedCards(cards.map((item) =>
        item.id === card.id ? { ...item, position } : item,
      ));
      return { ...list, cards: rebalanced };
    }
    return {
      ...list,
      cards: cards.map((item) =>
        item.id === card.id ? { ...item, position } : item,
      ),
    };
  });
}

function SortableCard({
  card,
  listId,
  canEdit,
  editingCard,
  setEditingCard,
  submitOnEnter,
  changeCard,
  openCard,
}: {
  card: Card;
  listId: string;
  canEdit: boolean;
  editingCard: string | null;
  setEditingCard: (id: string | null) => void;
  submitOnEnter: (event: KeyboardEvent<HTMLInputElement>) => void;
  changeCard: (variables: { cardId: string; method: string; body?: unknown }) => void;
  openCard: (cardId: string) => void;
}) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
  }, []);
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: idForCard(card.id),
    disabled: !canEdit || editingCard === card.id,
    data: { type: "card", cardId: card.id, listId, title: card.title } satisfies DragItemData,
  });

  return (
    <motion.div
      layout="position"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/card relative flex min-h-[6.5rem] min-w-0 cursor-pointer flex-col gap-2 rounded-xl border border-border/80 bg-background p-3 shadow-sm transition-[box-shadow,border-color,transform] hover:border-border hover:shadow-md",
        isDragging && "border-dashed opacity-35",
      )}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button,input,[data-card-no-open]")) return;
        if (clickTimer.current) clearTimeout(clickTimer.current);
        clickTimer.current = setTimeout(() => openCard(card.id), 350);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) openCard(card.id);
      }}
    >
      {card.labels?.length ? (
        <div className="flex w-full flex-wrap gap-1.5" data-card-no-open>
          {card.labels.slice(0, 6).map((label) => (
            <span
              key={label.id}
              className="h-1.5 min-w-8 max-w-20 flex-1 rounded-full"
              style={{ backgroundColor: label.color }}
              title={label.name}
              aria-label={label.name}
            />
          ))}
        </div>
      ) : null}
      {card.coverValue && card.coverValue.startsWith("/api/attachments/") ? (
        <div className="-mx-3 -mt-3 h-24 w-[calc(100%+1.5rem)] overflow-hidden rounded-t-xl">
          <Image
            src={card.coverValue}
            alt=""
            width={320}
            height={160}
            unoptimized
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      {editingCard === card.id ? (
        <Input
          autoFocus
          defaultValue={card.title}
          aria-label="Edit card title"
          className="h-auto min-h-8 w-full px-2 py-1"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={(event) => {
            const title = event.currentTarget.value.trim();
            const cancelled = event.currentTarget.dataset.cancel === "true";
            delete event.currentTarget.dataset.cancel;
            setEditingCard(null);
            if (!cancelled && title && title !== card.title) {
              changeCard({ cardId: card.id, method: "PATCH", body: { title } });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.dataset.cancel = "true";
              setEditingCard(null);
              event.currentTarget.blur();
              return;
            }
            submitOnEnter(event);
          }}
        />
      ) : (
        <div
          className="w-full min-w-0 flex-1 break-words text-left text-sm leading-5 [overflow-wrap:anywhere]"
          onDoubleClick={(event) => {
            if (!canEdit) return;
            event.stopPropagation();
            if (clickTimer.current) clearTimeout(clickTimer.current);
            setEditingCard(card.id);
          }}
          title={canEdit ? "Double-click to rename" : card.title}
          aria-label={card.title}
        >
          {card.title}
        </div>
      )}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className="absolute right-2 top-2 z-10 rounded-md bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition hover:bg-muted group-hover/card:opacity-100 focus:opacity-100"
              aria-label={`Actions for ${card.title}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuItem onClick={() => openCard(card.id)}>
              Open details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => changeCard({ cardId: card.id, method: "PATCH", body: { priority: "LOW" } })}
            >
              <Flag className="h-3.5 w-3.5 text-slate-500" /> Set priority: Low
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => changeCard({ cardId: card.id, method: "PATCH", body: { priority: "NORMAL" } })}
            >
              <Flag className="h-3.5 w-3.5 text-emerald-600" /> Set priority: Normal
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => changeCard({ cardId: card.id, method: "PATCH", body: { priority: "HIGH" } })}
            >
              <Flag className="h-3.5 w-3.5 text-orange-500" /> Set priority: High
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => changeCard({ cardId: card.id, method: "PATCH", body: { priority: "URGENT" } })}
            >
              <Flag className="h-3.5 w-3.5 text-red-600" /> Set priority: Urgent
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                changeCard({ cardId: card.id, method: "PATCH", body: { archived: true } })
              }
            >
              Archive card
            </DropdownMenuItem>
            <DropdownMenuItem
              destructive
              onClick={() => {
                if (window.confirm(`Delete "${card.title}"?`)) {
                  changeCard({ cardId: card.id, method: "DELETE" });
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete card
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {(card.priority || card.dueDate || card.description || card.checklists?.length || card.members?.length || card._count?.attachments || card._count?.comments || (card.approvalStatus && card.approvalStatus !== "NONE")) ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5" data-card-no-open>
          {card.priority && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                card.priority === "LOW" && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                card.priority === "NORMAL" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                card.priority === "HIGH" && "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
                card.priority === "URGENT" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
              )}
            >
              <Flag className={cn("h-3 w-3", card.priority === "LOW" && "text-blue-500", card.priority === "URGENT" && "text-red-600")} />
              {card.priority === "URGENT" ? "Urgent" : card.priority === "HIGH" ? "High" : card.priority === "NORMAL" ? "Normal" : "Low"}
            </span>
          )}
          {card.approvalStatus && card.approvalStatus !== "NONE" && (
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              card.approvalStatus === "APPROVED" && "bg-emerald-100 text-emerald-700",
              card.approvalStatus === "PENDING" && "bg-sky-100 text-sky-700",
              card.approvalStatus === "CHANGES_REQUESTED" && "bg-amber-100 text-amber-800",
            )}>
              {card.approvalStatus === "CHANGES_REQUESTED" ? "Changes" : card.approvalStatus === "PENDING" ? "Review" : "Approved"}
              {card.revisionRound ? ` · R${card.revisionRound}` : ""}
            </span>
          )}
          {card.dueDate && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]", card.isComplete ? "bg-emerald-100 text-emerald-700" : new Date(card.dueDate).getTime() < Date.now() ? "bg-red-100 text-red-700" : new Date(card.dueDate).getTime() < Date.now() + 3 * 86400000 ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground")}>
              <CalendarDays className="h-3 w-3" />
              {new Date(card.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {card.checklists?.map((checklist, index) => {
            const done = checklist.items.filter((item) => item.isComplete).length;
            return <span key={index} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><CheckSquare className="h-3 w-3" />{done}/{checklist.items.length}</span>;
          })}
          {card.description && <FileText className="h-3 w-3 text-muted-foreground" aria-label="Has description" />}
          {!!card._count?.attachments && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title={`${card._count.attachments} attachments`}><Paperclip className="h-3 w-3" />{card._count.attachments}</span>}
          {!!card._count?.comments && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title={`${card._count.comments} comments`}><MessageSquare className="h-3 w-3" />{card._count.comments}</span>}
          <span className="ml-auto flex shrink-0 items-center -space-x-1">
          {card.members?.slice(0, 3).map((member) => (
            member.image
              ? <Image key={member.id} src={member.image} alt={member.name ?? "Member"} title={member.name ?? "Member"} width={20} height={20} unoptimized className="h-5 w-5 rounded-full object-cover ring-1 ring-background" />
              : <span key={member.id} title={member.name ?? "Member"} className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">{(member.name ?? "?").slice(0, 1).toUpperCase()}</span>
          ))}
          </span>
        </div>
      ) : null}
    </motion.div>
  );
}

function SortableListColumn({
  list,
  canEdit,
  editingCard,
  activeCardDragging,
  setEditingCard,
  submitOnEnter,
  changeList,
  copyList,
  changeCard,
  newCards,
  setNewCards,
  submitCard,
  addCardPending,
  openCard,
}: {
  list: BoardList;
  canEdit: boolean;
  editingCard: string | null;
  activeCardDragging: boolean;
  setEditingCard: (id: string | null) => void;
  submitOnEnter: (event: KeyboardEvent<HTMLInputElement>) => void;
  changeList: (variables: { listId: string; method: string; body?: unknown }) => void;
  copyList: (listId: string) => void;
  changeCard: (variables: { cardId: string; method: string; body?: unknown }) => void;
  newCards: Record<string, string>;
  setNewCards: (update: (old: Record<string, string>) => Record<string, string>) => void;
  submitCard: (event: FormEvent<HTMLFormElement>, listId: string) => void;
  addCardPending: boolean;
  openCard: (cardId: string) => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: idForList(list.id),
    data: { type: "list", listId: list.id, title: list.title } satisfies DragItemData,
    disabled: !canEdit,
  });
  const { isOver, setNodeRef: setCardsDropRef } = useDroppable({
    id: `list-drop:${list.id}`,
    data: { type: "list-drop", listId: list.id, title: list.title } satisfies DragItemData,
    disabled: !canEdit,
  });

  return (
    <motion.article
      layout="position"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex h-fit max-h-[calc(100vh-12rem)] min-h-36 w-72 shrink-0 flex-col rounded-2xl border border-black/5 bg-muted/95 shadow-lg transition-shadow hover:shadow-xl dark:border-white/10",
        isDragging && "opacity-40",
      )}
    >
      <header className="flex items-center gap-2 p-3">
        {canEdit && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab touch-pan-y rounded p-0.5 text-muted-foreground hover:bg-background active:cursor-grabbing"
            aria-label={`Drag list ${list.title}`}
            title="Drag list"
          >
            <GripHorizontal className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          disabled={!canEdit}
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold disabled:cursor-default"
          title={canEdit ? "Rename list" : list.title}
          onClick={() => {
            const title = window.prompt("List title", list.title)?.trim();
            if (title && title !== list.title) {
              changeList({ listId: list.id, method: "PATCH", body: { title } });
            }
          }}
        >
          {list.title}
        </button>
        <span
          className={cn(
            "shrink-0 text-xs text-muted-foreground",
            list.wipLimit && list.cards.length >= list.wipLimit && "font-semibold text-destructive",
          )}
          title={list.wipLimit ? `Work in progress limit: ${list.wipLimit}` : "No WIP limit"}
        >
          {list.cards.length}{list.wipLimit ? `/${list.wipLimit}` : ""}
        </span>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-background"
              aria-label={`Actions for ${list.title}`}
              >
              <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
              <Popover>
              <PopoverTrigger asChild>
                <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              Set WIP limit
                </DropdownMenuItem>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <WipLimitEditor
                  value={list.wipLimit}
                  onSave={(wipLimit) =>
                    changeList({ listId: list.id, method: "PATCH", body: { wipLimit } })
                  }
                />
              </PopoverContent>
              </Popover>
              <DropdownMenuItem
              onClick={() => copyList(list.id)}
              >
              <Copy className="h-3.5 w-3.5" /> Copy list
              </DropdownMenuItem>
              <DropdownMenuItem
              onClick={() => changeList({ listId: list.id, method: "PATCH", body: { archived: true } })}
              >
              <Archive className="h-3.5 w-3.5" /> Archive list
              </DropdownMenuItem>
              <DropdownMenuItem
              destructive
              onClick={() => {
                if (window.confirm(`Delete "${list.title}" and all its cards?`)) {
                  changeList({ listId: list.id, method: "DELETE" });
                }
              }}
              >
              <Trash2 className="h-3.5 w-3.5" /> Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div
        ref={setCardsDropRef}
        data-list-scroll
        className={cn(
          "custom-scrollbar min-h-4 flex-1 space-y-2 overflow-y-auto px-2 pb-2",
          isOver && activeCardDragging && "rounded-md bg-primary/10 ring-2 ring-primary/30",
        )}
      >
        <SortableContext
          items={list.cards.map((card) => idForCard(card.id))}
          strategy={verticalListSortingStrategy}
        >
          {list.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              listId={list.id}
              canEdit={canEdit}
              editingCard={editingCard}
              setEditingCard={setEditingCard}
              submitOnEnter={submitOnEnter}
              changeCard={changeCard}
              openCard={openCard}
            />
          ))}
        </SortableContext>
        {list.cards.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {activeCardDragging ? "Drop card here" : "No cards in this list yet."}
          </p>
        )}
        {isOver && activeCardDragging && list.cards.length > 0 && (
          <motion.div
            layout
            className="h-10 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5"
            aria-hidden="true"
          />
        )}
      </div>
      {canEdit && (
        <form onSubmit={(event) => submitCard(event, list.id)} className="border-t p-2">
          <Input
            value={newCards[list.id] ?? ""}
            onChange={(event) =>
              setNewCards((old) => ({ ...old, [list.id]: event.target.value }))
            }
            placeholder="Add a card…"
            aria-label={`Add card to ${list.title}`}
            maxLength={80}
            className="h-9 bg-background"
          />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start text-muted-foreground"
            disabled={!newCards[list.id]?.trim() || addCardPending}
          >
            <Plus className="h-4 w-4" /> Add card
          </Button>
        </form>
      )}
    </motion.article>
  );
}

export function BoardView({ boardId }: { boardId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardRef = useRef<HTMLDivElement>(null);
  const [newList, setNewList] = useState("");
  const [newCards, setNewCards] = useState<Record<string, string>>({});
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragItemData | null>(null);
  const [backgroundDialogOpen, setBackgroundDialogOpen] = useState(false);
  const [backgroundDraft, setBackgroundDraft] = useState("#0079bf");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [backgroundFilePending, setBackgroundFilePending] = useState(false);
  const [clientShareDialogOpen, setClientShareDialogOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientLinkExpiry, setClientLinkExpiry] = useState("");
  const [isCreatingClientShare, setIsCreatingClientShare] = useState(false);
  const [createdClientUrl, setCreatedClientUrl] = useState("");
  const [createdClientShareId, setCreatedClientShareId] = useState<string | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateChoice, setTemplateChoice] = useState("logo-design");
  const selectedCardId = searchParams.get("card");
  const queryKey = ["board", boardId];
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => api<BoardResponse>(`/api/boards/${boardId}`),
  });
  useEffect(() => {
    const current = window.localStorage.getItem("flowboard-recent-boards");
    let previous: string[] = [];
    try {
      const parsed: unknown = current ? JSON.parse(current) : [];
      if (Array.isArray(parsed)) {
        previous = parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      previous = [];
    }
    window.localStorage.setItem(
      "flowboard-recent-boards",
      JSON.stringify([boardId, ...previous.filter((id) => id !== boardId)].slice(0, 8)),
    );
    window.dispatchEvent(new Event("flowboard:recent-boards-updated"));
  }, [boardId]);
  const board = data?.board;
  const canEdit = data?.role !== "VIEWER" && data?.role !== "CLIENT";
  const canManage = data?.role === "OWNER" || data?.role === "ADMIN";
  const clientShares = useQuery<{ links: { id: string; clientName: string | null; clientEmail: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string }[] }>({
    queryKey: ["client-shares", boardId],
    queryFn: () => api(`/api/boards/${boardId}/client-shares`),
    enabled: clientShareDialogOpen && canManage,
    staleTime: 0,
    retry: false,
  });
  const applyTemplate = useMutation({
    mutationFn: () => api(`/api/boards/${boardId}/templates`, "POST", { template: templateChoice }),
    onSuccess: async () => {
      await refresh();
      setTemplateDialogOpen(false);
      toast.success("Agency project template applied");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
    ]);
  };
  const openCard = (cardId: string) => {
    router.push(`/boards/${boardId}?card=${encodeURIComponent(cardId)}`, { scroll: false });
  };
  const closeCard = () => {
    router.replace(`/boards/${boardId}`, { scroll: false });
  };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const collisionDetection: CollisionDetection = (arguments_) => {
    const activeType = arguments_.active.data.current?.type;
    const droppableContainers = arguments_.droppableContainers.filter((container) => {
      const type = container.data.current?.type;
      if (activeType === "list") return type === "list";
      if (activeType === "card") return type === "card" || type === "list-drop";
      return true;
    });
    return closestCenter({ ...arguments_, droppableContainers });
  };

  const moveList = useMutation({
    mutationFn: (variables: {
      listId: string;
      beforeListId: string | null;
      afterListId: string | null;
      previous: BoardResponse;
    }) =>
      api(`/api/boards/${boardId}/lists/move`, "POST", {
        listId: variables.listId,
        beforeListId: variables.beforeListId,
        afterListId: variables.afterListId,
      }),
    onSuccess: async () => {
      toast.success("List moved");
      await refresh();
    },
    onError: async (error: Error, variables) => {
      queryClient.setQueryData(queryKey, variables.previous);
      toast.error(error.message);
    },
  });
  const moveCard = useMutation({
    mutationFn: (variables: {
      cardId: string;
      listId: string;
      beforeCardId: string | null;
      afterCardId: string | null;
      previous: BoardResponse;
    }) =>
      api(`/api/cards/${variables.cardId}/move`, "POST", {
        listId: variables.listId,
        beforeCardId: variables.beforeCardId,
        afterCardId: variables.afterCardId,
      }),
    onSuccess: async () => {
      toast.success("Card moved");
      await refresh();
    },
    onError: async (error: Error, variables) => {
      queryClient.setQueryData(queryKey, variables.previous);
      toast.error(error.message);
    },
  });
  const updateBoard = useMutation({
    mutationFn: ({
      payload,
    }: {
      payload: Record<string, unknown>;
      message: string;
    }) => api(`/api/boards/${boardId}`, "PATCH", payload),
    onMutate: async ({ payload }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BoardResponse>(queryKey);
      if (previous) {
        queryClient.setQueryData<BoardResponse>(queryKey, {
          ...previous,
          board: {
            ...previous.board,
            ...(typeof payload.backgroundColor === "string" || payload.backgroundColor === null
              ? { backgroundColor: payload.backgroundColor }
              : {}),
            ...(typeof payload.backgroundImage === "string" || payload.backgroundImage === null
              ? { backgroundImage: payload.backgroundImage }
              : {}),
            ...(typeof payload.title === "string" ? { title: payload.title } : {}),
          },
        });
      }
      return { previous };
    },
    onSuccess: async (_result, variables) => {
      await refresh();
      toast.success(variables.message);
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(error.message);
    },
  });
  const favorite = useMutation({
    mutationFn: (value: boolean) =>
      api(`/api/boards/${boardId}/favorite`, "POST", { favorite: value }),
    onSuccess: async () => {
      await refresh();
      toast.success("Favorite updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const addList = useMutation({
    mutationFn: (title: string) =>
      api(`/api/boards/${boardId}/lists`, "POST", { title }),
    onSuccess: async () => {
      setNewList("");
      await refresh();
      toast.success("List added");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const changeList = useMutation({
    mutationFn: ({
      listId,
      method,
      body,
    }: {
      listId: string;
      method: string;
      body?: unknown;
    }) => api(`/api/lists/${listId}`, method, body),
    onSuccess: async (_result, variables) => {
      await refresh();
      toast.success(variables.method === "DELETE" ? "List deleted" : "List updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const copyList = useMutation({
    mutationFn: (listId: string) => api(`/api/lists/${listId}/copy`, "POST"),
    onSuccess: async () => {
      await refresh();
      toast.success("List copied");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const addCard = useMutation({
    mutationFn: ({ listId, title }: { listId: string; title: string }) =>
      api(`/api/lists/${listId}/cards`, "POST", { title }),
    onSuccess: async (_result, variables) => {
      setNewCards((old) => ({ ...old, [variables.listId]: "" }));
      await refresh();
      toast.success("Card added");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const changeCard = useMutation({
    mutationFn: ({
      cardId,
      method,
      body,
    }: {
      cardId: string;
      method: string;
      body?: unknown;
    }) => api(`/api/cards/${cardId}`, method, body),
    onSuccess: async (_result, variables) => {
      await refresh();
      toast.success(variables.method === "DELETE" ? "Card deleted" : "Card updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function uploadBoardBackground(file: File) {
    setBackgroundFilePending(true);
    try {
      const formData = new FormData();
      formData.set("background", file);
      const response = await fetch(`/api/boards/${boardId}/background`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not upload background");
      await refresh();
      toast.success("Board background updated");
      setBackgroundDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload background");
    } finally {
      setBackgroundFilePending(false);
    }
  }

    async function createClientShare(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setIsCreatingClientShare(true);
      try {
        const result = await api<{ url: string; link: { id: string } }>(`/api/boards/${boardId}/client-shares`, "POST", {
          clientName: clientName.trim() || null,
          clientEmail: clientEmail.trim() || null,
          expiresAt: clientLinkExpiry ? new Date(`${clientLinkExpiry}T23:59:59`).toISOString() : null,
        });
        setCreatedClientUrl(result.url);
        setCreatedClientShareId(result.link.id);
        await clientShares.refetch();
        toast.success("Client project link created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create client link");
      } finally {
        setIsCreatingClientShare(false);
      }
    }

    async function revokeClientShare(id: string) {
      try {
        await api(`/api/boards/${boardId}/client-shares?id=${encodeURIComponent(id)}`, "DELETE");
        if (createdClientShareId === id) {
          setCreatedClientShareId(null);
          setCreatedClientUrl("");
        }
        await clientShares.refetch();
        toast.success("Client link revoked");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not revoke client link");
      }
    }
  function submitList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newList.trim()) addList.mutate(newList.trim());
  }
  function submitCard(event: FormEvent<HTMLFormElement>, listId: string) {
    event.preventDefault();
    const title = newCards[listId]?.trim();
    if (title) addCard.mutate({ listId, title });
  }
  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      setEditingCard(null);
      event.currentTarget.blur();
    }
  }

  function onDragStart(event: DragStartEvent) {
    setActiveDrag(getData(event) ?? null);
  }

  function onDragMove(event: DragMoveEvent) {
    const translated = event.active.rect.current.translated;
    const container = boardRef.current;
    if (!translated || !container) return;
    const bounds = container.getBoundingClientRect();
    const centerX = translated.left + translated.width / 2;
    const edgeSize = Math.min(88, bounds.width / 4);
    if (centerX < bounds.left + edgeSize) {
      container.scrollBy({ left: -Math.ceil((bounds.left + edgeSize - centerX) / 3) });
    } else if (centerX > bounds.right - edgeSize) {
      container.scrollBy({ left: Math.ceil((centerX - (bounds.right - edgeSize)) / 3) });
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const active = getData(event);
    const over = getOverData(event);
    setActiveDrag(null);
    if (!active || !over || !data || active.type === "list-drop") return;
    if (active.type === "list") {
      if (over.type !== "list") return;
      const currentOrder = data.board.lists.map((list) => list.id);
      const from = currentOrder.indexOf(active.listId);
      const to = currentOrder.indexOf(over.listId);
      if (from < 0 || to < 0 || from === to) return;
      const nextOrder = arrayMove(currentOrder, from, to);
      const lists = reorderListPositions(data.board.lists, nextOrder, active.listId);
      queryClient.setQueryData<BoardResponse>(queryKey, {
        ...data,
        board: { ...data.board, lists },
      });
      const index = nextOrder.indexOf(active.listId);
      moveList.mutate({
        listId: active.listId,
        beforeListId: index ? nextOrder[index - 1] : null,
        afterListId: index < nextOrder.length - 1 ? nextOrder[index + 1] : null,
        previous: data,
      });
      return;
    }

    const sourceList = data.board.lists.find((list) =>
      list.cards.some((card) => card.id === active.cardId),
    );
    const card = sourceList?.cards.find((item) => item.id === active.cardId);
    if (!sourceList || !card) return;
    let targetListId: string;
    let targetIndex: number;
    if (over.type === "card") {
      targetListId = over.listId;
      const overList = data.board.lists.find((list) => list.id === targetListId);
      if (!overList) return;
      const remaining = overList.cards.filter((item) => item.id !== active.cardId);
      const overIndex = remaining.findIndex((item) => item.id === over.cardId);
      if (overIndex < 0) return;
      const activeRect = event.active.rect.current.translated;
      const overRect = event.over?.rect;
      const after = Boolean(
        activeRect &&
          overRect &&
          activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2,
      );
      targetIndex = overIndex + (after ? 1 : 0);
    } else {
      targetListId = over.listId;
      const targetList = data.board.lists.find((list) => list.id === targetListId);
      if (!targetList) return;
      targetIndex = targetList.cards.filter((item) => item.id !== active.cardId).length;
    }
    const targetList = data.board.lists.find((list) => list.id === targetListId);
    if (!targetList) return;
    if (
      sourceList.id !== targetList.id &&
      targetList.wipLimit !== null &&
      targetList.cards.length >= targetList.wipLimit
    ) {
      toast.error("This list has reached its WIP limit");
      return;
    }
    const lists = insertCard(data.board.lists, card, targetList.id, targetIndex);
    queryClient.setQueryData<BoardResponse>(queryKey, {
      ...data,
      board: { ...data.board, lists },
    });
    const destination = lists.find((list) => list.id === targetList.id)!;
    const index = destination.cards.findIndex((item) => item.id === card.id);
    moveCard.mutate({
      cardId: card.id,
      listId: destination.id,
      beforeCardId: index ? destination.cards[index - 1].id : null,
      afterCardId:
        index < destination.cards.length - 1
          ? destination.cards[index + 1].id
          : null,
      previous: data,
    });
  }

  function announceStart(event: DragStartEvent) {
    const item = getData(event);
    return item?.type === "list"
      ? `Picked up list ${item.title}.`
      : item?.type === "card"
        ? `Picked up card ${item.title}.`
        : "Picked up item.";
  }
  function announceOver(event: DragOverEvent) {
    const item = getData(event);
    const over = getOverData(event);
    if (!item || !over) return item?.type === "card" ? `Moving card ${item.title}.` : "Item is not over a drop target.";
    if (item.type === "list" && over.type === "list") {
      return `List ${item.title} is over list ${over.title}.`;
    }
    if (item.type === "card") {
      return over.type === "card"
        ? `Card ${item.title} is over card ${over.title}.`
        : `Card ${item.title} is over list ${over.title}.`;
    }
    return "Moving item.";
  }
  function announceEnd(event: DragEndEvent) {
    const item = getData(event);
    const over = getOverData(event);
    if (!over) return "Drag cancelled. Item was returned to its original position.";
    return item?.type === "card"
      ? `Card ${item.title} was dropped in ${over.title}.`
      : item?.type === "list"
        ? `List ${item.title} was dropped.`
        : "Item dropped.";
  }

  if (isPending) {
    return (
      <div className="space-y-5">
        <div className="h-10 w-72 animate-pulse rounded bg-muted" />
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-72 w-72 shrink-0 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }
  if (isError || !board) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed p-8 text-center">
        <h1 className="font-semibold">Board could not be loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error
            ? error.message
            : "You may not have access, or the board may have been removed."}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
        <Button variant="outline" className="mt-4" onClick={() => void refetch()}>Try again</Button>
      </div>
    );
  }

  return (
    <section
      className="min-h-[calc(100vh-8rem)] -m-4 rounded-xl p-4 md:-m-6 md:p-6"
      style={{
        background: board.backgroundColor ?? "#2563eb",
        ...(board.backgroundImage
          ? {
              backgroundImage: `linear-gradient(rgba(0,0,0,.2), rgba(0,0,0,.2)), url("${board.backgroundImage}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
            }
          : {}),
      }}
    >
      <header className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-black/10 p-3 text-white">
        <div className="min-w-0 flex-1">
          {canManage ? (
            <button
              type="button"
              className="block max-w-full truncate text-left text-xl font-bold hover:underline"
              title="Rename board"
              onClick={() => {
                const title = window.prompt("Board title", board.title)?.trim();
                if (title && title !== board.title) {
                  updateBoard.mutate({ payload: { title }, message: "Board renamed" });
                }
              }}
            >
              {board.title}
            </button>
          ) : (
            <h1 className="truncate text-xl font-bold">{board.title}</h1>
          )}
          <p className="text-sm text-white/80">{board.workspace.name}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/15 hover:text-white"
          onClick={() => favorite.mutate(!board.isFavorite)}
          aria-label={board.isFavorite ? "Remove board from favorites" : "Add board to favorites"}
        >
          <Star className="h-4 w-4" fill={board.isFavorite ? "currentColor" : "none"} />
          {board.isFavorite ? "Starred" : "Star"}
        </Button>
        {canEdit && <Button variant="ghost" size="sm" className="text-white hover:bg-white/15 hover:text-white" onClick={() => setTemplateDialogOpen(true)}>
          <FileText className="h-4 w-4" /> Agency templates
        </Button>}
        {data.role !== "CLIENT" && <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/15 hover:text-white">
          <Link href={`/settings?tab=workspace&boardId=${boardId}&workspaceId=${board.workspace.id}`} aria-label="Board settings and role overrides">
            <Settings2 className="h-4 w-4" />
            Board settings
          </Link>
        </Button>}
        {canManage && (
          <>
            <label className="flex items-center gap-2 text-sm">
              Visibility
              <Select
                value={board.visibility}
                onValueChange={(value) =>
                  updateBoard.mutate({
                    payload: { visibility: value },
                    message: "Board visibility updated",
                  })
                }
              >
                <SelectTrigger className="h-9 w-36 border-white/30 bg-black/15 text-white" aria-label="Board visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WORKSPACE">Workspace</SelectItem>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/15 hover:text-white" aria-label="Board menu">
                  <MoreHorizontal className="h-4 w-4" />
                  Board menu
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setCreatedClientUrl("");
                  setClientShareDialogOpen(true);
                }}>
                  <Users className="h-4 w-4" /> Client project links
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setBackgroundDraft(board.backgroundColor ?? "#0079bf");
                  setBackgroundUrl(board.backgroundImage ?? "");
                  setBackgroundDialogOpen(true);
                }}>
                  <Palette className="h-4 w-4" /> Change background
                </DropdownMenuItem>
                <DropdownMenuItem destructive onClick={() => {
                  if (window.confirm(`Archive "${board.title}"?`)) {
                    updateBoard.mutate(
                      { payload: { archived: true }, message: "Board archived" },
                      { onSuccess: () => router.push("/") },
                    );
                  }
                }}>
                  <Archive className="h-4 w-4" /> Archive board
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </header>

      <Dialog open={backgroundDialogOpen} onOpenChange={setBackgroundDialogOpen}>
        <DialogContent className="max-w-lg p-6">
          <DialogTitle className="text-lg font-semibold">Change board background</DialogTitle>
          <DialogDescription>Choose a preset, paste an image URL, or upload an image.</DialogDescription>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              "#0079bf",
              "#2563eb",
              "#0f766e",
              "#7c3aed",
              "linear-gradient(to right, #2563eb 0%, #7c3aed 100%)",
              "linear-gradient(to right, #059669 0%, #0f766e 100%)",
              "linear-gradient(to right, #f97316 0%, #db2777 100%)",
              "linear-gradient(to right, #334155 0%, #0f172a 100%)",
            ].map((background) => (
              <button
                key={background}
                type="button"
                aria-label={`Use ${background.startsWith("linear") ? "gradient" : "color"} background`}
                aria-pressed={backgroundDraft === background}
                className={cn("h-14 rounded-lg border-2 transition hover:scale-[1.03]", backgroundDraft === background ? "border-primary ring-2 ring-primary/30" : "border-transparent")}
                style={{ background }}
                onClick={() => {
                  setBackgroundDraft(background);
                  setBackgroundUrl("");
                }}
              />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium" htmlFor="board-background-color">Custom color</label>
            <input
              id="board-background-color"
              type="color"
              value={backgroundDraft.startsWith("#") ? backgroundDraft : "#0079bf"}
              onChange={(event) => {
                setBackgroundDraft(event.target.value);
                setBackgroundUrl("");
              }}
              className="h-10 w-full cursor-pointer rounded-md border bg-background p-1"
            />
            <label className="block text-sm font-medium" htmlFor="board-background-url">Image URL</label>
            <Input
              id="board-background-url"
              type="text"
              value={backgroundUrl}
              onChange={(event) => setBackgroundUrl(event.target.value)}
              placeholder="https://example.com/background.jpg"
            />
            <label className="block text-sm font-medium" htmlFor="board-background-upload">Or upload an image (JPEG, PNG, WebP; 5 MB max)</label>
            <Input
              id="board-background-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={backgroundFilePending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadBoardBackground(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBackgroundDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={updateBoard.isPending || (
                Boolean(backgroundUrl) &&
                !backgroundUrl.startsWith("https://") &&
                !backgroundUrl.startsWith("/api/board-backgrounds/")
              )}
              onClick={() => {
                updateBoard.mutate({
                  payload: backgroundUrl
                    ? { backgroundImage: backgroundUrl }
                    : { backgroundColor: backgroundDraft, backgroundImage: null },
                  message: "Board background updated",
                }, { onSuccess: () => setBackgroundDialogOpen(false) });
              }}
            >
              Save background
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clientShareDialogOpen} onOpenChange={setClientShareDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Client project links</DialogTitle>
            <DialogDescription>Share a read-only project view with client-visible cards. Anyone with an active link can comment, upload, and respond to approvals.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <form className="space-y-3" onSubmit={(event) => void createClientShare(event)}>
              <Input value={clientName} onChange={(event) => setClientName(event.target.value)} maxLength={120} placeholder="Client name (optional)" aria-label="Client name" />
              <Input value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} type="email" maxLength={254} placeholder="Client email (optional)" aria-label="Client email" />
              <label className="block space-y-1 text-sm">Link expires on
                <Input value={clientLinkExpiry} onChange={(event) => setClientLinkExpiry(event.target.value)} type="date" aria-label="Client link expiry date" />
              </label>
              <Button type="submit" disabled={isCreatingClientShare}>{isCreatingClientShare ? "Creating…" : "Create secure link"}</Button>
            </form>
            {createdClientUrl && <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Copy this link now. It is only shown at creation.</p>
              <div className="flex flex-wrap gap-2">
                <Input className="min-w-0 flex-1" readOnly value={createdClientUrl} aria-label="New client project link" />
                <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(createdClientUrl).then(() => toast.success("Link copied")).catch(() => toast.error("Could not copy link"))}>Copy</Button>
                {createdClientShareId && <Button type="button" variant="destructive" onClick={() => void revokeClientShare(createdClientShareId)}>Revoke</Button>}
              </div>
            </div>}
          </div>
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Issued links</h3>
            {clientShares.isPending && <p className="text-sm text-muted-foreground">Loading links…</p>}
            {clientShares.isError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
              <p className="min-w-0 text-sm text-destructive">
                {clientShares.error instanceof Error ? clientShares.error.message : "Client links could not be loaded."}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => void clientShares.refetch()}>Retry</Button>
            </div>}
            {clientShares.data?.links.map((link) => <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg border p-2">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{link.clientName ?? link.clientEmail ?? "Client link"}</p><p className="text-xs text-muted-foreground">{link.revokedAt ? "Revoked" : link.expiresAt && new Date(link.expiresAt) < new Date() ? "Expired" : "Active"}{link.expiresAt ? ` · expires ${new Date(link.expiresAt).toLocaleDateString()}` : ""}</p></div>
              {!link.revokedAt && (!link.expiresAt || new Date(link.expiresAt) > new Date()) && <Button type="button" size="sm" variant="outline" onClick={() => void revokeClientShare(link.id)}>Revoke</Button>}
            </div>)}
            {!clientShares.isPending && !clientShares.isError && !clientShares.data?.links.length && <p className="text-sm text-muted-foreground">No project links yet.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start from an agency template</DialogTitle>
            <DialogDescription>Creates the standard project workflow and sample checklist cards on this board.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-2 text-sm">Project template
            <Select value={templateChoice} onValueChange={setTemplateChoice}>
              <SelectTrigger aria-label="Agency project template"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="logo-design">Logo Design</SelectItem>
                <SelectItem value="social-media-campaign">Social Media Campaign</SelectItem>
                <SelectItem value="website-design">Website Design</SelectItem>
                <SelectItem value="branding-package">Branding Package</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button><Button type="button" disabled={applyTemplate.isPending} onClick={() => applyTemplate.mutate()}>{applyTemplate.isPending ? "Applying…" : "Apply template"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {board.lists.length === 0 && (
        <div className="mb-4 rounded-lg border border-dashed border-white/50 bg-white/10 p-6 text-sm text-white">
          <h2 className="font-semibold">This board is ready for its first list</h2>
          <p className="mt-1 text-white/80">Add a list to start organizing cards into columns.</p>
        </div>
      )}
      <DndContext
        sensors={moveList.isPending || moveCard.isPending ? [] : sensors}
        collisionDetection={collisionDetection}
        accessibility={{
          announcements: {
            onDragStart: announceStart,
            onDragOver: announceOver,
            onDragEnd: announceEnd,
            onDragCancel: () => "Drag cancelled. Item was returned to its original position.",
          },
        }}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveDrag(null)}
      >
        <div
          ref={boardRef}
          className="custom-scrollbar flex min-h-[calc(100vh-14rem)] items-start gap-4 overflow-x-auto overscroll-x-contain pb-6"
          style={{ touchAction: "pan-y" }}
          aria-label="Board lists. Drag lists horizontally and cards between lists."
        >
          <SortableContext
            items={board.lists.map((list) => idForList(list.id))}
            strategy={horizontalListSortingStrategy}
          >
            {board.lists.map((list) => (
              <SortableListColumn
                key={list.id}
                list={list}
                canEdit={canEdit}
                editingCard={editingCard}
                activeCardDragging={activeDrag?.type === "card"}
                setEditingCard={setEditingCard}
                submitOnEnter={submitOnEnter}
                changeList={(variables) => changeList.mutate(variables)}
                copyList={(listId) => copyList.mutate(listId)}
                changeCard={(variables) => changeCard.mutate(variables)}
                newCards={newCards}
                setNewCards={setNewCards}
                submitCard={submitCard}
                addCardPending={addCard.isPending}
                openCard={openCard}
              />
            ))}
          </SortableContext>
          {canEdit && (
            <form onSubmit={submitList} className="w-72 shrink-0 space-y-2 rounded-xl bg-white/15 p-3 text-white">
              <Input
                value={newList}
                onChange={(event) => setNewList(event.target.value)}
                placeholder="New list title…"
                aria-label="New list title"
                maxLength={80}
                className="border-white/30 bg-white/90 text-foreground placeholder:text-muted-foreground"
              />
              <Button type="submit" variant="secondary" className="w-full justify-start" disabled={!newList.trim() || addList.isPending}>
                <Plus className="h-4 w-4" /> Add list
              </Button>
            </form>
          )}
          {!canManage && board.lists.length > 0 && !canEdit && (
            <p className="rounded-lg bg-black/10 px-4 py-3 text-sm text-white">You have view-only access to this board.</p>
          )}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
          {activeDrag?.type === "card" ? (
            <div className="w-64 rotate-1 rounded-lg border bg-background p-3 text-sm shadow-2xl ring-2 ring-primary/40">
              {activeDrag.title}
            </div>
          ) : activeDrag?.type === "list" ? (
            <div className="w-72 rounded-xl bg-muted p-3 text-sm font-semibold shadow-2xl ring-2 ring-primary/40">
              {activeDrag.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <CardDetailDialog
        boardId={boardId}
        cardId={selectedCardId}
        canEdit={canEdit}
        onOpenChange={(open) => {
          if (!open && selectedCardId) closeCard();
        }}
        onChanged={refresh}
      />
    </section>
  );
}
