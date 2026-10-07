import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initialPosition, positionBetween } from "@/lib/position";
import { agencyTemplateSchema } from "@/lib/validations/agency";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

const templates = {
  "logo-design": {
    name: "Logo Design",
    cards: [
      ["Collect logo brief", ["Audience and market", "Brand attributes", "Required formats"]],
      ["Explore visual directions", ["Build moodboard", "Sketch three concepts", "Review internally"]],
      ["Prepare final logo files", ["Export SVG", "Export transparent PNG", "Package source files"]],
    ],
  },
  "social-media-campaign": {
    name: "Social Media Campaign",
    cards: [
      ["Define campaign brief", ["Set goals and audience", "Confirm channels", "Agree on key message"]],
      ["Create campaign assets", ["Draft copy", "Design post set", "Check channel dimensions"]],
      ["Prepare delivery pack", ["Export approved assets", "Include captions", "Document schedule"]],
    ],
  },
  "website-design": {
    name: "Website Design",
    cards: [
      ["Gather website requirements", ["Confirm goals", "Map audience", "Collect content and references"]],
      ["Design page system", ["Create sitemap", "Draft wireframes", "Design responsive screens"]],
      ["Prepare handoff", ["Check component states", "Export design specs", "Review accessibility"]],
    ],
  },
  "branding-package": {
    name: "Branding Package",
    cards: [
      ["Run brand discovery", ["Review existing identity", "Interview stakeholders", "Define positioning"]],
      ["Develop identity system", ["Create logo direction", "Choose typography", "Define color palette"]],
      ["Build brand guidelines", ["Document logo use", "Document typography", "Package deliverables"]],
    ],
  },
} as const;

const listNames = ["Brief", "In Progress", "Internal Review", "Client Review", "Revisions", "Approved", "Delivered"];

export async function POST(request: Request, { params }: { params: { boardId: string } }) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) return NextResponse.json({ error: "Only team members can apply templates" }, { status: 403 });
  const parsed = agencyTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const template = templates[parsed.data.template];
  const board = await prisma.board.findUnique({
    where: { id: params.boardId },
    select: { id: true, lists: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: { position: true } } },
  });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const createdLists = await prisma.$transaction(async (tx) => {
    const lists = [];
    let previousListPosition: string | null = board.lists.length ? board.lists[board.lists.length - 1].position : null;
    for (let index = 0; index < listNames.length; index += 1) {
      const title = listNames[index];
      const position: string = previousListPosition === null && index === 0
        ? initialPosition()
        : positionBetween(previousListPosition, null);
      const list = await tx.list.create({
        data: { boardId: board.id, title, position },
      });
      lists.push(list);
      previousListPosition = position;
    }
    for (let index = 0; index < template.cards.length; index += 1) {
      const [title, items] = template.cards[index];
      const list = lists[Math.min(index + 1, lists.length - 1)];
      const card = await tx.card.create({
        data: {
          boardId: board.id,
          listId: list.id,
          title: `${template.name}: ${title}`,
          position: initialPosition(),
          visibility: index === 2 ? "CLIENT_VISIBLE" : "INTERNAL",
        },
      });
      const checklist = await tx.checklist.create({
        data: { cardId: card.id, title: "Project checklist", position: initialPosition() },
      });
      let previousItemPosition: string | null = null;
      for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const text = items[itemIndex];
        const position: string = previousItemPosition === null ? initialPosition() : positionBetween(previousItemPosition, null);
        await tx.checklistItem.create({ data: { checklistId: checklist.id, text, position } });
        previousItemPosition = position;
      }
    }
    await tx.activity.create({
      data: {
        boardId: board.id,
        actorId: access.userId,
        entityType: "BOARD",
        entityId: board.id,
        action: "AGENCY_TEMPLATE_APPLIED",
        metadata: { template: parsed.data.template },
      },
    });
    return lists;
  });
  return NextResponse.json({ lists: createdLists, template: template.name }, { status: 201 });
}
