# newsletter-scraper

A web scraper that extract curated content from Programming/Coding newsletter, making it a great tool to search for new libraries, articles and tools.

[Website](https://carlosqsilva.github.io/newsletter-scraper/)

- [x] [JavaScript Weekly](https://javascriptweekly.com)
- [x] [Node Weekly](https://nodeweekly.com)
- [x] [Frontend Focus](https://frontendfoc.us)
- [x] [Postgres Weekly](https://postgresweekly.com)
- [x] [Pycoders Weekly](https://pycoders.com/)

Want to suggest a new newsletter? [Suggest Newsletter](https://github.com/carlosqsilva/newsletter-scraper/issues/new/choose)

## Why?

Many newsletter dont allow/offer a way to search through its content

## How it works?

The [GitHub Pages workflow](https://github.com/carlosqsilva/newsletter-scraper/blob/25dd657af77c6e5482ab05e9d7d859d9523c7611/.github/workflows/deploy.yml) is manual-only; it no longer runs on a schedule.

To scrape on demand without GitHub Actions, install dependencies and run `pnpm scrape` from the repository root. This updates the local database and website data export. Saved issue URLs are skipped on later runs, and the scraper continues through the available issue listings.

Only issues dated January 1, 2026 or later are scraped and included in the website export.

## Built with

- Node.js
- SQLite
- Astro
- SolidJS
- Tailwindcss
