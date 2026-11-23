import { formatISO, isValid, parse } from "date-fns";
import { enUS } from "date-fns/locale";
import type { Browser, BrowserPage, Element } from "happy-dom";
import type { SourceName, Storage } from "../database.ts";
import {
  isIssueDateEligible,
  SCRAPE_START_DATE,
} from "../utils.ts";
import type { InfoContent } from "./common/helper.ts";
import type { InfoExtractor } from "./interface.ts";

interface NewsletterConfig {
  source: Extract<SourceName, "tldrai">;
  baseUrl: string;
  archiveUrl: string;
  issuePath: RegExp;
}

export const AI_NEWSLETTERS: NewsletterConfig[] = [
  {
    source: "tldrai",
    baseUrl: "https://tldr.tech",
    archiveUrl: "https://tldr.tech/ai/archives",
    issuePath: /^\/ai\/20\d{2}-\d{2}-\d{2}$/,
  },
];

export class AINewsletterExtractor implements InfoExtractor {
  browser: Browser;
  db: Storage;
  config: NewsletterConfig;

  constructor(config: NewsletterConfig, browser: Browser, db: Storage) {
    this.config = config;
    this.browser = browser;
    this.db = db;
  }

  canHandle(url: string) {
    return this.isIssueUrl(url);
  }

  async updateUrl(url: string): Promise<void> {
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
      const content = extractIssueContent(page, this.config.baseUrl);
      if (content.length === 0) {
        throw new Error(`No links extracted from issue: ${url}`);
      }
      this.db.updateUrl(url, content);
    } finally {
      await page.close();
    }
  }

  async update(): Promise<void> {
    const page = this.browser.newPage();
    try {
      await page.goto(this.config.archiveUrl);

      const issueUrls = new Set<string>();
      for (const anchor of page.mainFrame.document.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href");
        if (!href) continue;
        const url = new URL(href, this.config.archiveUrl).href;
        if (this.isIssueUrl(url)) issueUrls.add(url);
      }

      if (issueUrls.size === 0) {
        throw new Error(
          `No newsletter issues found at ${this.config.archiveUrl}`,
        );
      }

      for (const url of issueUrls) {
        if (this.db.isSaved(url)) continue;
        try {
          await page.goto(url);
          const date = extractIssueDate(page);
          if (!isIssueDateEligible(date)) continue;

          console.log(`parsing: ${url}`);
          const content = extractIssueContent(page, this.config.baseUrl);
          if (content.length === 0) {
            throw new Error(`No links extracted from issue: ${url}`);
          }
          this.db.saveContent(this.config.source, { url, date, content });
        } catch (error) {
          console.error(error);
          throw error;
        }
      }

      const latestDate = [...issueUrls]
        .map((url) => new URL(url).pathname.split("/").at(-1) ?? "")
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        .sort()
        .at(-1);
      if (!latestDate) {
        throw new Error(`No dated issues found at ${this.config.archiveUrl}`);
      }

      const dateCursor = new Date(`${SCRAPE_START_DATE}T00:00:00.000Z`);

      while (dateCursor.toISOString().slice(0, 10) < latestDate) {
        const date = dateCursor.toISOString().slice(0, 10);
        dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
        if ([0, 6].includes(new Date(`${date}T00:00:00.000Z`).getUTCDay())) {
          continue;
        }

        const url = `${this.config.baseUrl}/ai/${date}`;
        if (this.db.isSaved(url)) continue;

        await page.goto(url);
        const pageUrl = new URL(page.mainFrame.document.location.href);
        if (pageUrl.pathname !== `/ai/${date}`) continue;

        const issueDate = extractIssueDate(page);
        if (issueDate !== date) {
          throw new Error(`Issue date mismatch for ${url}: found ${issueDate}`);
        }

        console.log(`backfilling: ${url}`);
        const content = extractIssueContent(page, this.config.baseUrl);
        if (content.length === 0) {
          throw new Error(`No links extracted from issue: ${url}`);
        }
        this.db.saveContent(this.config.source, {
          url,
          date,
          content,
        });
      }
    } finally {
      await page.close();
    }
  }

  private isIssueUrl(url: string) {
    try {
      const parsedUrl = new URL(url);
      return (
        parsedUrl.origin === new URL(this.config.baseUrl).origin &&
        this.config.issuePath.test(parsedUrl.pathname)
      );
    } catch {
      return false;
    }
  }
}

export function createAINewsletterExtractors(browser: Browser, db: Storage) {
  return AI_NEWSLETTERS.map(
    (config) => new AINewsletterExtractor(config, browser, db),
  );
}

function extractIssueDate(page: BrowserPage) {
  const dateElement = page.mainFrame.document.querySelector(
    'time[datetime], meta[property="article:published_time"]',
  );
  const dateValue =
    dateElement?.getAttribute("datetime") ??
    dateElement?.getAttribute("content") ??
    dateElement?.textContent ??
    page.mainFrame.document.body.textContent ??
    "";

  const dateRegex =
    /\b(?<date>\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b/i;
  const dateString = dateRegex.exec(dateValue)?.groups?.date;
  if (!dateString) throw new Error("failed to extract newsletter issue date");

  const normalizedDateString = dateString
    .replace(/^Sept\b/i, "Sep")
    .replace(/(\d)(st|nd|rd|th)\b/i, "$1")
    .replace(/,/g, "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? new Date(`${dateString}T00:00:00Z`)
    : parse(
        normalizedDateString,
        dateString.match(/^[A-Za-z]{3,4}\b/)
          ? "MMM d yyyy"
          : "MMMM d yyyy",
        new Date(),
        { locale: enUS },
      );
  if (!isValid(date)) throw new Error("failed to parse newsletter issue date");

  return formatISO(date, { representation: "date" });
}

function extractIssueContent(page: BrowserPage, baseUrl: string): InfoContent[] {
  const document = page.mainFrame.document;
  const articles = [...document.querySelectorAll("article")];
  const contentRoots =
    articles.length > 0
      ? articles
      : [document.querySelector("main, [role=main]") ?? document.body];
  const content: InfoContent[] = [];

  for (const contentRoot of contentRoots) {
    for (const anchor of contentRoot.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href");
      if (!href) continue;

      let url: URL;
      try {
        url = new URL(href, baseUrl);
      } catch {
        continue;
      }

      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.origin === new URL(baseUrl).origin
      ) {
        continue;
      }

      const linkDescription =
        anchor.closest("p, li, h2, h3")?.textContent.trim() ??
        anchor.textContent.trim();
      const description =
        linkDescription.length >= 12
          ? linkDescription
          : (anchor.closest("article")?.textContent.trim() ?? linkDescription);
      if (description.length < 12) continue;

      content.push({
        link: url.href,
        description,
        isSponsored: isSponsored(anchor),
      });
    }
  }

  return content;
}

function isSponsored(anchor: Element) {
  const context =
    anchor.closest("article")?.textContent.toLowerCase() ??
    anchor.closest("p, li, h2, h3, h4")?.textContent.toLowerCase() ??
    "";
  return /sponsor|presented by/.test(context);
}
