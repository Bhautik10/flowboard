import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBoardAccess, isResponse } from "@/lib/workspaces";

type Context = { params: { boardId: string } };

export async function POST(request: Request, { params }: Context) {
  const access = await getBoardAccess(params.boardId);
  if (isResponse(access)) return access;
  const parsed = z.object({ favorite: z.boolean() }).safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  if (parsed.data.favorite) {
    await prisma.boardFavorite.upsert({
      where: {
        boardId_userId: { boardId: params.boardId, userId: access.userId },
      },
      update: {},
      create: { boardId: params.boardId, userId: access.userId },
    });
  } else {
    await prisma.boardFavorite.deleteMany({
      where: { boardId: params.boardId, userId: access.userId },
    });
  }
  return NextResponse.json({ favorite: parsed.data.favorite });
}
