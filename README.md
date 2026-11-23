# newsletter-scraper

A web scraper that extracts curated content from programming and AI newsletters, making it easy to search for new libraries, articles, and tools.

[Website](https://carlosqsilva.github.io/newsletter-scraper/)

- [x] [JavaScript Weekly](https://javascriptweekly.com)
- [x] [Node Weekly](https://nodeweekly.com)
- [x] [Frontend Focus](https://frontendfoc.us)
- [x] [Postgres Weekly](https://postgresweekly.com)
- [x] [Pycoders Weekly](https://pycoders.com/)
- [x] [TLDR AI](https://tldr.tech/ai)

Want to suggest a new newsletter? [Suggest Newsletter](https://github.com/carlosqsilva/newsletter-scraper/issues/new/choose)

## Why?

Many newsletter dont allow/offer a way to search through its content

## How it works?

The [GitHub Pages workflow](https://github.com/carlosqsilva/newsletter-scraper/blob/25dd657af77c6e5482ab05e9d7d859d9523c7611/.github/workflows/deploy.yml) is manual-only; it no longer runs on a schedule.

To scrape and view the site locally without GitHub Actions, run these commands from the repository root:

```sh
pnpm install
pnpm scrape
pnpm web
```

The browser cannot read SQLite directly. The scraper exports the local database to `app/public/data.json`, `app/public/issues.json`, and `app/public/sponsors.json`; `pnpm web` refreshes those exports before starting Astro. Then open the local URL printed by Astro. `pnpm scrape` fetches new newsletter issues and updates the database. Run `pnpm refresh` to re-scrape every saved issue dated January 1, 2026 or later. Numbered newsletters keep a per-source issue-number checkpoint in SQLite and only fetch issues after it. If a newsletter source is unavailable, successful sources are still exported and the scraper reports the source failures.

In the site's **From Newsletter** section, choose a source to see its extracted links in the feed, or choose an issue to narrow the feed to that issue.

Only issues dated January 1, 2026 or later are scraped and included in the website export.

## Built with

- Node.js
- SQLite
- Astro
- SolidJS
- Tailwindcss
