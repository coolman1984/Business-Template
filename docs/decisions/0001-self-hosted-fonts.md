# 0001 — Ship the design-system fonts with the web app

**Status:** accepted · 2026-09-25

## Context
The design system (DESIGN.md §3) uses Inter and Instrument Serif, with Noto Sans Arabic and Noto Naskh Arabic for Arabic. The first version loaded them from Google Fonts on every page load. That call sends each user's IP address and the page address to an outside service, and it fails on factory networks with no internet, which the master plan requires us to support (§21, local and offline installs).

## Decision
Bundle the fonts with `apps/business-web` through four npm packages, pinned to exact versions:

| Package | Version | License |
|---|---|---|
| `@fontsource/inter` | 5.3.0 | OFL-1.1 |
| `@fontsource/instrument-serif` | 5.3.0 | OFL-1.1 |
| `@fontsource/noto-sans-arabic` | 5.3.0 | OFL-1.1 |
| `@fontsource/noto-naskh-arabic` | 5.3.0 | OFL-1.1 |

The SIL Open Font License 1.1 allows bundling and redistributing the fonts with software, including commercial software, provided they are not sold on their own.

**Why they are needed:** without them the UI falls back to system fonts, which breaks the typographic hierarchy the design system relies on, especially the Arabic display headings.

## Consequences
- The app makes no request to an outside font service, and it looks the same online and offline.
- Only the weights we use are imported (in `src/main.tsx`). Each weight's CSS carries per-script `unicode-range` rules, so the browser downloads only the scripts a page actually shows.
- The standalone sales demo in `examples/ceramics-demo/` still uses Google Fonts. It is published as a claude.ai artifact, and that host only allows fonts from Google Fonts. It is not part of any customer installation.
