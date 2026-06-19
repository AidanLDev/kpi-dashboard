"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSession, getGroups, signOut } from "@/lib/auth";
import { FullPageSpinner } from "@/components/spinner";

type State = "loading" | "allowed" | "denied";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (pathname === "/login") {
      getSession()
        .then(() => router.push("/"))
        .catch(() => setState("allowed"));
      return;
    }
    getSession()
      .then(() => getGroups())
      .then((groups) => {
        if (groups.includes("kpiDashboard")) {
          setState("allowed");
        } else {
          setState("denied");
        }
      })
      .catch(() => router.push("/login"));
  }, [pathname, router]);

  if (state === "loading") return <FullPageSpinner />;

  if (state === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center mx-auto mb-5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 4v4m0 4h.01"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-red-600 dark:text-red-400"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
            Access denied
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Your account does not have permission to access this dashboard.
            Please contact support if you require access.
          </p>
          <a
            href="https://support.processvision.com/portal/en/home"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            Contact support
          </a>
          <button
            onClick={() => { signOut(); router.push("/login"); }}
            className="block mx-auto mt-4 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
