import type { Browser } from "happy-dom";
import type { SourceName, Storage } from "../database.ts";
import { JavascriptWeekly, NodeWeekly } from "../newsletter/common/index.ts";
import { FrontendFocus } from "../newsletter/frontendfocus.ts";
import { createAINewsletterExtractors } from "../newsletter/ai.ts";
import { PostgresWeekly } from "../newsletter/postgresweekly.ts";
import { PyCoders } from "../newsletter/pycoders.ts";
import type { InfoExtractor } from "../newsletter/interface.ts";

export async function update(browser: Browser, storage: Storage) {
  const results = await Promise.allSettled([
    ...createAINewsletterExtractors(browser, storage).map((extractor) =>
      extractor.update(),
    ),
    JavascriptWeekly(browser, storage).update(),
    NodeWeekly(browser, storage).update(),
    new PostgresWeekly(browser, storage).update(),
    new FrontendFocus(browser, storage).update(),
    new PyCoders(browser, storage).update(),
  ]);

  await browser.close();

  storage.summary();

  await storage.export();

  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more newsletter updates failed");
  }
}

export async function refresh(browser: Browser, storage: Storage) {
  const extractors = new Map<SourceName, InfoExtractor>();
  const aiExtractors = createAINewsletterExtractors(browser, storage);
  for (const extractor of aiExtractors) {
    extractors.set(extractor.config.source, extractor);
  }
  extractors.set("javascriptweekly", JavascriptWeekly(browser, storage));
  extractors.set("nodeweekly", NodeWeekly(browser, storage));
  extractors.set("postgresweekly", new PostgresWeekly(browser, storage));
  extractors.set("frontendfocus", new FrontendFocus(browser, storage));
  extractors.set("pycoders", new PyCoders(browser, storage));

  const issues = storage.getIssueUrlsSinceStart();
  const failures: Array<{
    source: SourceName;
    url: string;
    error: unknown;
  }> = [];
  const batchSize = 2;

  for (let index = 0; index < issues.length; index += batchSize) {
    const batch = issues.slice(index, index + batchSize);
    const results = await Promise.allSettled(
      batch.map(({ source, url }) => {
        const extractor = extractors.get(source);
        if (!extractor) {
          throw new Error(`No extractor registered for newsletter: ${source}`);
        }
        return extractor.updateUrl(url);
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result?.status === "rejected") {
        const issue = batch[i];
        if (issue) failures.push({ ...issue, error: result.reason });
      } else {
        console.log(`refreshed: ${batch[i]?.url}`);
      }
    }
  }

  const retryFailures: unknown[] = [];
  for (const failure of failures) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const extractor = extractors.get(failure.source);
    if (!extractor) {
      retryFailures.push(failure.error);
      continue;
    }

    try {
      await extractor.updateUrl(failure.url);
      console.log(`refreshed on retry: ${failure.url}`);
    } catch (error) {
      retryFailures.push(
        new AggregateError(
          [failure.error, error],
          `Failed to refresh ${failure.url} after retry`,
        ),
      );
    }
  }

  await browser.close();
  storage.summary();
  await storage.export();

  if (retryFailures.length > 0) {
    throw new AggregateError(
      retryFailures,
      `${retryFailures.length} of ${issues.length} newsletter issues failed to refresh after retry`,
    );
  }
}
