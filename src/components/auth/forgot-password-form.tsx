"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const email = String(new FormData(e.currentTarget).get("email"));

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!res.ok) {
      toast.error("Something went wrong");
      return;
    }

    setSent(true);
    toast.success("If that email exists, we sent reset instructions.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>
          {sent
            ? "Check your inbox (or the server console in dev)."
            : "We will email you a reset link"}
        </CardDescription>
      </CardHeader>
      {!sent && (
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>
            <Link
              href="/login"
              className="text-center text-sm text-indigo-600 hover:underline"
            >
              Back to sign in
            </Link>
          </CardFooter>
        </form>
      )}
      {sent && (
        <CardFooter>
          <Link
            href="/login"
            className="w-full text-center text-sm text-indigo-600 hover:underline"
          >
            Return to sign in
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
