import { readBoardBackground } from "@/lib/storage";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBoardAccess, isResponse } from "@/lib/workspaces";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  request: Request,
  { params }: { params: { fileName: string } },
) {
  const fileName = z.string().regex(/^[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/).safeParse(params.fileName);
  const boardId = z.string().cuid().safeParse(new URL(request.url).searchParams.get("boardId"));
  if (!fileName.success || !boardId.success) {
    return NextResponse.json({ error: "Background image not found" }, { status: 404 });
  }
  const access = await getBoardAccess(boardId.data);
  if (isResponse(access)) return access;
  const imageUrl = `/api/board-backgrounds/${fileName.data}?boardId=${boardId.data}`;
  const board = await prisma.board.findFirst({
    where: { id: boardId.data, backgroundImage: imageUrl },
    select: { id: true },
  });
  if (!board) return NextResponse.json({ error: "Background image not found" }, { status: 404 });
  const directory = process.env.FLOWBOARD_BOARD_BACKGROUND_DIR
    ? path.resolve(process.env.FLOWBOARD_BOARD_BACKGROUND_DIR)
    : path.join(process.cwd(), "uploads", "board-backgrounds");
  try {
    const image = await readBoardBackground(fileName.data, path.join(directory, path.basename(fileName.data)));
    return new NextResponse(image, {
      headers: {
        "Content-Type": contentTypes[path.extname(fileName.data)],
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Background image not found" }, { status: 404 });
    }
    throw error;
  }
}
