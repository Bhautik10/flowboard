"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { profileUpdateSchema } from "@/lib/validations/auth";

export type ProfileActionState = {
  success?: boolean;
  error?: string;
};

export async function updateProfile(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return { error: "Unauthorized" };
  }

  const raw = {
    name: formData.get("name"),
    bio: formData.get("bio") || undefined,
    accentColor: formData.get("accentColor") || undefined,
    theme: formData.get("theme") || undefined,
  };

  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      bio: parsed.data.bio ?? null,
      accentColor: parsed.data.accentColor,
      theme: parsed.data.theme,
    },
  });

  revalidatePath("/profile");
  revalidatePath("/");

  return { success: true };
}
