# Crawling Policy

ToraSEO performs HTTP requests against websites. Anyone who runs a
crawler is, in effect, asking other people's servers to do work on
their behalf. This document is our public commitment about how we ask.

It is intended for three audiences:

- **Site operators** who see ToraSEO traffic in their logs and want to
  understand what it is, how to identify it, and how to control it.
- **Users** of ToraSEO who need to understand what the tool will and
  will not do on their behalf.
- **Contributors** writing new crawler code, who need a single source
  of truth for the rules they must respect.

## Identification

ToraSEO identifies itself honestly. The default User-Agent is:

```
ToraSEO/<version> (+https://github.com/Magbusjap/toraseo)
```

The User-Agent string is configurable, but it must always:

- Contain the literal token `ToraSEO`.
- Contain a contact URL (the repository, an operator-supplied URL, or
  an email).

We do **not** support, and will not accept contributions that add:

- User-Agent strings impersonating Googlebot, Bingbot, Yandexbot, or
  any other major crawler.
- User-Agent strings that omit a contact path.
- Stealth modes that hide the fact that an automated tool is making
  the request.

## robots.txt

ToraSEO honors `robots.txt` by default for the User-Agent token
`ToraSEO` and for the wildcard `*`. The order of evaluation is:

1. The most specific matching `User-agent` block wins.
2. Within that block, `Disallow` and `Allow` directives are evaluated
   per [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html).
3. If no block matches, all paths are allowed.
4. If `robots.txt` is unreachable (timeout, 5xx), we treat the site as
   disallowed for that session and surface the failure to the user
   rather than silently proceeding.

`robots.txt` is fetched once per session per host, cached, and respected
for the duration of that session.

### When robots.txt can be overridden

Override is permitted only in **Owner mode** (see Tiers, below) and only
after the user has affirmatively asserted ownership of the target site.
Owner-mode override is logged. There is no global "disable robots.txt"
flag and no plan to add one.

## Rate Limits

Default request budget per scan:

| Setting | Default |
|---|---|
| Minimum interval between requests to the same host | 2 seconds |
| Concurrent connections per host | 1 |
| Request timeout | 15 seconds |
| Maximum redirects per request | 5 |
| Maximum response body size | 10 MB |
| Maximum pages per scan | 50 |
| Maximum total wall-clock time per scan | 5 minutes |

These defaults are conservative on purpose. Tightening them is always
allowed; loosening them is gated behind operation tiers and, where
relevant, owner verification.

`Crawl-delay` directives in `robots.txt` raise the per-host interval
above the default if the directive is larger; they never lower it.

## Operation Tiers

ToraSEO operates in one of three tiers. The tier is chosen per scan
and surfaced clearly in the UI.

### Tier 1 — Owner mode

For sites the user has verified as their own. Verification methods
include Google Search Console / Yandex Webmaster ownership tokens,
DNS TXT records, or a verification file served from the site's root.

- Full default budget applies.
- Owner-mode-only checks (e.g. authenticated PageSpeed runs against
  staging hosts) are available.
- robots.txt override is available, but the override is logged in the
  scan report.

### Tier 2 — Polite mode (default for unverified sites)

For public sites the user does not own — competitor analysis, public
research, third-party diagnostics.

- Per-host interval is increased to **3 seconds minimum**.
- Page cap is reduced to **20 pages**.
- robots.txt is strictly honored; no override.
- Authenticated checks are disabled.
- Forms are not submitted.

### Tier 3 — API-only mode

For sites with strong bot-protection (Cloudflare challenge, hCaptcha,
custom WAF) or sites the user explicitly marks as off-limits.

- No direct HTTP requests to the site.
- Analysis uses only public APIs (Google PageSpeed, Yandex Webmaster,
  Bing Webmaster) where the user has supplied credentials.
- Suitable for "I want a report on this competitor but I do not want
  my IP touching their server."

## What ToraSEO Does Not Do

The following are not bugs to be fixed, configuration options to be
added, or PRs to be accepted. They are out-of-scope by design:

- **No CAPTCHA solving.** If a site presents a CAPTCHA, the scan
  stops and reports it.
- **No proxy rotation, residential proxies, or IP cycling.** One scan
  comes from one IP.
- **No User-Agent spoofing** beyond the configurable identification
  rules above.
- **No session hijacking, cookie theft, or credential reuse across
  sites.**
- **No PII scraping.** ToraSEO does not extract email addresses, phone
  numbers, or personal names from pages it visits.
- **No bypass of authentication.** If a page requires login, the scan
  treats it as inaccessible.
- **No execution of fetched JavaScript** in the crawler tier. The Tauri
  app may render pages in its own webview for visual inspection of
  *the user's own URL inputs*, but the crawler component does not run
  third-party JavaScript.
- **No persistence of fetched content** beyond the duration of a scan,
  except for screenshots and reports the user explicitly saves.

## How Site Operators Can Control ToraSEO

If you operate a website and want to influence ToraSEO's behavior:

- **Block it entirely.** Add to your `robots.txt`:
  ```
  User-agent: ToraSEO
  Disallow: /
  ```
  ToraSEO will respect this and refuse to scan your site, regardless
  of which user is running the tool, in any tier other than verified
  Owner mode for your own site.

- **Slow it down.** Use `Crawl-delay`:
  ```
  User-agent: ToraSEO
  Crawl-delay: 10
  ```

- **Allow specific paths only.** Standard `Allow` / `Disallow` rules
  apply.

- **Report abuse.** If a ToraSEO-identified User-Agent is hitting your
  site in a way that violates this policy, please email
  `magbusjap@gmail.com` with logs (timestamps, URLs, observed
  User-Agent) and we will investigate.

## Why This Matters

Ethical crawling is not a limitation we accept reluctantly. It is a
feature of the product:

- **Trust.** Corporate users can run ToraSEO inside their own
  environment without legal review of every scan.
- **Reproducibility.** A scan that respects rate limits and identifies
  itself produces results that can be verified by re-running it.
- **Longevity.** Crawlers that misbehave get blocked at the network
  layer. Crawlers that behave keep working.
- **Honesty about AI tooling.** ToraSEO is built around AI-assisted
  workflows. The wider ecosystem benefits when AI-driven tools are
  visibly well-behaved on the open web; it does not benefit from
  another wave of stealth scrapers.

## Changes to This Policy

Material changes to this document — anything that loosens limits,
introduces a new override path, or changes the User-Agent contract —
are announced in [`CHANGELOG.md`](CHANGELOG.md) and tagged in the
release that introduces them. We do not silently weaken these defaults.

---

_Last reviewed: 2026-04-25_
_Applies to ToraSEO **0.2.0-draft** and later until superseded._
