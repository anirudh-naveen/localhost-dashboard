const cache = new Map<string, string | null>();

/** Fetch `<title>` from `GET /`, cached per pid:port. */
export async function fetchTitle(pid: number, port: number, address: string): Promise<string | undefined> {
  const key = `${pid}:${port}`;
  if (cache.has(key)) return cache.get(key) ?? undefined;
  const host = address.startsWith("[") ? "[::1]" : "127.0.0.1";
  let title: string | null = null;
  try {
    const res = await fetch(`http://${host}:${port}/`, {
      signal: AbortSignal.timeout(800),
      headers: { accept: "text/html" },
    });
    if ((res.headers.get("content-type") ?? "").includes("html")) {
      const html = (await res.text()).slice(0, 64 * 1024);
      const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
      title = m?.[1].trim() || null;
    } else {
      await res.body?.cancel();
    }
  } catch {
    // Not HTTP, or too slow; fine.
  }
  cache.set(key, title);
  return title ?? undefined;
}

export function pruneTitleCache(live: Set<string>): void {
  for (const key of cache.keys()) if (!live.has(key)) cache.delete(key);
}
