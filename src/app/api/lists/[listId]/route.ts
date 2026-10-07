import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canEditContent,
  getBoardAccess,
  isResponse,
} from "@/lib/workspaces";
import { updateListSchema } from "@/lib/validations/workspaces";

type Context = { params: { listId: string } };

async function listAccess(listId: string) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { id: true, boardId: true },
  });
  if (!list) return { response: NextResponse.json({ error: "List not found" }, { status: 404 }) };
  const access = await getBoardAccess(list.boardId);
  if (isResponse(access)) return { response: access };
  return { list, access };
}

export async function PATCH(request: Request, { params }: Context) {
  const result = await listAccess(params.listId);
  if ("response" in result) return result.response;
  if (!canEditContent(result.access.role)) {
    return NextResponse.json({ error: "Viewers cannot edit lists" }, { status: 403 });
  }
  const parsed = updateListSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const list = await prisma.list.update({
    where: { id: params.listId },
    data: {
      title: parsed.data.title,
      wipLimit: parsed.data.wipLimit,
      archivedAt:
        parsed.data.archived === undefined
          ? undefined
          : parsed.data.archived
            ? new Date()
            : null,
    },
  });
  return NextResponse.json({ list });
}

export async function DELETE(_request: Request, { params }: Context) {
  const result = await listAccess(params.listId);
  if ("response" in result) return result.response;
  if (!canEditContent(result.access.role)) {
    return NextResponse.json({ error: "Viewers cannot delete lists" }, { status: 403 });
  }
  await prisma.list.delete({ where: { id: params.listId } });
  return NextResponse.json({ success: true });
}
