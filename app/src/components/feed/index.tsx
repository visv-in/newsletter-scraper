import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { Logo } from "../ui/logo";

type CategoryId =
  | "html"
  | "css"
  | "js"
  | "node"
  | "postgres"
  | "python"
  | "ai";
type DomainTopicId = "html" | "css" | "js" | "postgres" | "python" | "ai";
type SelectedCategory = CategoryId | "all";

interface FeedItem {
  description: string;
  source: string;
  date: string;
  url: string;
  issueUrl?: string;
}

interface NewsletterIssue {
  source: string;
  date: string;
  url: string;
}

interface NewsletterSelection {
  source: string;
  issueUrl?: string;
  date?: string;
}

interface CategorizedFeedItem extends FeedItem {
  categories: CategoryId[];
}

const SCRAPE_START_DATE = "2026-01-01";

const CATEGORIES: Array<{
  id: CategoryId;
  label: string;
  matches: RegExp[];
}> = [
  {
    id: "html",
    label: "HTML",
    matches: [/\bhtml5?\b/i, /\bweb components?\b/i, /\bhtmx\b/i],
  },
  {
    id: "css",
    label: "CSS",
    matches: [
      /\bcss\b/i,
      /\bscss\b/i,
      /\bsass\b/i,
      /\btailwind(?:css)?\b/i,
      /\bpostcss\b/i,
      /\bstyled-components\b/i,
    ],
  },
  {
    id: "js",
    label: "JS",
    matches: [
      /\bjavascript\b/i,
      /\btypescript\b/i,
      /\bjs\b/i,
      /\bvue\b/i,
      /\bsvelte\b/i,
      /\bangular\b/i,
      /\bnext\.js\b/i,
      /\bnuxt\b/i,
      /\bdeno\b/i,
      /\bbun\b/i,
    ],
  },
  {
    id: "node",
    label: "Node",
    matches: [
      /\bnode(?:\.js|js)?\b/i,
      /\bnpm\b/i,
      /\bpnpm\b/i,
      /\byarn\b/i,
      /\bexpress(?:\.js)?\b/i,
      /\bfastify\b/i,
      /\bnestjs\b/i,
    ],
  },
  {
    id: "postgres",
    label: "Postgres",
    matches: [/\bpostgres(?:ql)?\b/i, /\bpsql\b/i, /\bpgvector\b/i],
  },
  {
    id: "python",
    label: "Python",
    matches: [
      /\bpython\b/i,
      /\bpycoders\b/i,
      /\bpypi\b/i,
      /\bdjango\b/i,
      /\bflask\b/i,
      /\bpandas\b/i,
    ],
  },
  {
    id: "ai",
    label: "AI",
    matches: [
      /\bai\b/i,
      /\bartificial intelligence\b/i,
      /\bmachine learning\b/i,
      /\bdeep learning\b/i,
      /\bllm\b/i,
      /\bneural network\b/i,
      /\bopenai\b/i,
      /\banthropic\b/i,
      /\bgemini\b/i,
      /\bchatgpt\b/i,
    ],
  },
];

const AI_NEWSLETTERS = [
  {
    id: "therundownai",
    label: "The Rundown AI",
    url: "https://www.therundown.ai/",
  },
  { id: "tldrai", label: "TLDR AI", url: "https://tldr.tech/ai" },
  {
    id: "thebatch",
    label: "The Batch",
    url: "https://www.deeplearning.ai/the-batch/",
  },
  {
    id: "superhumanai",
    label: "Superhuman AI",
    url: "https://www.superhuman.ai/",
  },
  {
    id: "importai",
    label: "Import AI",
    url: "https://importai.substack.com/",
  },
];
const AI_SOURCE_IDS = new Set<string>(AI_NEWSLETTERS.map(({ id }) => id));
const OTHER_NEWSLETTERS = AI_NEWSLETTERS;
function isDomainTopicCategory(
  category: (typeof CATEGORIES)[number],
): category is (typeof CATEGORIES)[number] & { id: DomainTopicId } {
  return category.id !== "node";
}

const DOMAIN_TOPICS = CATEGORIES.filter(isDomainTopicCategory);
const CATEGORY_LABELS = new Map(
  CATEGORIES.map(({ id, label }) => [id, label]),
);
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function isFeedItem(value: unknown): value is FeedItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "description" in value &&
    typeof value.description === "string" &&
    "source" in value &&
    typeof value.source === "string" &&
    "date" in value &&
    typeof value.date === "string" &&
    "url" in value &&
    typeof value.url === "string" &&
    (!("issueUrl" in value) || typeof value.issueUrl === "string")
  );
}

function isNewsletterIssue(value: unknown): value is NewsletterIssue {
  return (
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    typeof value.source === "string" &&
    "date" in value &&
    typeof value.date === "string" &&
    "url" in value &&
    typeof value.url === "string"
  );
}

function classifyItem(item: FeedItem): CategoryId[] {
  const text = `${item.description} ${item.url}`;
  return CATEGORIES.filter(
    ({ id, matches }) =>
      (id === "ai" && AI_SOURCE_IDS.has(item.source)) ||
      (id === "python" && item.source === "pycoders") ||
      matches.some((pattern) => pattern.test(text)),
  ).map(({ id }) => id);
}

function getLinkIdentity(url: string) {
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

function matchesSelection(
  item: CategorizedFeedItem,
  selection: SelectedCategory,
) {
  if (selection === "all") return true;
  return item.categories.includes(selection);
}

async function loadFeed(): Promise<CategorizedFeedItem[]> {
  const response = await fetch(
    new URL("data.json", window.location.href),
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Could not load curated links (HTTP ${response.status}).`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("The curated links data has an invalid format.");
  }

  const feedItems = data
    .map((item: unknown, index: number) => {
      if (!isFeedItem(item)) {
        throw new Error(
          `The curated links data has an invalid item at ${index}.`,
        );
      }

      return { ...item, categories: classifyItem(item) };
    })
    .filter((item) => item.date >= SCRAPE_START_DATE)
    .sort((a, b) => b.date.localeCompare(a.date));
  const seenLinks = new Set<string>();

  return feedItems.filter((item) => {
    const identity = getLinkIdentity(item.url);
    if (seenLinks.has(identity)) return false;
    seenLinks.add(identity);
    return true;
  });
}

async function loadNewsletterIssues(): Promise<NewsletterIssue[]> {
  const response = await fetch(new URL("issues.json", window.location.href), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Could not load newsletter issues (HTTP ${response.status}).`,
    );
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("The newsletter issues data has an invalid format.");
  }

  return data
    .map((issue: unknown, index: number) => {
      if (!isNewsletterIssue(issue)) {
        throw new Error(
          `The newsletter issues data has an invalid item at ${index}.`,
        );
      }

      return issue;
    })
    .filter((issue) => issue.date >= SCRAPE_START_DATE);
}

function getHostname(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
    return parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getDomain(url: string) {
  return getHostname(url) ?? url;
}

function formatDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsedDate.getTime())
    ? date
    : DATE_FORMATTER.format(parsedDate);
}

function formatSource(source: string) {
  const names: Record<string, string> = {
    javascriptweekly: "JavaScript Weekly",
    nodeweekly: "Node Weekly",
    frontendfocus: "Frontend Focus",
    postgresweekly: "Postgres Weekly",
    pycoders: "PyCoders",
    therundownai: "The Rundown AI",
    tldrai: "TLDR AI",
    thebatch: "The Batch",
    superhumanai: "Superhuman AI",
    importai: "Import AI",
  };
  return names[source] ?? source;
}

export function Feed() {
  const [selectedCategory, setSelectedCategory] =
    createSignal<SelectedCategory>("all");
  const [selectedDomainTopic, setSelectedDomainTopic] =
    createSignal<DomainTopicId | null>(null);
  const [selectedDomain, setSelectedDomain] = createSignal<string | null>(null);
  const [selectedNewsletter, setSelectedNewsletter] =
    createSignal<NewsletterSelection | null>(null);
  const [items, { refetch }] = createResource(loadFeed);
  const [newsletterIssues, { refetch: refetchNewsletterIssues }] =
    createResource(loadNewsletterIssues);

  const sortedItems = createMemo(() =>
    [...(items() ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
  );
  const visibleItems = createMemo(() => {
    const domain = selectedDomain();
    if (domain) {
      return sortedItems().filter((item) => getHostname(item.url) === domain);
    }

    const newsletter = selectedNewsletter();
    if (newsletter) {
      return sortedItems().filter((item) => {
        if (item.source !== newsletter.source) return false;
        if (!newsletter.issueUrl) return true;
        return item.issueUrl
          ? item.issueUrl === newsletter.issueUrl
          : item.date === newsletter.date;
      });
    }

    const category = selectedCategory();
    return sortedItems().filter((item) => matchesSelection(item, category));
  });
  const countFor = (category: SelectedCategory) =>
    sortedItems().filter((item) => matchesSelection(item, category)).length;
  const countForDomain = (domain: string) =>
    sortedItems().filter((item) => getHostname(item.url) === domain).length;
  const domainsForTopic = (topic: DomainTopicId) =>
    [
      ...new Set(
        sortedItems()
          .filter((item) => item.categories.includes(topic))
          .map((item) => getHostname(item.url))
          .filter((domain): domain is string => domain !== null),
      ),
    ].sort();
  const countForDomainTopic = (topic: DomainTopicId) =>
    domainsForTopic(topic).length;
  const resultsCount = () => {
    const topic = selectedDomainTopic();
    return topic
      ? `${countForDomainTopic(topic).toLocaleString()} unique domains`
      : `${visibleItems().length.toLocaleString()} curated reads`;
  };
  const selectCategory = (category: SelectedCategory) => {
    setSelectedCategory(category);
    setSelectedDomainTopic(null);
    setSelectedDomain(null);
    setSelectedNewsletter(null);
  };
  const selectDomainTopic = (topic: DomainTopicId) => {
    setSelectedCategory("all");
    setSelectedDomainTopic(topic);
    setSelectedDomain(null);
    setSelectedNewsletter(null);
  };
  const selectDomain = (domain: string) => {
    setSelectedCategory("all");
    setSelectedDomainTopic(null);
    setSelectedDomain(domain);
    setSelectedNewsletter(null);
  };
  const selectNewsletter = (source: string, issue?: NewsletterIssue) => {
    setSelectedCategory("all");
    setSelectedDomainTopic(null);
    setSelectedDomain(null);
    setSelectedNewsletter({
      source,
      ...(issue ? { issueUrl: issue.url, date: issue.date } : {}),
    });
  };
  const heading = () => {
    const domain = selectedDomain();
    if (domain) return `${domain} links`;

    const topic = selectedDomainTopic();
    if (topic) return `${CATEGORY_LABELS.get(topic)} domains`;

    const newsletter = selectedNewsletter();
    if (newsletter) {
      return newsletter.date
        ? `${formatSource(newsletter.source)} · ${formatDate(newsletter.date)} links`
        : `${formatSource(newsletter.source)} links`;
    }

    const category = selectedCategory();
    if (category === "all") return "Latest links";
    const label = CATEGORY_LABELS.get(category);
    return `${label} links`;
  };

  return (
    <div class="flex flex-1 min-h-0 flex-col">
      <header class="flex-none border-b border-border bg-canvas">
        <div class="container mx-auto flex items-center gap-5 px-4 py-3">
          <Logo />
          <div class="hidden border-l border-border pl-5 sm:block">
            <p class="font-semibold">Developer links, curated daily</p>
            <p class="text-sm text-fg-subtle">
              The latest reads from programming newsletters
            </p>
          </div>
          <span class="ml-auto rounded-full bg-surface px-3 py-1 text-xs text-fg-muted">
            Since Jan 1, 2026
          </span>
        </div>
      </header>

      <div class="container mx-auto flex min-h-0 flex-1">
        <aside class="hidden min-h-0 w-56 flex-none overflow-y-auto border-r border-border px-4 py-6 md:block">
          <NewsletterNavigation
            issues={newsletterIssues() ?? []}
            loading={newsletterIssues.loading}
            error={newsletterIssues.error}
            onRetry={() => refetchNewsletterIssues()}
            selected={selectedNewsletter}
            onSelectNewsletter={selectNewsletter}
          />
          <p class="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            Browse topics
          </p>
          <CategoryNavigation
            selected={selectedCategory}
            onSelect={selectCategory}
            countFor={countFor}
          />
          <DomainTopicNavigation
            selected={selectedDomainTopic}
            onSelect={selectDomainTopic}
            countFor={countForDomainTopic}
          />
          <OtherNewsletterNavigation />
        </aside>

        <main class="flex min-w-0 flex-1 flex-col">
          <div class="border-b border-border px-4 py-3 md:hidden">
            <NewsletterNavigation
              compact
              issues={newsletterIssues() ?? []}
              loading={newsletterIssues.loading}
              error={newsletterIssues.error}
              onRetry={() => refetchNewsletterIssues()}
              selected={selectedNewsletter}
              onSelectNewsletter={selectNewsletter}
            />
            <CategoryNavigation
              compact
              selected={selectedCategory}
              onSelect={selectCategory}
              countFor={countFor}
            />
            <OtherNewsletterNavigation compact />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <div class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
              <div class="mb-5">
                <h1 class="text-2xl font-bold tracking-tight">
                  {heading()}
                </h1>
                <p class="mt-1 text-sm text-fg-subtle">
                  {resultsCount()}
                </p>
              </div>

              <Show when={items.loading}>
                <p class="py-12 text-center text-fg-muted" role="status">
                  Loading curated links…
                </p>
              </Show>

              <Show when={items.error}>
                <div
                  class="rounded-xl border border-border bg-surface p-6 text-center"
                  role="alert"
                >
                  <p class="font-medium">Could not load the link feed.</p>
                  <p class="mt-2 text-sm text-fg-subtle">
                    {items.error instanceof Error
                      ? items.error.message
                      : "An unexpected error occurred."}
                  </p>
                  <button
                    type="button"
                    class="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-canvas"
                    onClick={() => refetch()}
                  >
                    Try again
                  </button>
                </div>
              </Show>

              <Show when={!items.loading && !items.error}>
                <Show
                  when={selectedDomainTopic()}
                  fallback={
                    <Show
                      when={visibleItems().length > 0}
                      fallback={
                        <p class="py-12 text-center text-fg-muted">
                          No links found for this selection yet.
                        </p>
                      }
                    >
                      <div class="space-y-4">
                        <For each={visibleItems()}>
                          {(item) => <FeedCard item={item} />}
                        </For>
                      </div>
                    </Show>
                  }
                >
                  {(topic) => (
                    <DomainList
                      domains={domainsForTopic(topic())}
                      onSelect={selectDomain}
                      countFor={countForDomain}
                    />
                  )}
                </Show>
              </Show>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function NewsletterNavigation(props: {
  compact?: boolean;
  issues: NewsletterIssue[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  selected: () => NewsletterSelection | null;
  onSelectNewsletter: (source: string, issue?: NewsletterIssue) => void;
}) {
  const groupedIssues = createMemo(() => {
    const groups = new Map<string, NewsletterIssue[]>();
    for (const issue of props.issues.filter(
      ({ source }) => !AI_SOURCE_IDS.has(source),
    )) {
      const group = groups.get(issue.source) ?? [];
      group.push(issue);
      groups.set(issue.source, group);
    }

    return [...groups.entries()].sort(([a], [b]) =>
      formatSource(a).localeCompare(formatSource(b)),
    );
  });

  return (
    <section class={props.compact ? "mb-3" : "mb-6"}>
      <Show
        when={!props.compact}
        fallback={
          <details class="rounded-lg border border-border">
            <summary class="cursor-pointer px-3 py-2 text-sm font-semibold">
              From Newsletter
            </summary>
            <div class="max-h-64 overflow-y-auto px-2 pb-2">
              <NewsletterIssueGroups
                groups={groupedIssues()}
                loading={props.loading}
                error={props.error}
                onRetry={props.onRetry}
                selected={props.selected}
                onSelectNewsletter={props.onSelectNewsletter}
              />
            </div>
          </details>
        }
      >
        <h2 class="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          From Newsletter
        </h2>
        <NewsletterIssueGroups
          groups={groupedIssues()}
          loading={props.loading}
          error={props.error}
          onRetry={props.onRetry}
          selected={props.selected}
          onSelectNewsletter={props.onSelectNewsletter}
        />
      </Show>
    </section>
  );
}

function NewsletterIssueGroups(props: {
  groups: [string, NewsletterIssue[]][];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  selected: () => NewsletterSelection | null;
  onSelectNewsletter: (source: string, issue?: NewsletterIssue) => void;
}) {
  return (
    <Show
      when={!props.loading && !props.error}
      fallback={
        <Show
          when={props.error}
          fallback={
            <p class="px-3 py-2 text-sm text-fg-subtle">Loading issues…</p>
          }
        >
          <div class="px-3 py-2 text-sm text-fg-subtle" role="alert">
            <p>
              {props.error instanceof Error
                ? props.error.message
                : "Could not load newsletter issues."}
            </p>
            <button type="button" class="mt-1 text-link" onClick={props.onRetry}>
              Try again
            </button>
          </div>
        </Show>
      }
    >
      <Show
        when={props.groups.length > 0}
        fallback={
          <p class="px-3 py-2 text-sm text-fg-subtle">No issues found.</p>
        }
      >
        <div class="flex flex-col gap-1">
          <For each={props.groups}>
            {([source, issues]) => (
              <details class="rounded-lg">
                <summary
                  class={`cursor-pointer rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-surface ${props.selected()?.source === source ? "bg-surface font-semibold text-fg" : ""}`}
                  onClick={() => props.onSelectNewsletter(source)}
                >
                  <span>{formatSource(source)}</span>
                  <span class="ml-2 text-xs text-fg-subtle">
                    {issues.length.toLocaleString()}
                  </span>
                </summary>
                <ul class="ml-3 border-l border-border py-1 pl-2">
                  <For each={issues}>
                    {(issue) => (
                      <li>
                        <button
                          type="button"
                          aria-pressed={props.selected()?.issueUrl === issue.url}
                          class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg-muted hover:bg-surface hover:text-fg aria-pressed:bg-surface aria-pressed:text-fg"
                          onClick={() =>
                            props.onSelectNewsletter(source, issue)
                          }
                        >
                          <time datetime={issue.date}>
                            {formatDate(issue.date)}
                          </time>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </details>
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
}

function OtherNewsletterNavigation(props: { compact?: boolean }) {
  return (
    <section
      class={
        props.compact
          ? "mt-3 border-t border-border pt-3"
          : "mt-6 border-t border-border pt-5"
      }
    >
      <h2 class="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        Other Newsletters
      </h2>
      <nav
        aria-label="Other newsletters"
        class={
          props.compact ? "flex gap-2 overflow-x-auto" : "flex flex-col gap-1"
        }
      >
        <For each={OTHER_NEWSLETTERS}>
          {(source) => (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              class="flex-none rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-surface hover:text-fg"
            >
              {source.label}
            </a>
          )}
        </For>
      </nav>
    </section>
  );
}

function CategoryNavigation(props: {
  compact?: boolean;
  selected: () => SelectedCategory;
  onSelect: (category: SelectedCategory) => void;
  countFor: (category: SelectedCategory) => number;
}) {
  const options: Array<{ id: SelectedCategory; label: string }> = [
    { id: "all", label: "All links" },
    ...CATEGORIES.map(({ id, label }) => ({ id, label })),
  ];

  return (
    <nav
      aria-label="Technology categories"
      class={
        props.compact
          ? "flex gap-2 overflow-x-auto"
          : "flex flex-col gap-1"
      }
    >
      <For each={options}>
        {(option) => (
          <button
            type="button"
            aria-pressed={props.selected() === option.id}
            class="flex flex-none items-center justify-between gap-5 rounded-lg px-3 py-2 text-left text-sm text-fg-muted transition-colors aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-fg hover:bg-surface"
            onClick={() => props.onSelect(option.id)}
          >
            <span>{option.label}</span>
            <span class="text-xs text-fg-subtle">
              {props.countFor(option.id).toLocaleString()}
            </span>
          </button>
        )}
      </For>
    </nav>
  );
}

function DomainTopicNavigation(props: {
  selected: () => DomainTopicId | null;
  onSelect: (topic: DomainTopicId) => void;
  countFor: (topic: DomainTopicId) => number;
}) {
  return (
    <section class="mt-6 border-t border-border pt-5">
      <h2 class="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        Domains
      </h2>
      <div class="flex flex-col gap-3">
        <For each={DOMAIN_TOPICS}>
          {(topic) => {
            return (
              <button
                type="button"
                aria-pressed={props.selected() === topic.id}
                class="flex items-center justify-between gap-5 rounded-lg px-3 py-2 text-left text-sm text-fg-muted transition-colors aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-fg hover:bg-surface"
                onClick={() => props.onSelect(topic.id)}
              >
                <span>{topic.label}</span>
                <span class="text-xs text-fg-subtle">
                  {props.countFor(topic.id).toLocaleString()}
                </span>
              </button>
            );
          }}
        </For>
      </div>
    </section>
  );
}

function DomainList(props: {
  domains: string[];
  onSelect: (domain: string) => void;
  countFor: (domain: string) => number;
}) {
  return (
    <Show
      when={props.domains.length > 0}
      fallback={
        <p class="py-12 text-center text-fg-muted">
          No domains in this topic yet.
        </p>
      }
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <For each={props.domains}>
          {(domain) => (
            <button
              type="button"
              class="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas p-4 text-left transition-colors hover:bg-surface"
              onClick={() => props.onSelect(domain)}
            >
              <span class="truncate font-medium">{domain}</span>
              <span class="flex-none text-xs text-fg-subtle">
                {props.countFor(domain).toLocaleString()} links
              </span>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}

function FeedCard(props: { item: CategorizedFeedItem }) {
  return (
    <a
      href={props.item.url}
      target="_blank"
      rel="noopener noreferrer"
      class="group block rounded-xl border border-border bg-canvas p-5 transition-colors hover:border-fg-subtle hover:bg-surface"
    >
      <div class="flex items-start gap-4">
        <div
          class="flex size-10 flex-none items-center justify-center rounded-full bg-surface text-xs font-bold uppercase text-fg-muted"
          aria-hidden="true"
        >
          {props.item.categories[0]
            ? CATEGORY_LABELS.get(props.item.categories[0])
            : "↗"}
        </div>
        <div class="min-w-0 flex-1">
          <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
            <span class="font-medium text-fg-muted">
              {getDomain(props.item.url)}
            </span>
            <span aria-hidden="true">·</span>
            <time datetime={props.item.date}>{formatDate(props.item.date)}</time>
            <span aria-hidden="true">·</span>
            <span>{formatSource(props.item.source)}</span>
          </div>

          <h2 class="text-base font-semibold leading-6 text-fg group-hover:text-link sm:text-lg">
            {props.item.description}
          </h2>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <For each={props.item.categories}>
              {(category) => (
                <span class="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-fg-muted">
                  {CATEGORY_LABELS.get(category)}
                </span>
              )}
            </For>
            <span class="ml-auto text-xs font-medium text-link">Read story ↗</span>
          </div>
        </div>
      </div>
    </a>
  );
}
