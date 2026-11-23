import { formatISO, isValid, parse } from "date-fns";
import { enUS } from "date-fns/locale";
import type {
  Browser,
  BrowserPage,
  Element,
  HTMLAnchorElement,
} from "happy-dom";

import type { Storage } from "../database.ts";
import {
  defined,
  isIssueDateEligible,
  resolveUrl,
  SCRAPE_START_DATE,
} from "../utils.ts";
import type { InfoContent } from "./common/helper.ts";
import type { InfoExtractor } from "./interface.ts";

export class PyCoders implements InfoExtractor {
  db: Storage;
  browser: Browser;
  static baseUrl = "https://pycoders.com";

  constructor(browser: Browser, db: Storage) {
    this.browser = browser;
    this.db = db;
  }

  static canHandle(url: string) {
    return url.startsWith(PyCoders.baseUrl);
  }

  async updateUrl(url: string) {
    if (!this.db.isSaved(url)) {
      throw new Error(`URL does not exist on database: ${url}`);
    }

    if (!isIssueDateEligible(this.db.getIssue(url).date)) {
      console.log(`skipping issue before ${SCRAPE_START_DATE}: ${url}`);
      return;
    }

    const page = this.browser.newPage();
    try {
      await page.goto(url);

      console.log(`parsing: ${url}`);
      const content = await extractContent(page);
      if (content.length === 0) {
        throw new Error(`No links extracted from issue: ${url}`);
      }
      this.db.updateUrl(url, content);
    } finally {
      await page.close();
    }
  }

  async update() {
    const page = this.browser.newPage();

    try {
      await page.goto(`${PyCoders.baseUrl}/issues`);

      const issues = [
        ...page.mainFrame.document.querySelectorAll('a[href^="/issues/"]'),
      ]
        .flatMap((issue) => {
          const href = issue.getAttribute("href");
          if (!href) return [];

          const url = new URL(href, `${PyCoders.baseUrl}/`).href;
          if (!/^\/issues\/\d+\/?$/.test(new URL(url).pathname)) return [];

          return [{ url, dateText: issue.textContent ?? "" }];
        });

      const issueByUrl = new Map(issues.map((issue) => [issue.url, issue]));
      for (const url of this.db.getNewIssueUrls(
        "pycoders",
        issues.map(({ url }) => url),
      )) {
        const issue = issueByUrl.get(url);
        if (!issue) throw new Error(`failed to find issue listing for ${url}`);

        try {
          const date = extractDate(issue.dateText);
          if (!isIssueDateEligible(date)) {
            this.db.markIssueNumberSeen("pycoders", url);
            continue;
          }

          await page.goto(url);
          console.log(`parsing: ${url}`);

          const content = await extractContent(page);
          if (content.length === 0) {
            throw new Error(`No links extracted from issue: ${url}`);
          }
          this.db.saveContent("pycoders", {
            url,
            date,
            content,
          });
        } catch (err) {
          console.error(err);
          throw err;
        }
      }

      const oldestIssueNumber = this.db.getOldestIssueNumber("pycoders");
      for (
        let issueNumber = (oldestIssueNumber ?? 1) - 1;
        issueNumber > 0;
        issueNumber--
      ) {
        const url = `${PyCoders.baseUrl}/issues/${issueNumber}`;
        await page.goto(url);
        const issueTitle = page.mainFrame.document.title;
        if (!issueTitle.includes(`Issue #${issueNumber}`)) {
          throw new Error(`Could not verify PyCoders issue page: ${url}`);
        }

        const date = extractDate(
          page.mainFrame.document.body.textContent ?? "",
        );
        if (!isIssueDateEligible(date)) break;

        console.log(`backfilling: ${url}`);
        const content = await extractContent(page);
        if (content.length === 0) {
          throw new Error(`No links extracted from issue: ${url}`);
        }
        this.db.saveContent("pycoders", { url, date, content });
      }
    } finally {
      await page.close();
    }
  }
}

async function extractContent(page: BrowserPage) {
  const parts = page.mainFrame.document.querySelectorAll(
    "table tbody tr td > span,br",
  );

  const promisesInfo = [] as Promise<InfoContent[]>[];
  let breakCount = 0;
  let currentInfo = [];

  for (const part of parts) {
    if (part.tagName.toLowerCase() === "span") {
      currentInfo.push(part);
      breakCount = Math.max(0, breakCount - 1);
    }
    if (part.tagName.toLowerCase() === "br") breakCount += 1;
    if (breakCount > 1) {
      const contentPromise = parseInfo(currentInfo);
      promisesInfo.push(contentPromise);
      currentInfo = [];
      breakCount = 0;
    }
  }

  const infoList = (await Promise.all(promisesInfo)).flat();
  console.log(`extracted ${infoList.length} items`);

  return infoList;
}

const sponsorRegex = /sponsor/i;
const locationRegex = /📍/i;
async function parseInfo(nodeList: Element[]): Promise<InfoContent[]> {
  if (nodeList.length < 2) return [];
  let nodes = nodeList;

  const lastItemContent = nodes.at(-1)?.textContent ?? "";
  const isSponsored = sponsorRegex.test(lastItemContent);

  // try to remove "Jobs link" if has location 📍
  if (locationRegex.test(lastItemContent)) {
    return [];
  }

  if (nodes.length > 1) {
    nodes = nodes.slice(0, -1);
  }

  const description = nodes
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join(" - ");
  if (!description) return [];

  const links = [
    ...new Set(
      nodes.flatMap((node) =>
        [...node.querySelectorAll("a[href]")].flatMap((anchor) => {
          const href = anchor.getAttribute("href")?.trim();
          if (!href || href.startsWith("#")) return [];

          try {
            const url = new URL((anchor as HTMLAnchorElement).href);
            return ["http:", "https:"].includes(url.protocol) && !url.hash
              ? [url.href]
              : [];
          } catch {
            return [];
          }
        }),
      ),
    ),
  ];

  const resolvedLinks = await Promise.all(
    links.map(async (link) => {
      if (new URL(link).origin !== new URL(PyCoders.baseUrl).origin) {
        return link;
      }
      return resolveUrl(link);
    }),
  );

  return resolvedLinks.flatMap((link) =>
    defined(link) && new URL(link).origin !== new URL(PyCoders.baseUrl).origin
      ? [{ description, link, isSponsored }]
      : [],
  );
}

const dateStringRegex =
  /\b(?<date>\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/i;
function extractDate(str: string) {
  const groups = dateStringRegex.exec(str?.trim())?.groups;
  if (!groups?.date) throw new Error(`failed to extract date: "${str}"`);

  const monthNames: Record<string, string> = {
    jan: "January",
    feb: "February",
    mar: "March",
    apr: "April",
    jun: "June",
    jul: "July",
    aug: "August",
    sep: "September",
    sept: "September",
    oct: "October",
    nov: "November",
    dec: "December",
  };
  const dateStr = groups.date
    .replace(/^([A-Za-z]+)\.?/, (month) => {
      const normalized = month.toLowerCase().replace(/\.$/, "");
      return monthNames[normalized] ?? month;
    })
    .replace(/(st|nd|rd|th)\b/i, "")
    .replace(",", "");

  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(`${dateStr}T00:00:00Z`)
    : parse(dateStr, "MMMM d yyyy", new Date(), { locale: enUS });

  if (!isValid(date)) throw new Error("failed to parse date");
  const dateFmt = formatISO(date, { representation: "date" });

  return dateFmt;
}
