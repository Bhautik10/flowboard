"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardQuickActions({ canCreateBoard }: { canCreateBoard: boolean }) {
  return <div className="mt-6 flex flex-wrap gap-3">
    {canCreateBoard && <Button type="button" className="bg-white text-indigo-700 hover:bg-white/90" onClick={() => window.dispatchEvent(new CustomEvent("flowboard:create-board"))}><Plus className="mr-2 h-4 w-4" />Create board</Button>}
    <Button type="button" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={() => window.dispatchEvent(new CustomEvent("flowboard:create-workspace"))}><Plus className="mr-2 h-4 w-4" />Create workspace</Button>
  </div>;
}
