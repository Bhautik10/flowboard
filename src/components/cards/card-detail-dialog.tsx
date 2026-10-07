"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  ArrowRightLeft,
  CalendarDays,
  Check,
  CheckSquare,
  ClipboardList,
  Clock3,
  Copy,
  Eye,
  Flag,
  Link2,
  ListPlus,
  Paperclip,
  FileText,
  MessageSquare,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { positionBetween } from "@/lib/position";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Member = { id: string; name: string | null; email: string; image: string | null };
type Label = { id: string; name: string; color: string };
type ChecklistItem = {
  id: string;
  text: string;
  isComplete: boolean;
  position: string;
};
type Checklist = { id: string; title: string; items: ChecklistItem[] };
type Attachment = {
  id: string;
  type: "IMAGE" | "FILE" | "LINK";
  name: string;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  isCover: boolean;
  versionGroupId: string | null;
  versionNumber: number;
  isCurrentVersion: boolean;
  createdAt: string;
  uploadedBy: { id: string; name: string | null; image: string | null } | null;
  clientKey?: string | null;
  sharedWithAllClients?: boolean;
};
type DesignPin = { id: string; body: string; x: number; y: number; resolvedAt: string | null; authorName: string };
type AttachmentVersions = { versions: { id: string; name: string; versionNumber: number; isCurrentVersion: boolean }[] };
type CommentReaction = {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; name: string | null };
};
type CardComment = {
  id: string;
  authorId: string | null;
  authorLabel: string | null;
  visibility: "INTERNAL" | "CLIENT";
  clientKey?: string | null;
  sharedWithAllClients?: boolean;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; image: string | null } | null;
  reactions: CommentReaction[];
};
type DetailCard = {
  id: string;
  boardId: string;
  title: string;
  description: string | null;
  visibility: "INTERNAL" | "CLIENT_VISIBLE";
  approvalStatus: "NONE" | "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
  revisionRound: number;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  startDate: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  isComplete: boolean;
  coverValue: string | null;
  estimatedHours: number | null;
  parentCardId: string | null;
  createdAt: string;
  isWatching: boolean;
  subtasks: { id: string; title: string; isComplete: boolean }[];
  activities: {
    id: string;
    action: string;
    createdAt: string;
    actor: { id: string; name: string | null; image: string | null } | null;
    actorLabel: string | null;
    clientKey?: string | null;
    sharedWithAllClients?: boolean;
  }[];
  clientShares: {
    clientKey: string;
    userId: string | null;
    shareLinkId: string | null;
    approvalStatus: DetailCard["approvalStatus"];
    revisionRound: number;
    approvedAt: string | null;
    user: Member | null;
  }[];
  createdBy: { id: string; name: string | null; image: string | null } | null;
  attachments: Attachment[];
  comments: CardComment[];
  labels: Label[];
  members: Member[];
  checklists: Checklist[];
  list: { id: string; title: string };
};
type DetailResponse = {
  card: DetailCard;
  boardMembers: Member[];
  clients: Member[];
  cardShares: DetailCard["clientShares"];
  targetBoards: {
    id: string;
    title: string;
    lists: { id: string; title: string; cards: { id: string }[] }[];
  }[];
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "CLIENT";
  currentUserId: string;
  clientKey: string | null;
};
type CardUpdates = {
  comments: CardComment[];
  attachments: Attachment[];
  activities: DetailCard["activities"];
  clientShares: DetailCard["clientShares"];
  serverTime: string;
};
type Action = {
  url: string;
  method?: string;
  body?: unknown;
  message: string;
  optimistic?: Record<string, unknown>;
  optimisticChecklistItem?: { itemId: string; patch: Partial<ChecklistItem> };
  optimisticSubtask?: { subtaskId: string; isComplete: boolean };
  optimisticMove?: { boardId: string; listId: string };
  closeOnSuccess?: boolean;
};
type BoardCardCache = Pick<DetailCard, "id"> &
  Partial<Pick<DetailCard, "title" | "description" | "priority" | "startDate" | "dueDate" | "reminderAt" | "isComplete" | "coverValue" | "estimatedHours" | "isWatching" | "labels" | "members" | "checklists">> & {
    _count?: { attachments: number; comments: number };
  };

function relativeTime(value: string | Date) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const [amount, unit] = abs < 60
    ? [seconds, "second"]
    : abs < 3600
      ? [seconds / 60, "minute"]
      : abs < 86400
        ? [seconds / 3600, "hour"]
        : abs < 604800
          ? [seconds / 86400, "day"]
          : [seconds / 604800, "week"];
  const rounded = Math.round(amount);
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    rounded,
    unit as Intl.RelativeTimeFormatUnit,
  );
}

function formatBytes(value: number | null) {
  if (!value || value < 1024) return `${value ?? 0} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function MentionTextarea({
  value,
  onChange,
  members,
  disabled,
  rows = 4,
  placeholder,
  label,
  className,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  disabled: boolean;
  rows?: number;
  placeholder: string;
  label: string;
  className?: string;
  onBlur?: () => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const matches = members.filter((member) =>
    (member.name ?? member.email).toLowerCase().includes((query ?? "").toLowerCase()),
  ).slice(0, 6);

  function updateValue(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.currentTarget.value;
    const cursor = event.currentTarget.selectionStart;
    onChange(text);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, cursor));
    if (!match) {
      setQuery(null);
      setMentionRange(null);
      return;
    }
    const start = cursor - match[1].length - 1;
    setQuery(match[1]);
    setMentionRange({ start, end: cursor });
  }

  function selectMember(member: Member) {
    const textarea = inputRef.current;
    if (!textarea || !mentionRange) return;
    const displayName = member.name ?? member.email;
    const token = `@[${displayName.replace(/[\]\r\n]/g, "")}](${member.id}) `;
    const nextValue = `${value.slice(0, mentionRange.start)}${token}${value.slice(mentionRange.end)}`;
    onChange(nextValue);
    setQuery(null);
    setMentionRange(null);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = mentionRange.start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        disabled={disabled}
        rows={rows}
        onChange={updateValue}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setQuery(null);
            setMentionRange(null);
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        className={className}
      />
      {query !== null && !disabled && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg" role="listbox" aria-label="Mention a workspace member">
          {matches.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMember(member)}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-medium">
                  {(member.name ?? member.email).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 truncate">{member.name ?? member.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function requestJson<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = result.error;
    const message = typeof error === "string"
      ? error
      : error && typeof error === "object"
        ? Object.values(error as Record<string, string[]>).flat()[0]
        : "Request failed";
    throw new Error(message || "Request failed");
  }
  return result as T;
}

function toLocalDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function dateValue(value: string) {
  return value ? new Date(value).toISOString() : null;
}

const priorities = [
  { value: "LOW", label: "Low", className: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200" },
  { value: "NORMAL", label: "Normal", className: "text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200" },
  { value: "HIGH", label: "High", className: "text-orange-700 bg-orange-100 dark:bg-orange-950 dark:text-orange-200" },
  { value: "URGENT", label: "Urgent", className: "text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-200" },
] as const;

export function CardDetailDialog({
  boardId,
  cardId,
  canEdit,
  onOpenChange,
  onChanged,
}: {
  boardId: string;
  cardId: string | null;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["card-detail", cardId];
  const { data, isPending, isError } = useQuery({
    queryKey,
    queryFn: () => requestJson<DetailResponse>(`/api/cards/${cardId}`),
    enabled: Boolean(cardId),
  });
  const card = data?.card;
  const isClient = data?.role === "CLIENT";
  const canInteract = canEdit || isClient;
  const [editingTitle, setEditingTitle] = useState(false);
  const cancelTitleEdit = useRef(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionTab, setDescriptionTab] = useState<"write" | "preview">("write");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [newItems, setNewItems] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [labels, setLabels] = useState<Label[]>([]);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [targetBoardId, setTargetBoardId] = useState("");
  const [targetListId, setTargetListId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentVisibility, setCommentVisibility] = useState<"INTERNAL" | "CLIENT">("INTERNAL");
  const [approvalNote, setApprovalNote] = useState("");
  const [pinMode, setPinMode] = useState(false);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description ?? "");
      setLabels(card.labels);
      setTargetBoardId(card.boardId);
      setTargetListId(card.list.id);
    }
  }, [card]);

  const action = useMutation({
    mutationFn: (variables: Action) =>
      requestJson<unknown>(variables.url, variables.method ?? "PATCH", variables.body),
    onMutate: async (variables) => {
      if ((!variables.optimistic && !variables.optimisticChecklistItem && !variables.optimisticSubtask && !variables.optimisticMove) || !cardId) return undefined;
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<DetailResponse>(queryKey);
      if (previous) {
        queryClient.setQueryData<DetailResponse>(queryKey, {
          ...previous,
          card: {
            ...previous.card,
            ...variables.optimistic,
            ...(variables.optimisticChecklistItem && {
              checklists: previous.card.checklists.map((checklist) => ({
                ...checklist,
                items: checklist.items.map((item) =>
                  item.id === variables.optimisticChecklistItem?.itemId
                    ? { ...item, ...variables.optimisticChecklistItem.patch }
                    : item,
                ),
              })),
            }),
            ...(variables.optimisticSubtask && {
              subtasks: previous.card.subtasks.map((subtask) =>
                subtask.id === variables.optimisticSubtask?.subtaskId
                  ? { ...subtask, isComplete: variables.optimisticSubtask.isComplete }
                  : subtask,
              ),
            }),
          },
        });
      }
      const boardKey = ["board", boardId];
      const previousBoard = queryClient.getQueryData<{ board: { lists: { id: string; cards: BoardCardCache[] }[] } }>(boardKey);
      queryClient.setQueryData<{ board: { lists: { id: string; cards: BoardCardCache[] }[] } }>(boardKey, (cached) => {
        if (!cached) return cached;
        const sourceCard = cached.board.lists.flatMap((list) => list.cards).find((item) => item.id === cardId);
        const lists = cached.board.lists.map((list) => ({
          ...list,
          cards: variables.optimisticMove
            ? list.cards.filter((item) => item.id !== cardId)
            : list.cards.map((item) =>
                item.id === cardId
                  ? {
                      ...item,
                      ...variables.optimistic,
                      ...(variables.optimisticChecklistItem && {
                        checklists: item.checklists?.map((checklist) => ({
                          ...checklist,
                          items: checklist.items.map((checklistItem) =>
                            checklistItem.id === variables.optimisticChecklistItem?.itemId
                              ? { ...checklistItem, ...variables.optimisticChecklistItem.patch }
                              : checklistItem,
                          ),
                        })),
                      }),
                    }
                  : item,
              ),
        }));
        if (
          variables.optimisticMove &&
          variables.optimisticMove.boardId === boardId &&
          sourceCard
        ) {
          const target = lists.find((list) => list.id === variables.optimisticMove?.listId);
          if (target) target.cards.push(sourceCard);
        }
        return {
          ...cached,
          board: {
            ...cached.board,
            lists,
          },
        };
      });
      return { previous, previousBoard };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      if (context?.previousBoard) queryClient.setQueryData(["board", boardId], context.previousBoard);
      toast.error(error.message);
    },
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board"] }),
        onChanged(),
      ]);
      toast.success(variables.message);
      if (variables.closeOnSuccess) onOpenChange(false);
    },
  });

  const boardLabels = useQuery({
    queryKey: ["board-labels", boardId],
    queryFn: () => requestJson<{ labels: Label[] }>(`/api/boards/${boardId}/labels`),
    enabled: Boolean(cardId),
  });
  const availableLabels = boardLabels.data?.labels ?? [];
  const pinsQuery = useQuery<{ pins: DesignPin[] }>({
    queryKey: ["attachment-pins", previewAttachment?.id],
    queryFn: () => requestJson<{ pins: DesignPin[] }>(`/api/attachments/${previewAttachment?.id}/pins`),
    enabled: Boolean(previewAttachment?.type === "IMAGE"),
  });
  const versionsQuery = useQuery<AttachmentVersions>({
    queryKey: ["attachment-versions", previewAttachment?.id],
    queryFn: () => requestJson(`/api/attachments/${previewAttachment?.id}/versions`),
    enabled: Boolean(previewAttachment?.type === "IMAGE" && (canEdit || isClient)),
  });

  const mutateCard = (patch: Record<string, unknown>, message: string) => {
    if (!cardId) return;
    action.mutate({
      url: `/api/cards/${cardId}`,
      body: patch,
      message,
      optimistic: patch,
    });
  };
  const mutateEndpoint = (url: string, method: string, body: unknown, message: string) => {
    action.mutate({ url, method, body, message });
  };
  const focusActionSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const moveCardToSelection = () => {
    if (!card || !data) return;
    const targetBoard = data.targetBoards.find((item) => item.id === targetBoardId);
    const targetList = targetBoard?.lists.find((item) => item.id === targetListId);
    if (!targetBoard || !targetList) {
      toast.error("Choose a valid destination board and list");
      return;
    }
    const remaining = targetList.cards.filter((item) => item.id !== card.id);
    action.mutate({
      url: `/api/cards/${card.id}/move`,
      method: "POST",
      body: {
        boardId: targetBoard.id,
        listId: targetList.id,
        beforeCardId: remaining.at(-1)?.id ?? null,
        afterCardId: null,
      },
      message: "Card moved",
      optimisticMove: { boardId: targetBoard.id, listId: targetList.id },
    });
  };
  const copyCard = async () => {
    if (!card) return;
    try {
      await requestJson(`/api/cards/${card.id}/copy`, "POST", {});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["board"] }),
        onChanged(),
      ]);
      toast.success("Card copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy card");
    }
  };
  const updateBoardCard = (patch: Partial<BoardCardCache>) => {
    queryClient.setQueryData<{ board: { lists: { id: string; cards: BoardCardCache[] }[] } }>(
      ["board", boardId],
      (current) => current && ({
        ...current,
        board: {
          ...current.board,
          lists: current.board.lists.map((list) => ({
            ...list,
            cards: list.cards.map((item) => item.id === cardId ? { ...item, ...patch } : item),
          })),
        },
      }),
    );
  };

  const updateCardDetail = (updater: (current: DetailResponse) => DetailResponse) => {
    queryClient.setQueryData<DetailResponse>(queryKey, (current) => current ? updater(current) : current);
  };

  async function uploadFiles(files: FileList | File[]) {
    if (!card || !canInteract || !files.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const previous = queryClient.getQueryData<DetailResponse>(queryKey);
      const previousBoard = queryClient.getQueryData<{ board: { lists: { id: string; cards: BoardCardCache[] }[] } }>(["board", boardId]);
      const temporaryId = `pending-${crypto.randomUUID()}`;
      const optimisticAttachment: Attachment = {
        id: temporaryId,
        type: "FILE",
        name: file.name,
        url: "",
        mimeType: file.type,
        sizeBytes: file.size,
        isCover: false,
        versionGroupId: null,
        versionNumber: 1,
        isCurrentVersion: true,
        createdAt: new Date().toISOString(),
        uploadedBy: {
          id: data?.currentUserId ?? "",
          name: data?.boardMembers.find((member) => member.id === data.currentUserId)?.name ?? "You",
          image: null,
        },
      };
      updateCardDetail((current) => ({
        ...current,
        card: { ...current.card, attachments: [...current.card.attachments, optimisticAttachment] },
      }));
      updateBoardCard({
        _count: {
          attachments: (previousBoard?.board.lists.flatMap((list) => list.cards).find((item) => item.id === card.id)?._count?.attachments ?? 0) + 1,
          comments: previousBoard?.board.lists.flatMap((list) => list.cards).find((item) => item.id === card.id)?._count?.comments ?? 0,
        },
      });
      const form = new FormData();
      form.set("file", file);
      try {
        const response = await fetch(`/api/cards/${card.id}/attachments`, { method: "POST", body: form });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = result.error;
          throw new Error(typeof error === "string" ? error : "Attachment upload failed");
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey }),
          queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
          onChanged(),
        ]);
        toast.success(`${file.name} uploaded`);
      } catch (error) {
        if (previous) queryClient.setQueryData(queryKey, previous);
        if (previousBoard) queryClient.setQueryData(["board", boardId], previousBoard);
        toast.error(error instanceof Error ? error.message : "Attachment upload failed");
      }
    }
    setUploading(false);
  }

  async function addLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!card || !linkName.trim() || !linkUrl.trim()) return;
    try {
      await requestJson(`/api/cards/${card.id}/attachments`, "POST", {
        name: linkName.trim(),
        url: linkUrl.trim(),
      });
      setLinkName("");
      setLinkUrl("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
        onChanged(),
      ]);
      toast.success("Link added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add link");
    }
  }

  async function removeAttachment(attachment: Attachment) {
    if (!card || attachment.id.startsWith("pending-")) return;
    const previous = queryClient.getQueryData<DetailResponse>(queryKey);
    const previousBoard = queryClient.getQueryData<{ board: { lists: { id: string; cards: BoardCardCache[] }[] } }>(["board", boardId]);
    updateCardDetail((current) => ({
      ...current,
      card: {
        ...current.card,
        attachments: current.card.attachments.filter((item) => item.id !== attachment.id),
        coverValue: attachment.isCover ? null : current.card.coverValue,
      },
    }));
    const boardCard = previousBoard?.board.lists.flatMap((list) => list.cards).find((item) => item.id === card.id);
    updateBoardCard({
      _count: {
        attachments: Math.max(0, (boardCard?._count?.attachments ?? 1) - 1),
        comments: boardCard?._count?.comments ?? 0,
      },
    });
    try {
      await requestJson(`/api/attachments/${attachment.id}`, "DELETE");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
        onChanged(),
      ]);
      toast.success("Attachment deleted");
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      if (previousBoard) queryClient.setQueryData(["board", boardId], previousBoard);
      toast.error(error instanceof Error ? error.message : "Could not delete attachment");
    }
  }

  async function setAttachmentCover(attachment: Attachment) {
    if (!card) return;
    const previous = queryClient.getQueryData<DetailResponse>(queryKey);
    updateCardDetail((current) => ({
      ...current,
      card: {
        ...current.card,
        coverValue: attachment.isCover ? null : attachment.url,
        attachments: current.card.attachments.map((item) => ({
          ...item,
          isCover: item.id === attachment.id ? !attachment.isCover : false,
        })),
      },
    }));
    updateBoardCard({ coverValue: attachment.isCover ? null : attachment.url });
    try {
      await requestJson(`/api/attachments/${attachment.id}/cover`, "PUT", { isCover: !attachment.isCover });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
        onChanged(),
      ]);
      toast.success(attachment.isCover ? "Card cover removed" : "Card cover updated");
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      updateBoardCard({ coverValue: previous?.card.coverValue ?? null });
      toast.error(error instanceof Error ? error.message : "Could not update card cover");
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!card || !commentDraft.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    const previous = queryClient.getQueryData<DetailResponse>(queryKey);
    const previousBoard = queryClient.getQueryData<{ board: { lists: { id: string; cards: BoardCardCache[] }[] } }>(["board", boardId]);
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const currentUser = data?.boardMembers.find((member) => member.id === data.currentUserId);
    const optimisticComment: CardComment = {
      id: optimisticId,
      authorId: data?.currentUserId ?? "",
      authorLabel: isClient ? "Client" : null,
      visibility: isClient ? "CLIENT" : commentVisibility,
      body: commentDraft.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: { id: data?.currentUserId ?? "", name: currentUser?.name ?? "You", image: currentUser?.image ?? null },
      reactions: [],
    };
    updateCardDetail((current) => ({
      ...current,
      card: { ...current.card, comments: [...current.card.comments, optimisticComment] },
    }));
    const boardCard = previousBoard?.board.lists.flatMap((list) => list.cards).find((item) => item.id === cardId);
    updateBoardCard({
      _count: {
        attachments: boardCard?._count?.attachments ?? 0,
        comments: (boardCard?._count?.comments ?? 0) + 1,
      },
    });
    setCommentDraft("");
    try {
      await requestJson(`/api/cards/${card.id}/comments`, "POST", {
        body: optimisticComment.body,
        visibility: commentVisibility,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
        onChanged(),
      ]);
      toast.success("Comment added");
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      if (previousBoard) queryClient.setQueryData(["board", boardId], previousBoard);
      setCommentDraft(optimisticComment.body);
      toast.error(error instanceof Error ? error.message : "Could not add comment");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function submitApproval(actionName: "send" | "approve" | "request-changes") {
    if (!cardId) return;
    const payload = actionName === "request-changes"
      ? { action: actionName, body: approvalNote.trim() }
      : { action: actionName };
    try {
      const result = await requestJson<{ card?: { approvalStatus: DetailCard["approvalStatus"]; revisionRound: number } }>(
        `/api/cards/${cardId}/approval`,
        "POST",
        payload,
      );
      if (result.card) {
        queryClient.setQueryData<DetailResponse>(queryKey, (current) => current ? {
          ...current,
          card: { ...current.card, ...result.card },
        } : current);
      }
      setApprovalNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
      ]);
      toast.success(actionName === "send" ? "Sent for client approval" : actionName === "approve" ? "Design approved" : "Changes requested");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update approval");
    }
  }

  async function createDesignPin(event: MouseEvent<HTMLDivElement>) {
    if (!previewAttachment || !canInteract || !pinMode) return;
    const image = event.currentTarget.querySelector("img");
    if (!image) return;
    const rect = image.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    const body = window.prompt("What should be changed at this point?")?.trim();
    if (!body) return;
    try {
      const result = await requestJson<{ pin: DesignPin }>(`/api/attachments/${previewAttachment.id}/pins`, "POST", { body, x, y });
      queryClient.setQueryData<{ pins: DesignPin[] }>(["attachment-pins", previewAttachment.id], (current) => ({
        pins: [...(current?.pins ?? []), result.pin],
      }));
      toast.success("Design pin added");
      setPinMode(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add pin");
    }
  }

  async function setPinResolved(pin: DesignPin, resolved: boolean) {
    if (!previewAttachment) return;
    try {
      await requestJson(`/api/design-pins/${pin.id}`, "PATCH", { resolved });
      await queryClient.invalidateQueries({ queryKey: ["attachment-pins", previewAttachment.id] });
      toast.success(resolved ? "Pin resolved" : "Pin reopened");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update pin");
    }
  }

  async function uploadImageVersion(file: File) {
    if (!previewAttachment) return;
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch(`/api/attachments/${previewAttachment.id}/versions`, { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not upload version");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
        queryClient.invalidateQueries({ queryKey: ["attachment-versions"] }),
        onChanged(),
      ]);
      const updated = queryClient.getQueryData<DetailResponse>(queryKey)?.card.attachments.find((item) => item.id === result.version.id);
      if (updated) setPreviewAttachment(updated);
      toast.success(`Uploaded version ${result.version.versionNumber}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload version");
    }
  }

  async function selectImageVersion(versionId: string) {
    if (!previewAttachment) return;
    try {
      await requestJson(`/api/attachments/${previewAttachment.id}/versions`, "PATCH", { versionId });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
        queryClient.invalidateQueries({ queryKey: ["attachment-versions"] }),
        onChanged(),
      ]);
      const updated = queryClient.getQueryData<DetailResponse>(queryKey)?.card.attachments.find((item) => item.id === versionId);
      if (updated) setPreviewAttachment(updated);
      toast.success("Design version selected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not select version");
    }
  }

  async function saveComment(comment: CardComment) {
    const previous = queryClient.getQueryData<DetailResponse>(queryKey);
    updateCardDetail((current) => ({
      ...current,
      card: {
        ...current.card,
        comments: current.card.comments.map((item) =>
          item.id === comment.id ? { ...item, body: commentEditDraft, updatedAt: new Date().toISOString() } : item,
        ),
      },
    }));
    setEditingComment(null);
    try {
      await requestJson(`/api/comments/${comment.id}`, "PATCH", { body: commentEditDraft });
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Comment updated");
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      toast.error(error instanceof Error ? error.message : "Could not update comment");
    }
  }

  async function deleteComment(comment: CardComment) {
    const previous = queryClient.getQueryData<DetailResponse>(queryKey);
    const previousBoard = queryClient.getQueryData<{ board: { lists: { id: string; cards: BoardCardCache[] }[] } }>(["board", boardId]);
    updateCardDetail((current) => ({
      ...current,
      card: { ...current.card, comments: current.card.comments.filter((item) => item.id !== comment.id) },
    }));
    const boardCard = previousBoard?.board.lists.flatMap((list) => list.cards).find((item) => item.id === cardId);
    updateBoardCard({
      _count: {
        attachments: boardCard?._count?.attachments ?? 0,
        comments: Math.max(0, (boardCard?._count?.comments ?? 1) - 1),
      },
    });
    try {
      await requestJson(`/api/comments/${comment.id}`, "DELETE");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
        onChanged(),
      ]);
      toast.success("Comment deleted");
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      if (previousBoard) queryClient.setQueryData(["board", boardId], previousBoard);
      toast.error(error instanceof Error ? error.message : "Could not delete comment");
    }
  }

  async function toggleReaction(comment: CardComment, emoji: string) {
    if (!data) return;
    const previous = queryClient.getQueryData<DetailResponse>(queryKey);
    updateCardDetail((current) => ({
      ...current,
      card: {
        ...current.card,
        comments: current.card.comments.map((item) => {
          if (item.id !== comment.id) return item;
          const existing = item.reactions.find((reaction) => reaction.userId === data.currentUserId && reaction.emoji === emoji);
          return {
            ...item,
            reactions: existing
              ? item.reactions.filter((reaction) => reaction.id !== existing.id)
              : [...item.reactions, {
                  id: `pending-${emoji}-${data.currentUserId}`,
                  emoji,
                  userId: data.currentUserId,
                  user: { id: data.currentUserId, name: data.boardMembers.find((member) => member.id === data.currentUserId)?.name ?? "You" },
                }],
          };
        }),
      },
    }));
    try {
      await requestJson(`/api/comments/${comment.id}/reactions`, "POST", { emoji });
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      toast.error(error instanceof Error ? error.message : "Could not update reaction");
    }
  }

  useEffect(() => {
    if (!cardId || !canEdit) return;
    const shortcuts: Record<string, string> = {
      m: "card-members-picker",
      l: "card-labels",
      d: "card-dates",
      p: "card-priority",
    };
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches("input,textarea,select,[contenteditable=true]")) return;
      const target = shortcuts[event.key.toLowerCase()];
      if (!target) return;
      event.preventDefault();
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [cardId, canEdit]);

  async function saveLabel() {
    if (!newLabel.trim()) return;
    try {
      await requestJson(`/api/boards/${boardId}/labels`, "POST", {
        name: newLabel.trim(),
        color: newLabelColor,
      });
      setNewLabel("");
      await queryClient.invalidateQueries({ queryKey: ["board-labels", boardId] });
      toast.success("Label created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create label");
    }
  }

  async function assignLabel(label: Label) {
    if (!card) return;
    const nextLabels = card.labels.some((item) => item.id === label.id)
      ? card.labels.filter((item) => item.id !== label.id)
      : [...card.labels, label];
    const previousLabels = card.labels;
    setLabels(nextLabels);
    queryClient.setQueryData<DetailResponse>(queryKey, (current) =>
      current ? { ...current, card: { ...current.card, labels: nextLabels } } : current,
    );
    updateBoardCard({ labels: nextLabels });
    try {
      await requestJson(`/api/cards/${card.id}/labels`, "PUT", { labelIds: nextLabels.map((item) => item.id) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
      ]);
      toast.success("Card labels updated");
    } catch (error) {
      setLabels(card.labels);
      queryClient.setQueryData<DetailResponse>(queryKey, (current) =>
        current ? { ...current, card: { ...current.card, labels: previousLabels } } : current,
      );
      updateBoardCard({ labels: previousLabels });
      toast.error(error instanceof Error ? error.message : "Could not update labels");
    }
  }

  async function editLabel(label: Label) {
    const name = window.prompt("Label name", label.name)?.trim();
    if (!name) return;
    const color = window.prompt("Label color (hex)", label.color)?.trim();
    if (!color) return;
    try {
      await requestJson(`/api/boards/${boardId}/labels/${label.id}`, "PATCH", { name, color });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["board-labels", boardId] }),
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
      ]);
      toast.success("Label updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update label");
    }
  }

  async function deleteLabel(label: Label) {
    if (!window.confirm(`Delete label "${label.name}" from the board?`)) return;
    try {
      await requestJson(`/api/boards/${boardId}/labels/${label.id}`, "DELETE");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["board-labels", boardId] }),
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["board", boardId] }),
      ]);
      toast.success("Label deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete label");
    }
  }

  async function setMembers(nextIds: string[]) {
    if (!card) return;
    const previous = card.members;
    const next = data?.boardMembers.filter((member) => nextIds.includes(member.id)) ?? [];
    queryClient.setQueryData<DetailResponse>(queryKey, (current) =>
      current ? { ...current, card: { ...current.card, members: next } } : current,
    );
    updateBoardCard({ members: next });
    try {
      await requestJson(`/api/cards/${card.id}/members`, "PUT", { userIds: nextIds });
      await queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      toast.success("Card members updated");
    } catch (error) {
      queryClient.setQueryData<DetailResponse>(queryKey, (current) =>
        current ? { ...current, card: { ...current.card, members: previous } } : current,
      );
      updateBoardCard({ members: previous });
      toast.error(error instanceof Error ? error.message : "Could not update members");
    }
  }

  const open = Boolean(cardId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="card-detail-description" className="max-w-5xl p-0">
        <div className="sr-only">
          <DialogTitle>Card details</DialogTitle>
          <DialogDescription id="card-detail-description">View and edit card details, members, labels, dates, and checklists.</DialogDescription>
        </div>
        {isPending ? (
          <div className="grid min-h-96 place-items-center text-sm text-muted-foreground" role="status">Loading card…</div>
        ) : isError || !card ? (
          <div className="p-10 text-center">
            <h2 className="font-semibold">Card details could not be loaded</h2>
            <p className="mt-2 text-sm text-muted-foreground">Refresh or close this dialog and try again.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_220px] md:p-7">
              <main className="min-w-0 space-y-7">
                <header className="flex items-start gap-3 pr-8">
                  <ClipboardList className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    {editingTitle && canEdit ? (
                      <Input
                        autoFocus
                        aria-label="Card title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        onBlur={() => {
                          setEditingTitle(false);
                          if (cancelTitleEdit.current) {
                            cancelTitleEdit.current = false;
                            return;
                          }
                          if (title.trim() && title.trim() !== card.title) mutateCard({ title: title.trim() }, "Title updated");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            cancelTitleEdit.current = true;
                            setTitle(card.title);
                            setEditingTitle(false);
                            event.currentTarget.blur();
                          }
                        }}
                        maxLength={200}
                      />
                    ) : (
                      <div className="group/title flex items-start gap-2">
                        <h2
                          className="min-w-0 flex-1 break-words text-xl font-semibold tracking-tight [overflow-wrap:anywhere]"
                          onDoubleClick={() => canEdit && setEditingTitle(true)}
                          title={canEdit ? "Double-click to rename" : undefined}
                        >
                          {card.title}
                        </h2>
                        {canEdit && <button
                          type="button"
                          className="mt-1 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted group-hover/title:opacity-100 focus:opacity-100"
                          aria-label="Edit card title"
                          onClick={() => setEditingTitle(true)}
                        ><Pencil className="h-3.5 w-3.5" /></button>}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">in list <span className="font-medium">{card.list.title}</span></p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created by {card.createdBy?.name ?? "a workspace member"}, {relativeTime(card.createdAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {card.approvalStatus !== "NONE" && <span className={cn(
                        "rounded-full px-2 py-1 text-xs font-medium",
                        card.approvalStatus === "APPROVED" && "bg-emerald-100 text-emerald-800",
                        card.approvalStatus === "PENDING" && "bg-sky-100 text-sky-800",
                        card.approvalStatus === "CHANGES_REQUESTED" && "bg-amber-100 text-amber-900",
                      )}>{card.approvalStatus.replace("_", " ")} · Round {card.revisionRound}</span>}
                      {!isClient && <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Client visibility
                        <select value={card.visibility} disabled={!canEdit} onChange={(event) => mutateCard({ visibility: event.target.value }, "Card visibility updated")} className="rounded-md border bg-background px-2 py-1 text-foreground">
                          <option value="INTERNAL">Internal</option>
                          <option value="CLIENT_VISIBLE">Visible to client</option>
                        </select>
                      </label>}
                    </div>
                    {canEdit && card.visibility === "CLIENT_VISIBLE" && card.approvalStatus !== "PENDING" && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void submitApproval("send")}>Send for approval</Button>}
                  </div>
                </header>

                {!isClient && <section id="card-members">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Members</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {card.members.map((member) => (
                      <span key={member.id} className="inline-flex items-center gap-2 rounded-full bg-muted px-2 py-1 text-sm">
                        {member.image ? <Image src={member.image} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded-full object-cover" /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-xs font-semibold">{(member.name ?? member.email).slice(0, 1).toUpperCase()}</span>}
                        {member.name ?? member.email}
                      </span>
                    ))}
                    {!card.members.length && <span className="text-sm text-muted-foreground">No members assigned</span>}
                  </div>
                </section>}

                <section id="card-description">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Description</h3>
                    <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Description editor mode">
                      <button role="tab" aria-selected={descriptionTab === "write"} className={cn("rounded-md px-2 py-1 text-xs", descriptionTab === "write" && "bg-background shadow-sm")} onClick={() => setDescriptionTab("write")}>Write</button>
                      <button role="tab" aria-selected={descriptionTab === "preview"} className={cn("rounded-md px-2 py-1 text-xs", descriptionTab === "preview" && "bg-background shadow-sm")} onClick={() => setDescriptionTab("preview")}>Preview</button>
                    </div>
                  </div>
                  {descriptionTab === "write" ? (
                    <div className="space-y-2">
                      <MentionTextarea
                        value={description}
                        onChange={setDescription}
                        disabled={!canEdit}
                        onBlur={() => {
                          if (description !== (card.description ?? "")) mutateCard({ description: description || null }, "Description updated");
                        }}
                        placeholder="Add a more detailed description… Markdown is supported."
                        label="Card description in Markdown"
                        members={data?.boardMembers ?? []}
                        rows={6}
                        className="min-h-36 w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2 disabled:opacity-70"
                      />
                      <p className="text-xs text-muted-foreground">Markdown: **bold**, lists, [links](https://example.com), and `code`.</p>
                    </div>
                  ) : (
                    <div className="prose prose-sm min-h-20 max-w-none rounded-xl border bg-muted/30 p-4 dark:prose-invert">
                      {description.trim() ? <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{description}</ReactMarkdown> : <p className="not-prose text-sm text-muted-foreground">Nothing here yet. Add a description to give this card more context.</p>}
                    </div>
                  )}
                </section>

                <section id="card-checklists" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><CheckSquare className="h-4 w-4" /> Checklists</h3>
                    {canEdit && <form className="flex gap-2" onSubmit={(event) => {
                      event.preventDefault();
                      if (!checklistTitle.trim()) return;
                      mutateEndpoint(`/api/cards/${card.id}/checklists`, "POST", { title: checklistTitle.trim() }, "Checklist added");
                      setChecklistTitle("");
                    }}>
                      <Input className="h-8 w-36" value={checklistTitle} onChange={(event) => setChecklistTitle(event.target.value)} placeholder="Checklist title" aria-label="New checklist title" />
                      <Button size="sm" variant="outline" aria-label="Add checklist"><Plus className="h-4 w-4" /></Button>
                    </form>}
                  </div>
                  {card.checklists.map((checklist) => {
                    const completed = checklist.items.filter((item) => item.isComplete).length;
                    const ratio = checklist.items.length ? (completed / checklist.items.length) * 100 : 0;
                    return <ChecklistSection key={checklist.id} checklist={checklist} ratio={ratio} canEdit={canEdit} newValue={newItems[checklist.id] ?? ""} setNewValue={(value) => setNewItems((old) => ({ ...old, [checklist.id]: value }))} mutate={(url, method, body, message, optimisticChecklistItem) => action.mutate({ url, method, body, message, optimisticChecklistItem })} />;
                  })}
                  {!card.checklists.length && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No checklists yet. Add one to track this card’s steps.</p>}
                </section>

                <section id="card-subtasks" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Subtasks</h3>
                    <span className="text-xs text-muted-foreground">
                      {card.subtasks.filter((item) => item.isComplete).length}/{card.subtasks.length} complete
                    </span>
                  </div>
                  {card.subtasks.length > 0 && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${card.subtasks.filter((item) => item.isComplete).length / card.subtasks.length * 100}%` }}
                      />
                    </div>
                  )}
                  <ul className="space-y-1">
                    {card.subtasks.map((subtask) => (
                      <li key={subtask.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={subtask.isComplete}
                          disabled={!canEdit}
                          aria-label={`Mark subtask ${subtask.title} ${subtask.isComplete ? "incomplete" : "complete"}`}
                          onChange={(event) => action.mutate({
                            url: `/api/cards/${subtask.id}`,
                            body: { isComplete: event.target.checked },
                            message: "Subtask updated",
                            optimisticSubtask: { subtaskId: subtask.id, isComplete: event.target.checked },
                          })}
                        />
                        <span className={cn("min-w-0 flex-1 break-words", subtask.isComplete && "text-muted-foreground line-through")}>{subtask.title}</span>
                      </li>
                    ))}
                  </ul>
                  {canEdit && <form className="flex gap-2" onSubmit={(event) => {
                    event.preventDefault();
                    if (!subtaskTitle.trim()) return;
                    mutateEndpoint(`/api/cards/${card.id}/subtasks`, "POST", { title: subtaskTitle.trim() }, "Subtask added");
                    setSubtaskTitle("");
                  }}>
                    <Input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} maxLength={200} placeholder="Add a subtask" aria-label="Subtask title" className="h-9" />
                    <Button type="submit" variant="outline" size="icon" disabled={!subtaskTitle.trim()} aria-label="Add subtask"><ListPlus className="h-4 w-4" /></Button>
                  </form>}
                </section>

                <section id="card-attachments" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" /> Attachments</h3>
                    <span className="text-xs text-muted-foreground">{card.attachments.length}</span>
                  </div>
                  {canInteract && <div
                    className={cn("rounded-xl border-2 border-dashed p-5 text-center transition", draggingFiles ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50")}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setDraggingFiles(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDraggingFiles(false);
                      void uploadFiles(event.dataTransfer.files);
                    }}
                  >
                    <p className="text-sm font-medium">Drop images or PDFs here</p>
                    <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, WebP, or PDF · 10 MB maximum</p>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      multiple
                      className="sr-only"
                      disabled={uploading}
                      onChange={(event) => {
                        if (event.target.files) void uploadFiles(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" className="mt-3" disabled={uploading} onClick={() => uploadInputRef.current?.click()}>
                      <Plus className="h-4 w-4" /> {uploading ? "Uploading…" : "Choose files"}
                    </Button>
                  </div>}
                  {card.attachments.length ? (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {card.attachments.map((attachment) => (
                        <li key={attachment.id} className="group/attachment relative min-w-0 rounded-xl border bg-card p-2">
                          {attachment.id.startsWith("pending-") ? (
                            <div className="mb-2 grid h-28 place-items-center rounded-lg bg-muted text-muted-foreground" role="status">
                              <span className="animate-pulse text-sm">Uploading…</span>
                            </div>
                          ) : attachment.type === "IMAGE" ? (
                            <button type="button" className="mb-2 block h-28 w-full overflow-hidden rounded-lg bg-muted" aria-label={`Preview ${attachment.name}`} onClick={() => setPreviewAttachment(attachment)}>
                              <Image src={attachment.url} alt={attachment.name} width={320} height={160} unoptimized className="h-full w-full object-cover transition group-hover/attachment:scale-[1.02]" />
                            </button>
                          ) : attachment.type === "FILE" ? (
                            <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="mb-2 flex h-28 items-center justify-center rounded-lg bg-muted/60 text-destructive hover:bg-muted" aria-label={`Open PDF ${attachment.name} in a new tab`}>
                              <FileText className="h-10 w-10" />
                            </a>
                          ) : (
                            <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="mb-2 flex h-28 items-center justify-center rounded-lg bg-muted/60 text-primary hover:bg-muted">
                              <Link2 className="h-9 w-9" />
                            </a>
                          )}
                          <div className="flex min-w-0 items-center gap-2">
                            {attachment.type === "FILE" ? <FileText className="h-4 w-4 shrink-0 text-destructive" /> : attachment.type === "LINK" ? <Link2 className="h-4 w-4 shrink-0 text-primary" /> : <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium" title={attachment.name}>{attachment.name}</p>
                              <p className="text-xs text-muted-foreground">{attachment.type === "LINK" ? "Link" : formatBytes(attachment.sizeBytes)}</p>
                            </div>
                          </div>
                          {canEdit && !attachment.id.startsWith("pending-") && <div className="mt-2 flex flex-wrap gap-1">
                            {attachment.type === "IMAGE" && <Button type="button" variant={attachment.isCover ? "secondary" : "ghost"} size="sm" className="h-7 px-2 text-xs" onClick={() => void setAttachmentCover(attachment)}>{attachment.isCover ? "Cover" : "Make cover"}</Button>}
                            <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs text-destructive hover:text-destructive" aria-label={`Delete ${attachment.name}`} onClick={() => {
                              if (window.confirm(`Delete "${attachment.name}"?`)) void removeAttachment(attachment);
                            }}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                          </div>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No attachments yet.</p>}
                  {canEdit && <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]" onSubmit={(event) => void addLink(event)}>
                    <Input value={linkName} onChange={(event) => setLinkName(event.target.value)} maxLength={120} placeholder="Link name" aria-label="Attachment link name" className="h-9" />
                    <Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} type="url" maxLength={2048} placeholder="https://example.com" aria-label="Attachment URL" className="h-9" />
                    <Button type="submit" variant="outline" size="sm" disabled={!linkName.trim() || !linkUrl.trim()}><Link2 className="h-4 w-4" />Add link</Button>
                  </form>}
                </section>

                <section id="card-comments" className="space-y-4 border-t pt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Comments</h3>
                    <span className="text-xs text-muted-foreground">{card.comments.length}</span>
                  </div>
                  {canInteract && <form className="space-y-2" onSubmit={(event) => void submitComment(event)}>
                    <MentionTextarea value={commentDraft} onChange={setCommentDraft} members={data?.boardMembers ?? []} disabled={!canInteract} rows={3} label="Write a comment" placeholder="Write a comment… Type @ to mention someone." className="min-h-20 w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2" />
                    <div className="flex items-center justify-between gap-2">
                      {!isClient && <label className="text-xs text-muted-foreground">Visible to
                        <select value={commentVisibility} onChange={(event) => setCommentVisibility(event.target.value as "INTERNAL" | "CLIENT")} className="ml-2 rounded-md border bg-background px-2 py-1 text-foreground">
                          <option value="INTERNAL">Internal</option>
                          <option value="CLIENT">Visible to client</option>
                        </select>
                      </label>}
                      <Button type="submit" size="sm" disabled={!commentDraft.trim() || commentSubmitting}>
                        {commentSubmitting ? "Sending…" : isClient ? "Send comment" : "Comment"}
                      </Button>
                    </div>
                    {isClient && card.approvalStatus === "PENDING" && <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <Button type="button" size="sm" disabled={action.isPending} onClick={() => void submitApproval("approve")}>Approve</Button>
                      <Input value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} maxLength={5000} placeholder="Note required to request changes" aria-label="Change request note" className="h-9 min-w-48 flex-1" />
                      <Button type="button" size="sm" variant="outline" disabled={!approvalNote.trim() || action.isPending} onClick={() => void submitApproval("request-changes")}>Request changes</Button>
                    </div>}
                  </form>}
                  {card.comments.length ? (
                    <ol className="space-y-4">
                      {card.comments.map((comment) => {
                        const groups = new Map<string, CommentReaction[]>();
                        for (const reaction of comment.reactions) groups.set(reaction.emoji, [...(groups.get(reaction.emoji) ?? []), reaction]);
                        const ownComment = comment.authorId === data?.currentUserId;
                        const canDeleteComment = ownComment || data?.role === "OWNER" || data?.role === "ADMIN";
                        return <li key={comment.id} className="rounded-xl border bg-card p-3">
                          <div className="flex items-start gap-2">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold">{(comment.author?.name ?? comment.authorLabel ?? "?").slice(0, 1).toUpperCase()}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="text-sm font-medium">{comment.author?.name ?? comment.authorLabel ?? "Member"}</span>
                                {!isClient && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{comment.visibility === "CLIENT" ? "Client-visible" : "Team only"}</span>}
                                <span className="text-xs text-muted-foreground">{relativeTime(comment.createdAt)}</span>
                                {comment.updatedAt !== comment.createdAt && <span className="text-xs text-muted-foreground">(edited)</span>}
                              </div>
                              {editingComment === comment.id ? <div className="mt-2 space-y-2">
                                <MentionTextarea value={commentEditDraft} onChange={setCommentEditDraft} members={data?.boardMembers ?? []} disabled={!canEdit} rows={3} label="Edit comment" placeholder="Edit comment…" className="w-full resize-y rounded-lg border bg-background p-2 text-sm" />
                                <div className="flex justify-end gap-2">
                                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingComment(null)}>Cancel</Button>
                                  <Button type="button" size="sm" disabled={!commentEditDraft.trim()} onClick={() => void saveComment(comment)}>Save</Button>
                                </div>
                              </div> : <div className="prose prose-sm mt-1 max-w-none break-words dark:prose-invert"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{comment.body}</ReactMarkdown></div>}
                              <div className="mt-2 flex flex-wrap items-center gap-1">
                                {!isClient && Array.from(groups.entries()).map(([emoji, reactions]) => <button key={emoji} type="button" disabled={!canEdit} title={reactions.map((reaction) => reaction.user.name ?? "Member").join(", ")} aria-pressed={reactions.some((reaction) => reaction.userId === data?.currentUserId)} className={cn("rounded-full border px-2 py-0.5 text-xs", reactions.some((reaction) => reaction.userId === data?.currentUserId) && "border-primary bg-primary/10")} onClick={() => void toggleReaction(comment, emoji)}>{emoji} {reactions.length}</button>)}
                                {canEdit && !isClient && ["👍", "❤️", "🎉"].map((emoji) => <button key={emoji} type="button" className="rounded-full px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted" aria-label={`React ${emoji}`} onClick={() => void toggleReaction(comment, emoji)}>{emoji}</button>)}
                                {editingComment !== comment.id && <>
                                  {ownComment && <button type="button" className="ml-auto rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted" onClick={() => { setEditingComment(comment.id); setCommentEditDraft(comment.body); }}>Edit</button>}
                                  {canDeleteComment && <button type="button" className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10" onClick={() => { if (window.confirm("Delete this comment?")) void deleteComment(comment); }}>Delete</button>}
                                </>}
                              </div>
                            </div>
                          </div>
                        </li>;
                      })}
                    </ol>
                  ) : <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No comments yet. Start the conversation.</p>}
                </section>

                <section id="card-activity" className="space-y-3 border-t pt-5">
                  <h3 className="text-sm font-semibold">Activity</h3>
                  {card.activities.length ? (
                    <ol className="space-y-3">
                      {card.activities.map((activity) => (
                        <li key={activity.id} className="flex items-start gap-2 text-sm">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                          <p className="min-w-0 flex-1">
                            <span className="font-medium">{activity.actor?.name ?? activity.actorLabel ?? "A member"}</span>{" "}
                            {activity.action.toLowerCase().replaceAll("_", " ")}
                            <span className="ml-2 text-xs text-muted-foreground">{relativeTime(activity.createdAt)}</span>
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-sm text-muted-foreground">No activity yet.</p>}
                </section>
              </main>

              <aside className="space-y-5 border-t pt-5 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add to card</h3>
                  <nav className="grid grid-cols-2 gap-2" aria-label="Card actions">
                    <Button type="button" title="Members (M)" variant="outline" size="sm" className="justify-start" onClick={() => focusActionSection("card-members-picker")}><Users className="h-4 w-4" />Members</Button>
                    <Button type="button" title="Labels (L)" variant="outline" size="sm" className="justify-start" onClick={() => focusActionSection("card-labels")}><Tag className="h-4 w-4" />Labels</Button>
                    <Button type="button" title="Dates (D)" variant="outline" size="sm" className="justify-start" onClick={() => focusActionSection("card-dates")}><CalendarDays className="h-4 w-4" />Dates</Button>
                    <Button type="button" title="Priority (P)" variant="outline" size="sm" className="justify-start" onClick={() => focusActionSection("card-priority")}><Flag className="h-4 w-4" />Priority</Button>
                    <Button type="button" title="Checklist" variant="outline" size="sm" className="justify-start" onClick={() => focusActionSection("card-checklists")}><CheckSquare className="h-4 w-4" />Checklist</Button>
                    <Button type="button" variant="outline" size="sm" className="justify-start" onClick={() => focusActionSection("card-attachments")}><Paperclip className="h-4 w-4" />Attachment</Button>
                  </nav>
                </div>

                <section id="card-priority" className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</h3>
                  {priorities.map((priority) => (
                    <button key={priority.value} disabled={!canEdit} onClick={() => mutateCard({ priority: priority.value }, "Priority updated")} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm disabled:cursor-default", priority.className)}>
                      <span className="flex items-center gap-2"><Flag className="h-4 w-4" />{priority.label}</span>
                      {card.priority === priority.value && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </section>

                <section id="card-labels" className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Labels</h3>
                  <div className="space-y-1">
                    {availableLabels.map((label) => {
                      const assigned = labels.some((item) => item.id === label.id);
                      return <div key={label.id} className="flex items-center gap-1">
                        <button type="button" disabled={!canEdit} onClick={() => void assignLabel(label)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:cursor-default">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: label.color }} /> <span className="flex-1 truncate">{label.name}</span>{assigned && <Check className="h-4 w-4" />}
                        </button>
                        {canEdit && <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={`Edit ${label.name}`} onClick={() => void editLabel(label)}><Pencil className="h-3 w-3" /></button>}
                        {canEdit && <button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${label.name}`} onClick={() => void deleteLabel(label)}><Trash2 className="h-3 w-3" /></button>}
                      </div>;
                    })}
                  </div>
                  {canEdit && <div className="flex gap-1">
                    <input type="color" value={newLabelColor} onChange={(event) => setNewLabelColor(event.target.value)} aria-label="New label color" className="h-9 w-9 rounded border bg-background p-1" />
                    <Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} maxLength={40} placeholder="New label" aria-label="New label name" className="h-9 min-w-0" />
                    <Button type="button" variant="outline" size="icon" aria-label="Create label" disabled={!newLabel.trim()} onClick={() => void saveLabel()}><Plus className="h-4 w-4" /></Button>
                  </div>}
                </section>

                <section id="card-members-picker" className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Board members</h3>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {(data?.boardMembers ?? []).map((member) => {
                      const checked = card.members.some((item) => item.id === member.id);
                      return <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                        <input type="checkbox" checked={checked} disabled={!canEdit} onChange={(event) => void setMembers(event.target.checked ? [...card.members.map((item) => item.id), member.id] : card.members.filter((item) => item.id !== member.id).map((item) => item.id))} />
                        {member.image ? <Image src={member.image} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded-full object-cover" /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-xs">{(member.name ?? member.email).slice(0, 1).toUpperCase()}</span>}
                        <span className="truncate">{member.name ?? member.email}</span>
                      </label>;
                    })}
                    {!data?.boardMembers.length && <p className="text-sm text-muted-foreground">No board members available.</p>}
                  </div>
                </section>

                <section id="card-dates" className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dates</h3>
                  <DateField label="Start date" value={card.startDate} disabled={!canEdit} onSave={(value) => mutateCard({ startDate: value }, "Start date updated")} />
                  <DateField label="Due date" value={card.dueDate} disabled={!canEdit} onSave={(value) => mutateCard({ dueDate: value }, "Due date updated")} />
                  <DateField label="Reminder" value={card.reminderAt} disabled={!canEdit} onSave={(value) => mutateCard({ reminderAt: value }, "Reminder updated")} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={card.isComplete} disabled={!canEdit} onChange={(event) => mutateCard({ isComplete: event.target.checked }, event.target.checked ? "Card completed" : "Card reopened")} />
                    Mark complete
                  </label>
                </section>

                {!isClient && <section id="card-estimate" className="space-y-2">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Time estimate</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <Input
                      type="number"
                      min={0}
                      max={100000}
                      step="0.25"
                      defaultValue={card.estimatedHours ?? ""}
                      disabled={!canEdit}
                      aria-label="Time estimate in hours"
                      className="h-9"
                      onBlur={(event) => {
                        const raw = event.currentTarget.value;
                        const value = raw === "" ? null : Number(raw);
                        if (value !== card.estimatedHours) mutateCard({ estimatedHours: value }, "Time estimate updated");
                      }}
                    />
                    <span className="shrink-0 text-muted-foreground">hours</span>
                  </label>
                </section>}

                <section id="card-move" className="space-y-2 border-t pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Move card</h3>
                  <select
                    value={targetBoardId}
                    disabled={!canEdit}
                    aria-label="Destination board"
                    className="w-full rounded-lg border bg-background px-2 py-2 text-sm"
                    onChange={(event) => {
                      const nextBoard = data?.targetBoards.find((item) => item.id === event.target.value);
                      setTargetBoardId(event.target.value);
                      setTargetListId(nextBoard?.lists[0]?.id ?? "");
                    }}
                  >
                    {(data?.targetBoards ?? []).map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}
                  </select>
                  <select
                    value={targetListId}
                    disabled={!canEdit || !data?.targetBoards.find((item) => item.id === targetBoardId)?.lists.length}
                    aria-label="Destination list"
                    className="w-full rounded-lg border bg-background px-2 py-2 text-sm"
                    onChange={(event) => setTargetListId(event.target.value)}
                  >
                    {(data?.targetBoards.find((item) => item.id === targetBoardId)?.lists ?? []).map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}
                  </select>
                  <Button type="button" variant="outline" size="sm" className="w-full" disabled={!canEdit || action.isPending || !targetListId} onClick={moveCardToSelection}>
                    <ArrowRightLeft className="h-4 w-4" /> Move card
                  </Button>
                </section>

                <section className="space-y-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={!canEdit || action.isPending}
                    onClick={() => action.mutate({
                      url: `/api/cards/${card.id}/watch`,
                      method: "PUT",
                      body: { watching: !card.isWatching },
                      message: card.isWatching ? "Unfollowed card" : "Following card",
                      optimistic: { isWatching: !card.isWatching },
                    })}
                  >
                    <Eye className="h-4 w-4" />{card.isWatching ? "Unfollow card" : "Follow card"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="w-full justify-start" disabled={!canEdit} onClick={() => void copyCard()}>
                    <Copy className="h-4 w-4" /> Copy card
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={async () => {
                    const url = `${window.location.origin}/boards/${boardId}?card=${card.id}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success("Card link copied");
                    } catch {
                      toast.error("Could not copy the card link");
                    }
                  }}><Link2 className="h-4 w-4" /> Share link</Button>
                  <Button type="button" variant="outline" size="sm" className="w-full justify-start" disabled={!canEdit || action.isPending} onClick={() => {
                    action.mutate({
                      url: `/api/cards/${card.id}`,
                      body: { archived: true },
                      message: "Card archived",
                      optimistic: { archivedAt: new Date().toISOString() },
                      closeOnSuccess: true,
                    });
                  }}><Archive className="h-4 w-4" /> Archive card</Button>
                  <Button type="button" variant="destructive" size="sm" className="w-full justify-start" disabled={!canEdit || action.isPending} onClick={() => {
                    if (!window.confirm(`Delete "${card.title}" permanently?`)) return;
                    action.mutate({
                      url: `/api/cards/${card.id}`,
                      method: "DELETE",
                      message: "Card deleted",
                      closeOnSuccess: true,
                    });
                  }}><Trash2 className="h-4 w-4" /> Delete card</Button>
                </section>
              </aside>
            </div>
          </>
        )}
      </DialogContent>
      <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => {
        if (!open) {
          setPreviewAttachment(null);
          setPinMode(false);
        }
      }}>
        <DialogContent className="max-h-[92dvh] max-w-6xl overflow-y-auto border-0 bg-black/95 p-3 text-white">
          <DialogTitle className="sr-only">{previewAttachment?.name ?? "Image preview"}</DialogTitle>
          {previewAttachment && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{previewAttachment.name} · v{previewAttachment.versionNumber}</p>
                <div className="flex gap-2">
                  {versionsQuery.data && versionsQuery.data.versions.length > 1 && <select
                    aria-label="Choose design version"
                    value={previewAttachment.id}
                    onChange={(event) => void selectImageVersion(event.target.value)}
                    className="max-w-44 rounded border border-white/20 bg-black px-2 py-1 text-sm text-white"
                  >{versionsQuery.data.versions.map((version) => <option key={version.id} value={version.id}>v{version.versionNumber}{version.isCurrentVersion ? " · current" : ""}</option>)}</select>}
                  {(canEdit || isClient) && <label className="cursor-pointer rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10">
                    Upload version
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void uploadImageVersion(file);
                      event.currentTarget.value = "";
                    }} />
                  </label>}
                </div>
              </div>
              <div
                className={cn("relative mx-auto inline-block max-h-[72dvh] max-w-full", pinMode && "cursor-crosshair")}
                onClick={(event) => void createDesignPin(event)}
              >
                <Image src={previewAttachment.url} alt={previewAttachment.name} width={1600} height={1200} unoptimized className="block max-h-[72dvh] w-auto max-w-full object-contain" />
                {pinsQuery.data?.pins.map((pin, index) => <button
                  key={pin.id}
                  type="button"
                  title={`${index + 1}. ${pin.body}`}
                  aria-label={`Pin ${index + 1}: ${pin.body}`}
                  onClick={(event) => event.stopPropagation()}
                  className={cn("absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-xs font-bold shadow-lg", pin.resolvedAt ? "bg-emerald-600" : "bg-primary")}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                >{index + 1}</button>)}
              </div>
              {canInteract && <Button type="button" size="sm" variant={pinMode ? "secondary" : "outline"} className="mt-2" onClick={() => setPinMode((current) => !current)}>{pinMode ? "Click the image to place a pin" : "Add review pin"}</Button>}
            </div>
            <aside className="space-y-2 border-t border-white/15 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <h3 className="font-semibold">Design feedback</h3>
              {!pinsQuery.data?.pins.length && <p className="text-sm text-white/65">No pinned feedback yet.</p>}
              <ol className="max-h-[66dvh] space-y-2 overflow-y-auto">
                {pinsQuery.data?.pins.map((pin, index) => <li key={pin.id} className="rounded-lg bg-white/10 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">#{index + 1} · {pin.authorName}</span><span className="text-xs text-white/60">{pin.resolvedAt ? "Resolved" : "Open"}</span></div>
                  <p className="mt-1 whitespace-pre-wrap">{pin.body}</p>
                  {canInteract && <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2 text-white hover:bg-white/10 hover:text-white" onClick={() => void setPinResolved(pin, !pin.resolvedAt)}>{pin.resolvedAt ? "Reopen" : "Resolve"}</Button>}
                </li>)}
              </ol>
            </aside>
          </div>}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function DateField({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string;
  value: string | null;
  disabled: boolean;
  onSave: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(toLocalDate(value));
  useEffect(() => setDraft(toLocalDate(value)), [value]);
  return <label className="block space-y-1 text-xs text-muted-foreground">
    {label}
    <input
      type="datetime-local"
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const nextValue = dateValue(draft);
        if (nextValue !== value) onSave(nextValue);
      }}
      className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm text-foreground disabled:opacity-60"
    />
  </label>;
}

function ChecklistSection({
  checklist,
  ratio,
  canEdit,
  newValue,
  setNewValue,
  mutate,
}: {
  checklist: Checklist;
  ratio: number;
  canEdit: boolean;
  newValue: string;
  setNewValue: (value: string) => void;
  mutate: (url: string, method: string, body: unknown, message: string, optimisticChecklistItem?: Action["optimisticChecklistItem"]) => void;
}) {
  const completed = checklist.items.filter((item) => item.isComplete).length;
  return <article className="space-y-3 rounded-xl border p-4">
    <header className="flex items-center gap-2">
      <h4 className="min-w-0 flex-1 truncate text-sm font-semibold">{checklist.title}</h4>
      <span className="text-xs text-muted-foreground">{completed}/{checklist.items.length}</span>
      {canEdit && <Button type="button" variant="ghost" size="sm" onClick={() => {
        const title = window.prompt("Checklist title", checklist.title)?.trim();
        if (title && title !== checklist.title) mutate(`/api/checklists/${checklist.id}`, "PATCH", { title }, "Checklist renamed");
      }}>Rename</Button>}
      {canEdit && <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${checklist.title}`} onClick={() => {
        if (window.confirm(`Delete checklist "${checklist.title}"?`)) mutate(`/api/checklists/${checklist.id}`, "DELETE", undefined, "Checklist deleted");
      }}><Trash2 className="h-4 w-4" /></Button>}
    </header>
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${ratio}%` }} /></div>
      <span className="w-9 text-right text-xs text-muted-foreground">{Math.round(ratio)}%</span>
    </div>
    <div className="space-y-1">
      {checklist.items.map((item, index) => (
        <div key={item.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60">
          <input type="checkbox" checked={item.isComplete} disabled={!canEdit} aria-label={`Complete ${item.text}`} onChange={(event) => mutate(`/api/checklist-items/${item.id}`, "PATCH", { isComplete: event.target.checked }, event.target.checked ? "Checklist item completed" : "Checklist item reopened", { itemId: item.id, patch: { isComplete: event.target.checked } })} />
          <span className={cn("min-w-0 flex-1 break-words text-sm", item.isComplete && "text-muted-foreground line-through")}>{item.text}</span>
          {canEdit && <div className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <button type="button" disabled={index === 0} className="rounded p-1 text-muted-foreground hover:bg-background disabled:opacity-30" aria-label={`Move ${item.text} up`} onClick={() => {
              const remaining = checklist.items.filter((entry) => entry.id !== item.id);
              const targetIndex = index - 1;
              const position = positionBetween(
                targetIndex > 0 ? remaining[targetIndex - 1].position : null,
                remaining[targetIndex]?.position ?? null,
              );
              mutate(`/api/checklist-items/${item.id}`, "PATCH", { position }, "Checklist item reordered", { itemId: item.id, patch: { position } });
            }}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" disabled={index === checklist.items.length - 1} className="rounded p-1 text-muted-foreground hover:bg-background disabled:opacity-30" aria-label={`Move ${item.text} down`} onClick={() => {
              const remaining = checklist.items.filter((entry) => entry.id !== item.id);
              const targetIndex = index + 1;
              const position = positionBetween(
                remaining[targetIndex - 1]?.position ?? null,
                remaining[targetIndex]?.position ?? null,
              );
              mutate(`/api/checklist-items/${item.id}`, "PATCH", { position }, "Checklist item reordered", { itemId: item.id, patch: { position } });
            }}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-background" aria-label={`Convert ${item.text} to a card`} onClick={() => mutate(`/api/checklist-items/${item.id}/convert`, "POST", undefined, "Checklist item converted to a card")}><ClipboardList className="h-3.5 w-3.5" /></button>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${item.text}`} onClick={() => mutate(`/api/checklist-items/${item.id}`, "DELETE", undefined, "Checklist item deleted")}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>}
        </div>
      ))}
    </div>
    {canEdit && <form className="flex gap-2" onSubmit={(event) => {
      event.preventDefault();
      if (!newValue.trim()) return;
      mutate(`/api/checklists/${checklist.id}/items`, "POST", { text: newValue.trim() }, "Checklist item added");
      setNewValue("");
    }}>
      <Input value={newValue} onChange={(event) => setNewValue(event.target.value)} maxLength={500} placeholder="Add an item" aria-label={`Add item to ${checklist.title}`} className="h-9" />
      <Button type="submit" variant="outline" size="icon" aria-label="Add checklist item" disabled={!newValue.trim()}><Plus className="h-4 w-4" /></Button>
    </form>}
  </article>;
}
