import { request } from "undici";

export const SCRAPE_START_DATE = "2026-01-01";

export function isIssueDateEligible(date: string) {
  return date >= SCRAPE_START_DATE;
}

export function getIssueNumber(url: string) {
  try {
    const match = new URL(url).pathname.match(/\/issues\/(\d+)\/?$/);
    if (!match) return null;

    const issueNumber = Number(match[1]);
    return Number.isSafeInteger(issueNumber) ? issueNumber : null;
  } catch {
    return null;
  }
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

    const location = Array.isArray(headers.location)
      ? headers.location[0]
      : headers.location;
    if (statusCode < 404 && location && location !== url) {
      return new URL(location, url).href;
    }

    return null;
  } catch {
    return null;
  }
}
