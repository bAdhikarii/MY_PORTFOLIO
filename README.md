# Bikram Adhikari — Static Portfolio

This version is **fully static** and intentionally framework-free. It uses semantic HTML, authored CSS, and a small amount of vanilla JavaScript only for theme switching, mobile navigation, contact configuration, form validation, and the current year.

## Design direction

The visual system has been reworked around an editorial, monochrome portfolio language:

- warm off-white page canvas with very subtle paper texture
- large soft-gray art-directed hero and page-intro panels
- display serif typography paired with a quiet system sans-serif
- compact black CTAs with restrained shadows
- precise hairline dividers instead of repeated rounded cards
- oversized `BA` monogram as the homepage hero visual rather than a fabricated portrait
- one dark floating selected-work panel, echoing the reference composition without copying it
- project names used as the homepage ecosystem strip instead of invented client logos or metrics
- deliberately restrained motion; no generic scroll-reveal effects, gradients, neon, glass-heavy UI, or decorative animation loops
- matching light and dark themes

The site does **not** use the person shown in the visual reference as Bikram's portrait.

## Deploy

Upload the contents of this folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, S3/static hosting, cPanel, Apache, Nginx, etc.). There is no build step.

For a local preview:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Configure verified contact links

Edit `assets/js/site-config.js` and add only verified values:

- `email`
- `linkedin`
- `github`
- `company`
- `resumePath` (for example `assets/files/bikram-adhikari-resume.pdf` after adding a real PDF)

The contact form validates in the browser and opens a `mailto:` draft only when `email` is configured. It never pretends to send a message to a backend.

## Production domain / SEO

Because a verified personal domain was not supplied, `https://example.com` remains an explicit deployment placeholder in `sitemap.xml`, `robots.txt`, and Open Graph image metadata. Replace it with the real production origin before publishing.

Canonical links are relative (`./`), so they resolve correctly on the deployed origin without inventing a domain.

## Content integrity

Project data is preserved in `assets/data/projects.json`. Unsupported dates, metrics, institutions, outcomes, links, and achievements remain unfilled instead of being fabricated.

The portfolio content may mention React/Next.js as technologies in Bikram's broader capability context because they were present in the supplied source material; the **website implementation itself does not use React or Next.js**.
