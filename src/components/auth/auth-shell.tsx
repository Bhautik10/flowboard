import Link from "next/link";
import { Check, LayoutGrid, Sparkles } from "lucide-react";

export function AuthShell({
  title,
  description,
  children,
  variant = "default",
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  variant?: "default" | "login";
}) {
  if (variant === "login") {
    return (
      <main className="relative isolate min-h-[100svh] bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white lg:min-h-screen">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-500/20" />
          <div className="absolute -bottom-56 right-[18%] h-[38rem] w-[38rem] rounded-full bg-cyan-300/25 blur-3xl dark:bg-cyan-500/10" />
          <div className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] [background-size:44px_44px] dark:opacity-[0.08]" />
        </div>
        <div className="mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative flex flex-col px-5 pb-2 pt-5 sm:px-10 sm:pt-7 lg:justify-between lg:px-14 lg:py-10 xl:px-20">
            <Link href="/" className="relative z-10 inline-flex w-fit items-center gap-2.5 rounded-xl text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"><LayoutGrid className="h-5 w-5" /></span>
              FlowBoard
            </Link>
            <div className="relative z-10 mx-auto hidden w-full max-w-xl py-4 lg:block xl:py-6">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/60 px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm backdrop-blur dark:border-indigo-300/15 dark:bg-white/5 dark:text-indigo-200"><Sparkles className="h-3.5 w-3.5" />A calmer way to move work forward</div>
              <h1 className="max-w-lg text-5xl font-semibold leading-[1.08] tracking-tight xl:text-6xl">Make space for your team’s <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 bg-clip-text text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-cyan-300">best work.</span></h1>
              <p className="mt-5 max-w-md text-base leading-7 text-slate-600 dark:text-slate-300">{description} Keep projects clear, feedback together, and your next step in view.</p>
              <div aria-hidden="true" className="relative mt-7 rotate-[-2deg] rounded-2xl border border-white/80 bg-white/70 p-3 shadow-2xl shadow-indigo-950/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/75 dark:shadow-black/30">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-white/10"><div><div className="text-xs font-medium text-slate-500 dark:text-slate-400">YOUR WORKSPACE</div><div className="mt-1 font-semibold">Studio projects</div></div><div className="flex -space-x-2"><span className="h-7 w-7 rounded-full border-2 border-white bg-gradient-to-br from-amber-300 to-orange-500 dark:border-slate-900"/><span className="h-7 w-7 rounded-full border-2 border-white bg-gradient-to-br from-cyan-300 to-blue-600 dark:border-slate-900"/><span className="h-7 w-7 rounded-full border-2 border-white bg-gradient-to-br from-fuchsia-300 to-violet-600 dark:border-slate-900"/></div></div>
                <div className="grid grid-cols-3 gap-3 pt-3">{[{ title: "Ideas", count: "04", color: "bg-violet-400" }, { title: "In progress", count: "08", color: "bg-cyan-400" }, { title: "Ready to share", count: "03", color: "bg-emerald-400" }].map((column) => <div key={column.title} className="min-h-24 rounded-xl bg-slate-100/80 p-2.5 dark:bg-white/[0.06]"><div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span className={`h-1.5 w-1.5 rounded-full ${column.color}`} />{column.title}<span className="ml-auto text-slate-400">{column.count}</span></div><div className="space-y-2"><div className="h-10 rounded-lg border border-slate-200/80 bg-white p-2 dark:border-white/10 dark:bg-slate-800"><div className="h-1.5 w-3/4 rounded-full bg-slate-200 dark:bg-slate-600"/><div className="mt-2 h-1.5 w-1/2 rounded-full bg-slate-100 dark:bg-slate-700"/></div><div className="h-7 rounded-lg border border-slate-200/80 bg-white/80 p-2 dark:border-white/10 dark:bg-slate-800/70"><div className="h-1.5 w-2/3 rounded-full bg-slate-200 dark:bg-slate-600"/></div></div></div>)}</div>
                <div className="absolute -right-6 -top-6 flex items-center gap-2 rounded-xl border border-white bg-white px-3 py-2 text-xs font-medium shadow-lg dark:border-white/10 dark:bg-slate-800"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /></span>Feedback approved</div>
              </div>
            </div>
            <p className="relative z-10 hidden text-xs text-slate-500 dark:text-slate-500 lg:block">© {new Date().getFullYear()} FlowBoard · Work, in sync.</p>
          </section>
          <section className="relative flex items-start justify-center px-4 pb-7 pt-4 sm:px-8 lg:items-center lg:px-10 lg:py-12">
            <div aria-hidden="true" className="absolute inset-y-0 left-0 hidden w-px bg-gradient-to-b from-transparent via-slate-300/70 to-transparent dark:via-white/10 lg:block" />
            <div className="w-full max-w-md"><div className="mb-6 text-center lg:text-left"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">Welcome back</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Pick up right where your team left off.</p></div>{children}<p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500">By continuing, you agree to keep your team’s work secure.</p></div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 px-4 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white"><LayoutGrid className="h-5 w-5" /></span>FlowBoard</Link>
      <div className="w-full max-w-md space-y-2 text-center"><h1 className="text-2xl font-bold tracking-tight">{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div>
      <div className="mt-8 w-full max-w-md">{children}</div>
    </div>
  );
}
