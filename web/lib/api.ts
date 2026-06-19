"use client";

import { getSession } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiFetch<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const token = await getSession();
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} at ${path}: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}
