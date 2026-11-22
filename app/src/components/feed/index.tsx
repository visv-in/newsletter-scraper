import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { Logo } from "../ui/logo";

type CategoryId = "html" | "css" | "js" | "node" | "postgres" | "python";
type SelectedCategory = CategoryId | "all";

interface FeedItem {
  description: string;
  source: string;
  date: string;
  url: string;
}

interface CategorizedFeedItem extends FeedItem {
  categories: CategoryId[];
}

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
      /\breact\b/i,
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
];

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
    typeof value.url === "string"
  );
}

function classifyItem(item: FeedItem): CategoryId[] {
  const text = `${item.description} ${item.url}`;
  return CATEGORIES.filter(({ matches }) =>
    matches.some((pattern) => pattern.test(text)),
  ).map(({ id }) => id);
}

async function loadFeed(): Promise<CategorizedFeedItem[]> {
  const response = await fetch(new URL("data.json", window.location.href));
  if (!response.ok) {
    throw new Error(`Could not load curated links (HTTP ${response.status}).`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("The curated links data has an invalid format.");
  }

  return data.map((item: unknown, index: number) => {
    if (!isFeedItem(item)) {
      throw new Error(`The curated links data has an invalid item at ${index}.`);
    }

    return { ...item, categories: classifyItem(item) };
  });
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsedDate.getTime())
    ? date
    : DATE_FORMATTER.format(parsedDate);
}

function formatSource(source: string) {
  const names: Record<string, string> = {
    frontendfocus: "Frontend Focus",
    javascriptweekly: "JavaScript Weekly",
    nodeweekly: "Node Weekly",
    postgresweekly: "Postgres Weekly",
    pycoders: "PyCoders",
  };
  return names[source] ?? source;
}

export function Feed() {
  const [selectedCategory, setSelectedCategory] =
    createSignal<SelectedCategory>("all");
  const [items, { refetch }] = createResource(loadFeed);

  const sortedItems = createMemo(() =>
    [...(items() ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
  );
  const visibleItems = createMemo(() => {
    const category = selectedCategory();
    return category === "all"
      ? sortedItems()
      : sortedItems().filter((item) => item.categories.includes(category));
  });
  const countFor = (category: SelectedCategory) =>
    category === "all"
      ? sortedItems().length
      : sortedItems().filter((item) => item.categories.includes(category))
          .length;

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
        <aside class="hidden w-56 flex-none border-r border-border px-4 py-6 md:block">
          <p class="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            Browse topics
          </p>
          <CategoryNavigation
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            countFor={countFor}
          />
        </aside>

        <main class="flex min-w-0 flex-1 flex-col">
          <div class="border-b border-border px-4 py-3 md:hidden">
            <CategoryNavigation
              compact
              selected={selectedCategory}
              onSelect={setSelectedCategory}
              countFor={countFor}
            />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <div class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
              <div class="mb-5">
                <h1 class="text-2xl font-bold tracking-tight">
                  {selectedCategory() === "all"
                    ? "Latest links"
                    : `${CATEGORY_LABELS.get(selectedCategory() as CategoryId)} links`}
                </h1>
                <p class="mt-1 text-sm text-fg-subtle">
                  {visibleItems().length.toLocaleString()} curated reads
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
                  when={visibleItems().length > 0}
                  fallback={
                    <p class="py-12 text-center text-fg-muted">
                      No links in this topic yet.
                    </p>
                  }
                >
                  <div class="space-y-4">
                    <For each={visibleItems()}>
                      {(item) => <FeedCard item={item} />}
                    </For>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </main>
      </div>
    </div>
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
            class="flex flex-none items-center justify-between gap-5 rounded-lg px-3 py-2 text-left text-sm transition-colors aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-fg text-fg-muted hover:bg-surface"
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
          {props.item.categories[0] ?? "↗"}
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
