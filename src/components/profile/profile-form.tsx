"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateProfile, type ProfileActionState } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useEffect, useState } from "react";

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
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    if (state.success) toast.success("Profile saved");
    if (state.error) toast.error(state.error);
  }, [state]);

  useEffect(() => { fetch("/api/settings/email").then((response) => response.json()).then((result) => { const email = result.pending?.email ?? null; setPendingEmail(email); if (email) setNewEmail(email); }).catch(() => undefined); }, []);
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("email");
    if (!status) return;
    if (status === "verified") toast.success("Your email address has been verified and updated.");
    else if (status === "expired") toast.error("That email verification link has expired. Request a new one.");
    else if (status === "taken") toast.error("That email address is already in use.");
    else toast.error("That email verification link is invalid.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function changeEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setEmailPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/settings/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("newEmail"), currentPassword: form.get("currentPassword") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : Object.values(result.error ?? {}).flat()[0] as string ?? "Could not request email change");
      setPendingEmail(result.pending.email); setNewEmail(result.pending.email);
      toast.success("Verification link sent. Your email will change after you confirm it.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not request email change"); }
    finally { setEmailPending(false); }
  }

  async function cancelEmailChange() {
    setEmailPending(true);
    try {
      const response = await fetch("/api/settings/email", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not cancel the email change");
      setPendingEmail(null); setNewEmail(""); toast.success("Pending email change cancelled");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not cancel the email change"); }
    finally { setEmailPending(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Current email: {user.email}</CardDescription>
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
            <Select name="theme" defaultValue={user.theme}><SelectTrigger id="theme" aria-label="Theme"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent></Select>
          </div>
        </CardContent>
        <CardFooter>
          <SubmitButton />
        </CardFooter>
      </form>
      <form onSubmit={changeEmail} className="space-y-4 border-t px-6 py-5">
        <div><h3 className="font-medium">Change email</h3><p className="text-sm text-muted-foreground">We’ll keep your current address until you verify the new one.</p></div>
        {pendingEmail && <p role="status" className="rounded-md bg-muted p-3 text-sm">Pending verification: <strong>{pendingEmail}</strong></p>}
        <div className="space-y-2"><Label htmlFor="newEmail">New email</Label><Input id="newEmail" name="newEmail" type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required maxLength={254} /></div>
        <div className="space-y-2"><Label htmlFor="currentPassword">Current password</Label><Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></div>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={emailPending}>{emailPending ? "Sending verification…" : pendingEmail ? "Resend verification link" : "Send verification link"}</Button>{pendingEmail && <Button type="button" variant="outline" disabled={emailPending} onClick={() => void cancelEmailChange()}>Cancel</Button>}</div>
      </form>
    </Card>
  );
}
