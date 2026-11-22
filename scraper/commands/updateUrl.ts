import type { Browser } from "happy-dom";
import type { Storage } from "../database.ts";
import { JavascriptWeekly, NodeWeekly } from "../newsletter/common/index.ts";
import { FrontendFocus } from "../newsletter/frontendfocus.ts";
import type { InfoExtractor } from "../newsletter/interface";
import { PostgresWeekly } from "../newsletter/postgresweekly.ts";
import { PyCoders } from "../newsletter/pycoders.ts";
import { defined } from "../utils.ts";

export async function updateUrl(
  url: string,
  browser: Browser,
  storage: Storage,
) {
  let extractor: InfoExtractor | null = null;

  if (PyCoders.canHandle(url)) {
    extractor = new PyCoders(browser, storage);
  }

  if (FrontendFocus.canHandle(url)) {
    extractor = new FrontendFocus(browser, storage);
  }

  if (PostgresWeekly.canHandle(url)) {
    extractor = new PostgresWeekly(browser, storage);
  }

  const items = [JavascriptWeekly, NodeWeekly];

  for (const item of items) {
    const init = item(browser, storage);

    if (init.canHandle(url)) {
      extractor = init;
      break;
    }
  }

  if (!defined(extractor)) {
    throw new Error(`Extractor not found for url: ${url}`);
  }

  extractor.updateUrl(url);
}
