import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { positionBetween } from "@/lib/position";
import { createListSchema } from "@/lib/validations/workspaces";
import { canEditContent, getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { boardId: string } };

export async function POST(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  if (!canEditContent(access.role)) {
    return NextResponse.json({ error: "Viewers cannot create lists" }, { status: 403 });
  }
  const parsed = createListSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const last = await prisma.list.findFirst({
    where: { boardId: params.boardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const list = await prisma.list.create({
    data: {
      boardId: params.boardId,
      title: parsed.data.title,
      position: positionBetween(last?.position ?? null, null),
    },
  });
  return NextResponse.json({ list }, { status: 201 });
}
