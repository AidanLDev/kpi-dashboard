"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth";

export function Topbar() {
  const router = useRouter();

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <Link
        href="/"
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
      >
        KPI Dashboard
      </Link>
      <button
        onClick={() => { signOut(); router.push("/login"); }}
        className="text-sm text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
      >
        Sign out
      </button>
    </header>
  );
}
