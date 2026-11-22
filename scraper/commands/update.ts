import type { Browser } from "happy-dom";
import type { Storage } from "../database.ts";
import { JavascriptWeekly, NodeWeekly } from "../newsletter/common/index.ts";
import { FrontendFocus } from "../newsletter/frontendfocus.ts";
import { PostgresWeekly } from "../newsletter/postgresweekly.ts";
import { PyCoders } from "../newsletter/pycoders.ts";

export async function update(browser: Browser, storage: Storage) {
  const results = await Promise.allSettled([
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
