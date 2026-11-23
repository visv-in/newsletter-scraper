import type { Browser } from "happy-dom";
import type { SourceName, Storage } from "../../database.ts";
import type { InfoExtractor } from "../interface.ts";
import {
  isIssueDateEligible,
  SCRAPE_START_DATE,
} from "../../utils.ts";
import { extractContent, extractContentDate } from "./helper.ts";

class CommonExtractor implements InfoExtractor {
  browser: Browser;
  db: Storage;
  baseURL: string;
  source: SourceName;
  constructor(
    source: SourceName,
    baseURL: string,
    browser: Browser,
    db: Storage,
  ) {
    this.browser = browser;
    this.db = db;
    this.baseURL = baseURL;
    this.source = source;
  }

  canHandle(url: string) {
    return url.startsWith(this.baseURL);
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
      const content = await extractContent(page, this.baseURL);
      if (!Array.isArray(content) || content.length === 0) {
        throw new Error(`No links extracted from issue: ${url}`);
      }
      this.db.updateUrl(url, content);
    } finally {
      await page.close();
    }
  }

  async update() {
    const page = this.browser.newPage();

    await page.goto(`${this.baseURL}/issues`);

    const issues = [
      ...page.mainFrame.document.querySelectorAll("div.issue-card"),
    ].flatMap((issue) => {
      const url = issue.querySelector("a")?.href;
      return url ? [{ url, dateText: issue.textContent ?? "" }] : [];
    });
    const issueByUrl = new Map(
      issues.map(({ url, dateText }) => [url, dateText]),
    );

    for (const url of this.db.getNewIssueUrls(
      this.source,
      issues.map(({ url }) => url),
    )) {
      const dateText = issueByUrl.get(url);
      if (!dateText) throw new Error(`failed to find issue listing for ${url}`);

      try {
        const date = extractContentDate(dateText);
        if (!isIssueDateEligible(date)) {
          this.db.markIssueNumberSeen(this.source, url);
          continue;
        }

        await page.goto(url);
        console.log(`parsing: ${url}`);

        const content = await extractContent(page, this.baseURL);
        if (!Array.isArray(content) || content.length === 0) {
          throw new Error(`No links extracted from issue: ${url}`);
        }
        this.db.saveContent(this.source, {
          url,
          date,
          content,
        });
      } catch (err) {
        console.error(err);
        throw err;
      }
    }

    await page.close();
  }
}

export const JavascriptWeekly = (browser: Browser, db: Storage) =>
  new CommonExtractor(
    "javascriptweekly",
    "https://javascriptweekly.com",
    browser,
    db,
  );

export const NodeWeekly = (browser: Browser, db: Storage) =>
  new CommonExtractor("nodeweekly", "https://nodeweekly.com", browser, db);

export const PostgresWeekly = (browser: Browser, db: Storage) =>
  new CommonExtractor(
    "postgresweekly",
    "https://postgresweekly.com",
    browser,
    db,
  );
