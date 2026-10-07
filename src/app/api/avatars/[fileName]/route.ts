import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: { fileName: string } },
) {
  if (!/^[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(params.fileName)) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }
  const filePath = path.join(
    process.env.FLOWBOARD_AVATAR_DIR
      ? path.resolve(process.env.FLOWBOARD_AVATAR_DIR)
      : path.join(process.cwd(), "uploads", "avatars"),
    path.basename(params.fileName),
  );
  try {
    const image = await readFile(filePath);
    const extension = path.extname(params.fileName);
    return new NextResponse(image, {
      headers: {
        "Content-Type": contentTypes[extension],
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }
    throw error;
  }
}
