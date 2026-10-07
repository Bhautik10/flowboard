"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateProfile, type ProfileActionState } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { useEffect } from "react";

type ProfileFormProps = {
  user: {
    name: string | null;
    email: string;
    bio: string | null;
    accentColor: string | null;
    theme: string;
  };
};

const initialState: ProfileActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [state, formAction] = useFormState(updateProfile, initialState);

  useEffect(() => {
    if (state.success) toast.success("Profile saved");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>{user.email}</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={user.name ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Input id="bio" name="bio" defaultValue={user.bio ?? ""} maxLength={500} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accentColor">Accent color</Label>
            <Input
              id="accentColor"
              name="accentColor"
              type="color"
              defaultValue={user.accentColor ?? "#6366f1"}
              className="h-10 w-20 cursor-pointer p-1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <select
              id="theme"
              name="theme"
              defaultValue={user.theme}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </CardContent>
        <CardFooter>
          <SubmitButton />
        </CardFooter>
      </form>
    </Card>
  );
}
