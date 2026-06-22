# Murder Mystery Mingle

Interactive murder mystery party hosting service. One-page HTML site with contact form, theme cards, testimonials, and scroll-to-top button.

## Deploy

### Vercel (one click)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/myocjade511/murdermysterymingle)

### Manual deploy
```
npx vercel deploy . --prod
```

## Structure
- `index.html` — single-page site (HTML + CSS + JS inline)
- `images/` — theme backgrounds and testimonial screenshots
- `vercel.json` — Vercel static deployment config

## Domain Setup
Point `murdermysterymingle.com` to Vercel:
- CNAME `www` → `cname.vercel-dns.com`
- A `@` → `76.76.21.21`
