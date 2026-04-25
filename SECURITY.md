# Security Policy

We take the security of ToraSEO seriously. ToraSEO is an SEO toolkit
that performs HTTP requests to user-supplied URLs, runs as an MCP server
with tool execution privileges in Claude Desktop, and ships a Tauri
desktop application as a signed binary. Each of these layers carries
its own class of risk, and we treat security reports across all of them
as a first-class concern.

This policy applies to the `skill/`, `mcp/`, and `app/` components and
to all official release artifacts.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security problems.**

Use one of the private channels below:

- **Email:** `magbusjap@gmail.com`
  Use a clear subject line, e.g. `[ToraSEO Security] SSRF in scan_site`.
  PGP encryption is welcome but not required at this time.
- **GitHub Security Advisories:**
  <https://github.com/Magbusjap/toraseo/security/advisories/new>
  This is the preferred channel — it creates a private discussion thread
  bound to this repository.

### What to include

A useful report contains, at minimum:

1. A short description of the vulnerability and the affected component
   (`skill`, `mcp`, `app`, or release artifact).
2. The version, commit hash, or release tag where the issue was found.
3. Steps to reproduce, ideally with a minimal proof of concept.
4. The potential impact if exploited (data exposure, RCE, SSRF, etc.).
5. Any suggested mitigation, if you have one in mind.

### What to expect

- We aim to acknowledge reports within **72 hours**.
- We will keep you informed of progress while a fix is being prepared.
- We follow **responsible disclosure**: we ask that you do not publish
  details until a fix is released or a coordinated disclosure date is
  agreed upon.
- Once a fix ships, we credit the reporter in the advisory and in
  `THANKYOU.md` — unless they request to remain anonymous.

We do **not** currently run a paid bug bounty program. Recognition is
in the changelog and in the security contributors list.

## Scope

In scope:

- Vulnerabilities in any code in this repository (`skill/`, `mcp/`,
  `app/`, `scripts/`).
- Vulnerabilities in official release artifacts published from this
  repository.
- Default configurations shipped with ToraSEO.

Out of scope:

- Issues in third-party services we integrate with (Google PageSpeed
  API, Yandex Webmaster, Bing Webmaster) — please report those to the
  relevant vendor.
- Issues in Claude Desktop or the Anthropic MCP runtime itself —
  please report those to Anthropic.
- Vulnerabilities that require an attacker to already have full local
  access to the user's machine, unless they enable privilege escalation
  beyond what local access already grants.
- Self-XSS or social-engineering scenarios where the attacker convinces
  the victim to paste malicious input into their own client.

## Threat Model

ToraSEO has three components, each with a distinct attack surface.
Reports are most useful when they identify which surface is involved.

### Crawler / MCP HTTP layer

The MCP server makes outbound HTTP requests on behalf of the user. The
classes of issue we are most concerned about:

- **SSRF (Server-Side Request Forgery)** — a crafted URL that causes
  the MCP server to fetch internal-network resources, cloud metadata
  endpoints (`169.254.169.254`), or `localhost` services.
- **Resource exhaustion** — URLs or response bodies designed to consume
  unbounded memory, file handles, or wall-clock time (zip bombs,
  decompression bombs, infinite redirects).
- **TLS / hostname validation bypass** — anything that lets a hostile
  network position downgrade or spoof a target server.
- **Bypass of crawling limits** — paths that defeat the rate limiter,
  the page cap, or the robots.txt check defined in
  [`CRAWLING_POLICY.md`](CRAWLING_POLICY.md).

### MCP tool surface

The MCP server exposes tools that Claude can invoke. Because the tool
arguments are produced by an LLM acting on user input, classic input
validation matters here in ways it would not in a normal CLI:

- **Argument injection** — tool arguments that escape into shell
  commands, SQL, file paths, or other subprocess invocations.
- **Path traversal** — any tool argument that resolves outside the
  intended sandbox directory.
- **Prompt injection escalation** — content fetched from a target site
  that, when summarized back to Claude, causes Claude to invoke
  privileged tools the user did not authorize. We treat MCP tool
  outputs as untrusted data; reports showing a path from web content
  to unauthorized tool use are in scope.
- **State leakage between sessions** — any path where one chat
  session's state becomes visible to another.

### Tauri desktop application

- **WebSocket binding** — the local WebSocket bridge between the app
  and the MCP server should not be reachable by other processes or
  network hosts.
- **IPC abuse** — Tauri commands invoked from web content that should
  only be invoked by the trusted frontend bundle.
- **Update channel integrity** — anything that could let a third party
  serve a forged update to a running app.
- **Code-signing and supply chain** — issues with the way release
  binaries are built, signed, or distributed. If you find a
  discrepancy between the published checksum and a downloaded
  artifact, treat it as a security issue and report it.

## Secure Defaults

ToraSEO ships with conservative defaults. Reports of a *secure default
being weakened by a config option* are considered a hardening request
rather than a vulnerability, but we still want to hear about them.

- robots.txt is honored by default; disabling it requires explicit user
  action and is gated behind the Owner-mode tier described in
  [`CRAWLING_POLICY.md`](CRAWLING_POLICY.md).
- Outbound requests have a default timeout, body-size cap, and redirect
  cap.
- The User-Agent identifies ToraSEO honestly and links to this
  repository; we do not spoof.
- The local WebSocket bridge binds to `127.0.0.1` only.
- Release binaries are built from tagged commits and their checksums
  are published alongside the release.

## Why These Defaults Are Strict

The defaults above are not chosen because any single law requires them.
They reflect an industry consensus, accumulated over three decades of
operating crawlers on the open web, about what a well-behaved bot
looks like. The short version:

- **The Robots Exclusion Protocol (robots.txt) was formalized as
  [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) in September
  2022**, co-authored by Martijn Koster and engineers from Google.
  Before formalization it was a de-facto standard followed by every
  major search engine; after formalization it is an IETF Proposed
  Standard. ToraSEO honors it because the entire crawler ecosystem
  — Googlebot, Bingbot, Yandexbot, AhrefsBot, SemrushBot — honors it.
  A new entrant that ignores robots.txt does not save effort; it
  signals to operators, network defenders, and prospective employers
  of its author that the project is not a serious tool.

- **Honest User-Agent identification** is the second pillar of that
  consensus. Cloud providers, CDNs, and bot-management vendors
  (Cloudflare, Akamai, Imperva, DataDome) maintain shared reputation
  signals about crawlers. A tool that identifies itself with a contact
  URL and stable token can be allow-listed when operators trust it,
  rate-limited when they want to slow it down, and cleanly blocked
  when they do not want it at all. A tool that spoofs a browser or
  rotates User-Agents to look like Googlebot ends up on the same
  reputation lists as malware.

- **Rate limits and per-host budgets** exist because making a request
  to someone else's server costs them resources. The cost is small
  per request; it stops being small at scale. Every public crawling
  policy that takes itself seriously — Common Crawl, Internet Archive,
  the major search engines — publishes some version of "this is how
  often we hit you, this is how to slow us down, this is who to
  contact." ToraSEO follows the same shape because that is what
  treats the open web as a shared resource rather than something to
  be extracted from.

- **"What ToraSEO does not do" is itself the differentiator.**
  Several SEO and scraping tools have, over the years, become
  liabilities for the people who built them or used them — through
  blocklisting, vendor litigation, or sustained reputation damage.
  We do not enumerate cases here, but the lesson is clear in retrospect:
  the line between "clever scraper" and "hostile crawler" is drawn
  by operators, not by the tool's author. ToraSEO stays on the right
  side of that line by default, and contributors are asked to keep
  it there.

Reports that propose loosening any of the defaults above will be
treated as design questions, not as patches; they are answered in
[`CRAWLING_POLICY.md`](CRAWLING_POLICY.md).

## For Contributors

If you are submitting a pull request that touches network code, MCP
tools, or Tauri IPC, please confirm in the PR description that you
considered the relevant section of this document. Reviewers will ask.

A non-exhaustive checklist:

- New MCP tools validate every argument before use.
- New crawler code respects the rate limiter and page cap.
- New IPC handlers check the calling context.
- New release-pipeline changes preserve checksum publication.

## Security Contributors

We are grateful to everyone who helps keep ToraSEO safe.

> _This list will populate as reports are resolved. Reporters are
> credited here unless they ask to remain anonymous._

---

_Last reviewed: 2026-04-25_
