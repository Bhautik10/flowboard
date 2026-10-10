export type FilterCard = {
  title: string;
  description?: string | null;
  dueDate?: string | Date | null;
  priority?: string | null;
  isComplete?: boolean;
  approvalStatus?: string | null;
  labels?: { id: string }[];
  members?: { id: string }[];
  customFields?: { fieldId: string; value: unknown }[];
};

export function cardMatchesFilters(card: FilterCard, filters: URLSearchParams, now = new Date()) {
  const keyword = filters.get("q")?.trim().toLocaleLowerCase();
  if (keyword && !`${card.title} ${card.description ?? ""}`.toLocaleLowerCase().includes(keyword)) return false;
  const labels = filters.getAll("label");
  if (labels.length && !labels.every((id) => card.labels?.some((label) => label.id === id))) return false;
  const members = filters.getAll("member");
  if (members.length && !members.every((id) => card.members?.some((member) => member.id === id))) return false;
  const priorities = filters.getAll("priority");
  if (priorities.length && !priorities.includes(card.priority ?? "NORMAL")) return false;
  const statuses = filters.getAll("status");
  if (statuses.length && !statuses.includes(card.isComplete ? "complete" : "incomplete")) return false;
  const approvals = filters.getAll("approval");
  if (approvals.length && !approvals.includes(card.approvalStatus ?? "NONE")) return false;
  for (const [key, value] of Array.from(filters.entries())) {
    if (!key.startsWith("custom_") || !value) continue;
    const fieldId = key.slice("custom_".length);
    const actual = card.customFields?.find((field) => field.fieldId === fieldId)?.value;
    const normalized = typeof actual === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? actual.slice(0, 10) : String(actual ?? "");
    if (normalized !== value) return false;
  }
  const due = filters.getAll("due");
  if (due.length) {
    const date = card.dueDate ? new Date(card.dueDate) : null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endWeek = new Date(today); endWeek.setDate(today.getDate() + 7);
    if (!due.some((key) => key === "none" ? !date : key === "overdue" ? Boolean(date && date < today && !card.isComplete) : key === "today" ? Boolean(date && date >= today && date < new Date(today.getTime() + 86400000)) : key === "week" ? Boolean(date && date >= today && date < endWeek) : false)) return false;
  }
  return true;
}
