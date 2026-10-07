import { getCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { WorkspaceSidebar } from "@/components/workspaces/workspace-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader user={user} />
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        <WorkspaceSidebar />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
