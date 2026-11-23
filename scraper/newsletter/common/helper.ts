import { formatISO, isValid, parse } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import type { BrowserPage, Element, HTMLAnchorElement } from "happy-dom";
import { defined, resolveUrl } from "../../utils.ts";

const dateReg =
  /\b(?<month>January|February|March|April|May|June|July|August|September|October|November|December)\s+(?<day>\d{1,2})(st|th)?,\s+(?<year>\d{4})\b/gi;

// parse string like ex: "July 20, 2024" and transform into ISO 8601 date yyyy-MM-dd
export function extractContentDate(content?: string) {
  if (!content) throw new Error("failed to extract date: invalid string");

  dateReg.lastIndex = 0;

  const str = content
    ?.replace("Decemeber", "December")
    .replace("Febraury", "February");

  const isoDate = /\b\d{4}-\d{2}-\d{2}\b/.exec(str)?.[0];
  if (isoDate) return isoDate;

  const groups = dateReg.exec(str?.trim())?.groups;
  if (!groups) throw new Error(`failed to extract date: "${content}"`);

  const dateStr = `${groups.year}-${groups.month}-${groups.day}`;
  const date = parse(dateStr, "yyyy-MMMM-d", new Date(), { locale: enUS });

  if (!isValid(date)) throw new Error("failed to parse date");
  const dateFmt = formatISO(date, { representation: "date" });

  return dateFmt;
}

export interface InfoContent {
  author?: string;
  isSponsored?: boolean;
  description: string;
  link: string;
}

export async function extractContent(page: BrowserPage, baseURL: string) {
  const content = page.mainFrame.document.querySelectorAll(
    "table.el-item.item, table.miniitem.item, table.content.el-md",
  );

  let infoList: InfoContent[] = [];
  for (const info of content) {
    if (info.closest("table.classifieds")) continue;

    const content = parseContent(info);

    if (!defined(content)) continue;

    infoList = infoList.concat(Array.isArray(content) ? content : [content]);
  }

  if (infoList.length === 0) return null;

  const promises = infoList.map(async (info) => {
    let link = info.link;
    const baseOrigin = new URL(baseURL).origin;
    if (new URL(link).origin === baseOrigin) {
      const resolvedLink = await resolveUrl(link);
      if (!defined(resolvedLink)) return null;
      link = new URL(resolvedLink, link).href;
    }

    const parsedLink = new URL(link);
    if (
      !["http:", "https:"].includes(parsedLink.protocol) ||
      parsedLink.origin === baseOrigin
    ) {
      return null;
    }

    return { ...info, link: parsedLink.href };
  });

  infoList = (await Promise.all(promises)).filter(defined);

  console.log(`found ${content.length} items, extracted ${infoList.length}`);

  return infoList;
}

function parseContent(data: Element): InfoContent | InfoContent[] | null {
  const className = data?.className.trim();

  if (
    className.startsWith("el-item item") ||
    className.startsWith("miniitem item")
  ) {
    return parseStandardInfo(data);
  }

  if (className.startsWith("content el-md")) {
    return parseSmallInfo(data);
  }

  return null;
}

function parseStandardInfo(data: Element): InfoContent[] | null {
  const content = data.querySelector("p.desc");
  const description = content?.textContent.trim();
  const author = data.querySelector("p.name")?.textContent.trim();
  const isSponsored = /sponsor|presented by/i.test(author ?? "");
  if (!content || !description) return null;

  const contentList = [...content.querySelectorAll("a[href]")].flatMap(
    (anchor) => {
      const link = getAnchorUrl(anchor as HTMLAnchorElement);
      return link
        ? [{ author, isSponsored, description, link }]
        : [];
    },
  );

  return contentList.length > 0 ? contentList : null;
}

function parseSmallInfo(data: Element): InfoContent[] | null {
  const items = data.querySelectorAll("td > ul > li, td > p");
  const contentList = [];

  for (const item of items) {
    const description = item?.textContent.trim();
    const isSponsored = /sponsor|presented by/i.test(description);

    for (const anchor of item.querySelectorAll("a[href]")) {
      const link = getAnchorUrl(anchor as HTMLAnchorElement);
      if (!link || !description) continue;

      contentList.push({ link, description, isSponsored });
    }
  }

  if (contentList.length > 0) return contentList;

  return null;
}

function getAnchorUrl(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href")?.trim();
  if (!href || href.startsWith("#")) return null;

  try {
    const url = new URL(anchor.href);
    return ["http:", "https:"].includes(url.protocol) && !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}
