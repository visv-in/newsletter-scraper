import { request } from "undici";

export const SCRAPE_START_DATE = "2026-01-01";

export function isIssueDateEligible(date: string) {
  return date >= SCRAPE_START_DATE;
}

export function normalizeUrl(url: string) {
  try {
    const normalized = new URL(url);
    normalized.hash = "";

    for (const key of [...normalized.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())
      ) {
        normalized.searchParams.delete(key);
      }
    }

    normalized.searchParams.sort();
    if (normalized.pathname !== "/") {
      normalized.pathname = normalized.pathname.replace(/\/+$/, "");
    }

    return normalized.toString();
  } catch {
    return url.trim();
  }
}

export function deduplicateLinks(
  content: unknown[],
  seen = new Set<string>(),
  preferredLinks?: Set<string>,
) {
  return content.filter((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("link" in item) ||
      typeof item.link !== "string" ||
      item.link.trim() === ""
    ) {
      return true;
    }

    const key = normalizeUrl(item.link);
    if (
      preferredLinks?.has(key) &&
      !isExportableLink(item)
    ) {
      return false;
    }
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

export function isExportableLink(
  item: unknown,
): item is { link: string; description: unknown; isSponsored?: unknown } {
  return (
    typeof item === "object" &&
    item !== null &&
    "link" in item &&
    typeof item.link === "string" &&
    item.link.trim() !== "" &&
    "description" in item &&
    Boolean(item.description) &&
    !("isSponsored" in item && item.isSponsored)
  );
}

export function defined<T>(item: T): item is Exclude<T, null | undefined> {
  return item !== undefined && item !== null;
}

export async function resolveUrl(url: string) {
  try {
    const { headers, statusCode } = await request(url, {
      method: "HEAD",
      headersTimeout: 8_000,
    });

    if (statusCode < 404 && headers.location && headers.location !== url) {
      return headers.location as string;
    }

    return null;
  } catch {
    return null;
  }
}
