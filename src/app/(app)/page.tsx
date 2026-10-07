import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white shadow">
        <p className="text-sm font-medium text-white/75">Your project hub</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-3 max-w-xl text-white/85">
          Organize work into boards, lists, and cards. Choose a board from your
          workspace sidebar, or create a new workspace to get started.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your FlowBoard</CardTitle>
          <CardDescription>Workspaces and boards are available in the sidebar.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-muted-foreground">
            Create boards, invite teammates, and organize tasks into lists and cards.
          </p>
          <Button asChild variant="outline">
            <Link href="/profile">Manage profile</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
