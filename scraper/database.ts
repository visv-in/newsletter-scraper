import { writeFile } from "node:fs/promises";
import SQLite from "better-sqlite3";
import {
  deduplicateLinks,
  getIssueNumber,
  isExportableLink,
  normalizeUrl,
  SCRAPE_START_DATE,
} from "./utils.ts";

interface CategoryEnum<T = string> {
  id: number;
  name: T;
}

export type SourceName =
  | "javascriptweekly"
  | "nodeweekly"
  | "frontendfocus"
  | "postgresweekly"
  | "pycoders"
  | "tldrai";
type Source = CategoryEnum<SourceName>;

export type StatusName = "success" | "error";
type Status = CategoryEnum<StatusName>;

export interface Content {
  id?: string;
  url: string;
  date: string;
  status_id?: string;
  content?: unknown[] | null;
}

export interface Info {
  id: number;
  url: string;
  source: SourceName;
  date: string;
  data: string;
}

interface ExportIssue {
  url: string;
  source: SourceName;
  date: string;
}

interface ExportSponsor extends ExportIssue {
  issueUrl: string;
  description: string;
}

export class Storage extends SQLite {
  status: Map<StatusName, number>;
  source: Map<SourceName, number>;
  constructor() {
    super("database.db");
    this.pragma("foreign_keys = ON");
    this.pragma("journal_mode = WAL");
    this.pragma("synchronous = NORMAL");
    this.exec(`
      CREATE TABLE IF NOT EXISTS status (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
      INSERT OR IGNORE INTO status (name)
      VALUES ('success'), ('error');

      CREATE TABLE IF NOT EXISTS source (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
      INSERT OR IGNORE INTO source (name)
      VALUES
      ('javascriptweekly'),
      ('nodeweekly'),
      ('frontendfocus'),
      ('postgresweekly'),
      ('pycoders'),
      ('tldrai');

      CREATE TABLE IF NOT EXISTS newsletter (
        id INTEGER PRIMARY KEY,
        "status_id" INTEGER NOT NULL,
        "source_id" INTEGER NOT NULL,
        url TEXT NOT NULL UNIQUE,
        date TEXT NOT NULL,
        content TEXT,
        FOREIGN KEY (status_id) REFERENCES status (id),
        FOREIGN KEY (source_id) REFERENCES source (id)
      );
      `);

    const sourceColumns = this.pragma("table_info(source)") as Array<{
      name: string;
    }>;
    if (!sourceColumns.some(({ name }) => name === "last_issue_number")) {
      this.exec(
        "ALTER TABLE source ADD COLUMN last_issue_number INTEGER NOT NULL DEFAULT 0",
      );
    }

    this.cleanScrapedContent();

    const statusList = this.prepare("SELECT * from status").all() as Status[];
    this.status = new Map<StatusName, number>();
    for (const it of statusList) this.status.set(it.name, it.id);

    const sourceList = this.prepare("SELECT * from source").all() as Source[];
    this.source = new Map<SourceName, number>();
    for (const it of sourceList) this.source.set(it.name, it.id);

    const savedIssues = this.prepare(
      "SELECT source_id, url FROM newsletter",
    ).all() as Array<{ source_id: number; url: string }>;
    const updateLastIssueNumber = this.prepare(`
      UPDATE source
      SET last_issue_number = MAX(last_issue_number, ?)
      WHERE id = ?
    `);
    for (const issue of savedIssues) {
      const issueNumber = getIssueNumber(issue.url);
      if (issueNumber !== null) {
        updateLastIssueNumber.run(issueNumber, issue.source_id);
      }
    }
  }

  getNewIssueUrls(source: SourceName, urls: string[]) {
    const lastIssueNumber = this.getLastIssueNumber(source);
    return urls
      .filter((url) => {
        const issueNumber = getIssueNumber(url);
        return issueNumber === null
          ? !this.isSaved(url)
          : issueNumber > lastIssueNumber;
      })
      .sort((a, b) => {
        const firstNumber = getIssueNumber(a);
        const secondNumber = getIssueNumber(b);
        if (firstNumber === null) return secondNumber === null ? 0 : 1;
        if (secondNumber === null) return -1;
        return firstNumber - secondNumber;
      });
  }

  markIssueNumberSeen(source: SourceName, url: string) {
    const issueNumber = getIssueNumber(url);
    if (issueNumber === null) return;

    this.prepare(`
      UPDATE source
      SET last_issue_number = MAX(last_issue_number, ?)
      WHERE id = ?
    `).run(issueNumber, this.source.get(source));
  }

  isSaved(url?: string) {
    if (!url) return false;

    const result = this.prepare("SELECT id FROM newsletter WHERE url = ?").get(
      normalizeUrl(url),
    );

    return result;
  }

  saveContent(source: SourceName, { date, url, content }: Content) {
    const uniqueContent = Array.isArray(content)
      ? deduplicateLinks(content)
      : content;
    const stmt = this.prepare(`
      INSERT INTO newsletter (status_id, source_id, url, date, content)
      VALUES (@status_id, @source_id, @url, @date, @content)
      ON CONFLICT(url) DO NOTHING
    `);

    const hasContent =
      Array.isArray(uniqueContent) && uniqueContent.length > 0;
    const status_id = hasContent
      ? this.status.get("success")
      : this.status.get("error");

    const result = stmt.run({
      url: normalizeUrl(url),
      date,
      status_id,
      source_id: this.source.get(source),
      content: JSON.stringify(uniqueContent),
    });

    if (result.changes === 0) {
      console.log(`skipped already saved issue: ${normalizeUrl(url)}`);
    } else {
      this.markIssueNumberSeen(source, url);
      this.cleanScrapedContent();
    }
  }

  updateUrl(url: string, content: unknown[] | null) {
    const uniqueContent = Array.isArray(content)
      ? deduplicateLinks(content)
      : content;
    const stmt = this.prepare(`
      UPDATE newsletter
      SET
        content = @content,
        status_id = @status_id
      WHERE url = @url`);

    const hasContent =
      Array.isArray(uniqueContent) && uniqueContent.length > 0;
    const status_id = hasContent
      ? this.status.get("success")
      : this.status.get("error");

    const result = stmt.run({
      url: normalizeUrl(url),
      content: JSON.stringify(uniqueContent),
      status_id,
    });

    if (result.changes > 0) this.cleanScrapedContent();
  }

  getIssue(url: string) {
    const stmt = this.prepare(
      `SELECT
        n.id,
        n.url AS url,
        n.date AS date,
        n.content AS data,
        source.name AS source
      FROM newsletter n
      LEFT JOIN status ON status.id = n.status_id
      LEFT JOIN source ON source.id = n.source_id
      WHERE n.url = ?
      `,
    );

    return stmt.get(normalizeUrl(url)) as Info;
  }

  getIssueUrlsSinceStart() {
    return this.prepare(`
      SELECT source.name AS source, newsletter.url
      FROM newsletter
      JOIN source ON source.id = newsletter.source_id
      WHERE newsletter.date >= ?
      ORDER BY newsletter.date, newsletter.id
    `).all(SCRAPE_START_DATE) as Array<{
      source: SourceName;
      url: string;
    }>;
  }

  getOldestIssueNumber(source: SourceName) {
    const row = this.prepare(`
      SELECT newsletter.url
      FROM newsletter
      JOIN source ON source.id = newsletter.source_id
      WHERE source.name = ? AND newsletter.date >= ?
      ORDER BY newsletter.date, newsletter.id
      LIMIT 1
    `).get(source, SCRAPE_START_DATE) as { url: string } | undefined;

    return row ? getIssueNumber(row.url) : null;
  }

  summary() {
    const stmt = this.prepare(
      `SELECT
        source.name AS source,
        SUM(CASE WHEN status.name = 'success' THEN 1 ELSE 0 END) AS success,
        SUM(CASE WHEN status.name = 'error' THEN 1 ELSE 0 END) AS error,
        COUNT (status.name) AS Total
      FROM newsletter n
      LEFT JOIN source ON source.id = n.source_id
      LEFT JOIN status ON status.id = n.status_id
      GROUP BY source
      `,
    );

    console.table(stmt.all());
  }

  async export() {
    const data = this.prepare(
      `SELECT
        n.id,
        n.url AS url,
        n.date AS date,
        n.content AS data,
        source.name AS source
      FROM newsletter n
      LEFT JOIN status ON status.id = n.status_id
      LEFT JOIN source ON source.id = n.source_id
      WHERE status.name = 'success'
        AND n.date >= ?
      ORDER BY n.date DESC
        `,
    ).all(SCRAPE_START_DATE) as Info[];

    const issues = this.prepare(
      `SELECT
        n.url AS url,
        source.name AS source,
        n.date AS date
      FROM newsletter n
      LEFT JOIN status ON status.id = n.status_id
      LEFT JOIN source ON source.id = n.source_id
      WHERE status.name = 'success'
        AND n.date >= ?
      ORDER BY n.date DESC, source.name ASC, n.id DESC
        `,
    ).all(SCRAPE_START_DATE) as ExportIssue[];

    let uniqueCounter = 0;
    let repeatedCounter = 0;
    const finalData = [];
    const finalSponsors: ExportSponsor[] = [];
    const urls = new Set<string>();
    const sponsorUrls = new Set<string>();

    for (const row of data) {
      const issues = JSON.parse(row.data);

      for (const issue of issues) {
        if (
          !issue.link ||
          typeof issue.description !== "string" ||
          !issue.description
        ) {
          continue;
        }

        const normalizedLink = normalizeUrl(issue.link);
        if (issue.isSponsored) {
          if (sponsorUrls.has(normalizedLink)) continue;
          sponsorUrls.add(normalizedLink);
          finalSponsors.push({
            url: issue.link,
            issueUrl: row.url,
            description: issue.description,
            source: row.source,
            date: row.date,
          });
          continue;
        }

        if (urls.has(normalizedLink)) {
          repeatedCounter++;
          continue;
        }

        urls.add(normalizedLink);

        finalData.push({
          id: uniqueCounter++,
          url: issue.link,
          issueUrl: row.url,
          description: issue.description,
          source: row.source,
          date: row.date,
        });
      }
    }

    await writeFile("../app/public/data.json", JSON.stringify(finalData));
    await writeFile("../app/public/issues.json", JSON.stringify(issues));
    await writeFile(
      "../app/public/sponsors.json",
      JSON.stringify(finalSponsors),
    );

    console.log(`exported ${finalData.length} items`);
    console.log(`exported ${issues.length} newsletter issues`);
    console.log(`exported ${finalSponsors.length} sponsor links`);
    console.log(`skipped ${repeatedCounter} items`);
  }

  private cleanScrapedContent() {
    const cleanup = this.transaction(() => {
      const removedIssues = this.prepare(
        "DELETE FROM newsletter WHERE date < ?",
      ).run(SCRAPE_START_DATE).changes;

      const rows = this.prepare(
        "SELECT id, url, content FROM newsletter ORDER BY date DESC, id DESC",
      ).all() as Array<{ id: number; url: string; content: string | null }>;
      const issueUrls = new Set<string>();
      const updateUrl = this.prepare(
        "UPDATE newsletter SET url = ? WHERE id = ?",
      );
      const updateContent = this.prepare(
        "UPDATE newsletter SET content = ? WHERE id = ?",
      );
      const seenLinks = new Set<string>();
      const preferredLinks = new Set<string>();
      const contents = new Map<number, unknown[]>();
      let normalizedIssues = 0;
      let removedLinks = 0;

      for (const row of rows) {
        const normalizedUrl = normalizeUrl(row.url);
        if (issueUrls.has(normalizedUrl)) {
          throw new Error(
            `Issue URLs collide after normalization: ${normalizedUrl}`,
          );
        }
        issueUrls.add(normalizedUrl);

        if (normalizedUrl !== row.url) {
          updateUrl.run(normalizedUrl, row.id);
          normalizedIssues++;
        }

        if (row.content === null) continue;

        const content: unknown = JSON.parse(row.content);
        if (!Array.isArray(content)) continue;

        contents.set(row.id, content);
        for (const item of content) {
          if (isExportableLink(item)) {
            preferredLinks.add(normalizeUrl(item.link));
          }
        }
      }

      for (const row of rows) {
        const content = contents.get(row.id);
        if (!content) continue;

        const uniqueContent = deduplicateLinks(
          content,
          seenLinks,
          preferredLinks,
        );
        const duplicateCount = content.length - uniqueContent.length;
        if (duplicateCount === 0) continue;

        updateContent.run(JSON.stringify(uniqueContent), row.id);
        removedLinks += duplicateCount;
      }

      return {
        removedIssues,
        normalizedIssues,
        removedLinks,
      };
    });
    const result = cleanup();

    if (result.removedIssues > 0) {
      console.log(
        `removed ${result.removedIssues} issues before ${SCRAPE_START_DATE}`,
      );
    }
    if (result.normalizedIssues > 0) {
      console.log(`normalized ${result.normalizedIssues} issue URLs`);
    }
    if (result.removedLinks > 0) {
      console.log(`removed ${result.removedLinks} duplicate scraped links`);
    }
  }

  private getLastIssueNumber(source: SourceName) {
    const row = this.prepare(
      "SELECT last_issue_number FROM source WHERE name = ?",
    ).get(source) as { last_issue_number: number } | undefined;
    return row?.last_issue_number ?? 0;
  }
}
