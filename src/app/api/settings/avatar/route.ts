import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const maxSize = 2 * 1024 * 1024;
const imageExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
  }
  const extension = imageExtensions[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Avatar must be JPEG, PNG, or WebP" }, { status: 400 });
  }
  if (file.size < 1 || file.size > maxSize) {
    return NextResponse.json({ error: "Avatar must be smaller than 2 MB" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const signatureValid =
    (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (file.type === "image/png" &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.type === "image/webp" &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP");
  if (!signatureValid) {
    return NextResponse.json({ error: "The selected file is not a valid image" }, { status: 400 });
  }

  const directory = avatarDirectory();
  await mkdir(directory, { recursive: true });
  const fileName = `${user.id}-${randomUUID()}${extension}`;
  const uploadedPath = path.join(directory, fileName);
  await writeFile(uploadedPath, bytes, { flag: "wx" });
  const image = `/api/avatars/${fileName}`;
  const previousImage = await prisma.user.findUnique({
    where: { id: user.id },
    select: { image: true },
  });
  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { image },
      select: { image: true },
    });
    if (previousImage?.image?.startsWith("/api/avatars/")) {
      const previousFile = path.basename(previousImage.image);
      if (previousFile !== fileName) {
        await unlink(path.join(directory, previousFile)).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          },
        );
      }
    }
    return NextResponse.json({ image: updatedUser.image });
  } catch (error) {
    await unlink(uploadedPath);
    throw error;
  }
}

export async function DELETE() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const profile = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { image: true },
  });
  if (profile?.image?.startsWith("/api/avatars/")) {
    const fileName = path.basename(profile.image);
    const avatarPath = path.join(avatarDirectory(), fileName);
    await unlink(avatarPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  await prisma.user.update({
    where: { id: currentUser.id },
    data: { image: null },
  });
  return NextResponse.json({ success: true });
}

function avatarDirectory() {
  return process.env.FLOWBOARD_AVATAR_DIR
    ? path.resolve(process.env.FLOWBOARD_AVATAR_DIR)
    : path.join(process.cwd(), "uploads", "avatars");
}
