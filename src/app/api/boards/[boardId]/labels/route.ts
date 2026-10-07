import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { boardLabelSchema } from "@/lib/validations/card-details";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { boardId: string } };

export async function GET(_request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  const labels = await prisma.label.findMany({
    where: { boardId: params.boardId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ labels });
}

export async function POST(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot create labels" }, { status: 403 });
  }
  const parsed = boardLabelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const label = await prisma.$transaction(async (tx) => {
    const created = await tx.label.create({
      data: { boardId: params.boardId, ...parsed.data },
    });
    await tx.activity.create({
      data: {
        boardId: params.boardId,
        actorId: access.userId,
        entityType: "BOARD",
        entityId: params.boardId,
        action: "BOARD_LABEL_CREATED",
        metadata: { labelId: created.id, name: created.name },
      },
    });
    return created;
  });
  return NextResponse.json({ label }, { status: 201 });
}
