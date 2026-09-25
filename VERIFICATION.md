# Static portfolio verification

## Architecture

- Pure static HTML/CSS/vanilla JavaScript.
- No React, Next.js, JSX, TSX, Node.js, npm, framework router, server components, hydration, or build runtime.
- No `package.json` is included.
- The deployed folder is the final site; there is no compilation step.

## Automated source audit

The final tree was checked for:

- local links and asset targets
- exactly one H1 per page
- page titles
- duplicate HTML IDs
- TSX/JSX files
- package/framework implementation artifacts
- CSS parse errors

Result:

- 18 HTML pages
- 1 CSS file
- 2 small vanilla JavaScript files (`site-config.js` and `main.js`)
- 0 TSX/JSX files
- 0 `package.json`
- 0 broken local link/asset targets detected
- 0 CSS parse errors detected

## Browser-level QA

Chromium was used with the static HTML/CSS/JS inlined for visual and interaction checks. The environment blocks normal navigation to localhost/file URLs, so inlining was used only for QA; the shipped site remains normal linked static files.

Verified:

- desktop homepage composition at 1440 px
- mobile homepage composition at 390 px
- interior About, Contact, and NEXORA case-study layouts
- mobile menu opens and updates its ARIA state
- theme control toggles dark mode
- empty contact form exposes all four validation errors
- valid form data with no configured email displays the explicit “not sent” notice

## Before production deployment

1. Edit `assets/js/site-config.js` with verified contact URLs/email.
2. Replace `https://example.com` in `sitemap.xml`, `robots.txt`, and Open Graph metadata with the verified production domain.
3. Add a real resume PDF and set `resumePath` only when the file is available.
