# ToraSEO Design System

> The design system for ToraSEO desktop app. Single source of truth
> for color, typography, spacing, and component conventions.
>
> Before changing or adding UI: read this document, use existing
> tokens, only introduce new ones with justification (see
> [Adding new tokens](#adding-new-tokens)).

**Stack:** React + Tailwind CSS (utility-first) + custom tokens.
**Architecture:** component-driven — composition in JSX, not CSS
cascade. Tokens live in `app/tailwind.config.js`. ITCSS does not
apply — see `wiki/meta/session-conventions.md` for the rationale.

---

## Table of contents

1. [Color palette](#1-color-palette)
2. [Typography](#2-typography)
3. [Spacing](#3-spacing)
4. [Border radius](#4-border-radius)
5. [Component patterns](#5-component-patterns)
6. [Status system](#6-status-system)
7. [Mascot integration](#7-mascot-integration)
8. [Accessibility baseline](#8-accessibility-baseline)
9. [Adding new tokens](#9-adding-new-tokens)
10. [Token changelog](#10-token-changelog)

---

## 1. Color palette

The brand palette has six core colors plus a status palette for UI
state indicators. All are defined in `app/tailwind.config.js` under
`theme.extend.colors`.

### Brand colors

| Token | Hex | Role |
|---|---|---|
| `primary` | `#FF6B35` | Brand orange. CTAs, active states, accents, mascot stroke. |
| `outline` / `outline-900` | `#1A0F08` | Dark text and outline strokes. The `Tora` half of the wordmark. |
| `outline-800` | `#2B1D14` | Slightly lighter outline shade for secondary strokes. |
| `surface` / `surface-900` | `#352922` | Warm dark used for sidebars, panels, drawers. Reads as "in palette" rather than pure black. |
| `surface-800` | `#42332A` | Hover/active variant of `surface`. |
| `accent` | `#FFB800` | Gold for champion state, highlights, sparkles. |
| `ear` | `#FFB8A0` | Mascot ear inner color. |
| `white` | `#FFFFFF` | Backgrounds (toolbar, modals, cards), reverse text on dark. |

`primary` has a full shade scale for hover/active variants:

| Token | Hex | Role |
|---|---|---|
| `primary-50` | `#FFF1EC` | Lightest tint. Almost-white surfaces with brand hint. |
| `primary-100` | `#FFDDD0` | Light tint. Hover backgrounds on cream surfaces. |
| `primary-400` | `#FF8E63` | Lighter than DEFAULT. Less common, future use. |
| `primary-500` / `primary` | `#FF6B35` | Default brand orange. |
| `primary-600` | `#E5501A` | Darker. Hover state on `bg-primary` buttons. |
| `primary-700` | `#B83C0E` | Darkest. Active/pressed state. |

### Status colors

For UI state indicators (mascot status dot, stage row icons, etc.):

| Token | Hex | Role |
|---|---|---|
| `status-idle` | `#9CA3AF` | Neutral gray. App is inactive. |
| `status-ready` | `#FACC15` | Yellow. Ready for a scan. |
| `status-working` | `#3B82F6` | Blue. Scan in progress. |
| `status-complete` | `#22C55E` | Green. Scan finished, no issues. |
| `status-issues` | `#F97316` | Orange. Scan finished with warnings/critical. Also used for invalid form fields. |
| `status-champion` | `#FFB800` | Gold (= `accent`). Top-tier result. Reserved for v0.2+. |

### Background context

Two main background contexts in the app:

**Cream surface** — `bg-orange-50/30` (the kreemovy main area).
Used in: top-level app shell, main content area, modal backdrops.
On this surface, text is `outline-900` and components are `bg-white`.

**Dark surface** — `bg-surface` (#352922).
Used in: all sidebars (Idle, Active, Settings, onboarding-locked).
On this surface, text is `text-white` (primary) or `text-white/70`
(secondary), borders/dividers are `border-white/10`, inputs are
`bg-white/5 border-white/15`, hover states are `hover:bg-white/5`.

The two surfaces are deliberately mirrored — the same component
class set works on either, just with inverted color references.

### What NOT to do

- Don't use raw hex codes in JSX: `style={{ color: "#FF6B35" }}` →
  use `text-primary` instead.
- Don't introduce new colors per-component. If you need a shade
  that doesn't exist, [add a token](#adding-new-tokens) first.
- Don't blend brand colors via opacity over arbitrary backgrounds
  (e.g., `bg-outline-900/85`). The result depends on what's
  underneath, which is fragile across themes. Use a dedicated
  token instead — that's why `surface` exists separately from
  `outline`.
- Don't use `bg-black` or `bg-gray-900`. They're not in the
  palette and read as cold/generic against the warm brand
  identity.

---

## 2. Typography

Three font stacks defined in `tailwind.config.js`:

| Stack | Tailwind class | Use |
|---|---|---|
| Display | `font-display` | Headings, app name, mascot dialogue |
| Body | `font-body` | Default. UI text, paragraphs, labels |
| Mono | `font-mono` | Version numbers, file paths, code |

All three start with `-apple-system, BlinkMacSystemFont` so the OS
picks its native UI font. Windows gets Segoe UI, macOS gets SF Pro,
Linux gets the desktop default. Nothing is bundled — keeps installer
size lean and respects user accessibility settings.

### Type scale

Use Tailwind's default scale. The most-used sizes:

| Class | Size | Use |
|---|---|---|
| `text-xs` | 12px | Labels, footers, metadata, tooltips |
| `text-sm` | 14px | Body default, button labels, sidebar items |
| `text-base` | 16px | Section headings inside content |
| `text-lg` | 18px | Card titles, modal subtitles |
| `text-xl` | 20px | Settings page headings |
| `text-2xl` | 24px | Main app heading on home screen |

### Weight

`font-medium` (500), `font-semibold` (600), `font-bold` (700) are
the three weights in active use. Avoid `font-light` and
`font-extrabold` — they read off-tone for a utility app.

### Letter spacing

Two non-default spacings used:

- `tracking-wider` — uppercase labels, section headers in sidebar
- `tracking-[0.15em]` — section dividers like `— PROJECT —`

---

## 3. Spacing

Tailwind's default 4px base scale. Common values:

| Class | Pixels | Use |
|---|---|---|
| `gap-1` / `p-1` | 4px | Tight inline groups (icon + label) |
| `gap-2` / `p-2` | 8px | Form rows, button content |
| `gap-3` / `p-3` | 12px | Card content, list items |
| `gap-4` / `p-4` | 16px | Sidebar padding, default block spacing |
| `gap-5` / `p-5` | 20px | Modal content padding |
| `gap-6` / `p-6` | 24px | Section spacing, card padding |
| `gap-8` / `p-8` | 32px | Main area padding |

For specific layout dimensions:

- **Sidebar width:** `w-[260px]` — fixed, never resizes
- **Toolbar height:** `h-9` (36px) — thin top bar
- **Modal max width:** `w-[420px] max-w-[90vw]` — comfortable for
  forms, capped on small windows
- **Content max width:** `max-w-2xl` (672px) — for prose-heavy
  pages like Settings tabs and SiteAuditView body

---

## 4. Border radius

| Class | Pixels | Use |
|---|---|---|
| `rounded` | 4px | Inline tags, small chips |
| `rounded-md` | 6px | Buttons, inputs, list items |
| `rounded-lg` | 8px | Cards, modals, callouts |
| `rounded-full` | 9999 | Status dots, avatar |

`rounded-xl` and above are reserved for special cases (hero cards,
illustrated panels) — don't use casually.

---

## 5. Component patterns

The patterns below are the "canonical" implementations. New
components should match these rather than invent variations.

### 5.1 Buttons

**Primary CTA** (Scan, Save, Install):
```tsx
className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white
           transition hover:bg-primary-600
           disabled:cursor-not-allowed disabled:bg-outline-900/20"
```

On dark surface (`bg-surface`), the disabled variant changes:
```tsx
disabled:bg-white/10 disabled:text-white/40
```

**Secondary** (Cancel, Later, Discard):
```tsx
className="rounded-md border border-outline/20 px-3 py-2 text-sm
           text-outline/70 transition hover:bg-orange-50"
```

**Ghost / toolbar item:**
```tsx
className="flex items-center gap-1.5 rounded px-2 py-1 text-xs
           text-outline-900/70 transition
           hover:bg-orange-50 hover:text-outline-900
           disabled:cursor-not-allowed disabled:opacity-50"
```

### 5.2 Inputs

**On cream surface** (form inside white cards):
```tsx
className="w-full rounded-md border border-outline/15 bg-white py-2 px-3
           text-sm text-outline-900 transition
           placeholder:text-outline-900/30
           focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
           disabled:bg-orange-50/50 disabled:opacity-60"
```

**On dark surface** (sidebar inputs):
```tsx
className="w-full rounded-md border border-white/15 bg-white/5 py-2 px-3
           text-sm text-white transition
           placeholder:text-white/30
           focus:border-primary focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary/40
           disabled:opacity-50"
```

The dark variant uses `bg-white/5` (5% white over the surface) for
the resting state, deepens to `bg-white/10` on focus. The focus ring
opacity bumps from `/20` to `/40` for stronger contrast on dark.

### 5.3 Checkboxes (native, with brand styling)

**On cream:**
```tsx
className="h-4 w-4 cursor-pointer rounded border-outline/30
           text-primary accent-primary
           focus:ring-2 focus:ring-primary/20"
```

**On dark:**
```tsx
className="h-4 w-4 cursor-pointer rounded border-white/30 bg-white/5
           text-primary accent-primary
           focus:ring-2 focus:ring-primary/40"
```

`accent-primary` is the modern way to colorize native form
controls — preferred over building a custom component for v0.0.x.

### 5.4 Cards

**On cream:**
```tsx
className="rounded-lg border border-outline/10 bg-white p-5"
```

**On dark:** dark surface itself acts as the card; use
`border-white/10` dividers instead.

### 5.5 Modals

```tsx
// Backdrop
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
     onClick={onClose}>

  // Body
  <div className="relative w-[420px] max-w-[90vw] rounded-lg
                  border border-outline/15 bg-white p-5 shadow-xl"
       onClick={(e) => e.stopPropagation()}>
    ...
  </div>
</div>
```

Backdrop click and X-button close. Esc key support is a
nice-to-have, not required for v0.0.x.

### 5.6 Sidebar

All four sidebar variants (Idle, Active, Settings,
onboarding-locked) share the same surface:

```tsx
className="bg-surface text-white"
```

Internal text hierarchy:
- Primary text: `text-white`
- Secondary text: `text-white/70`
- Muted/section labels: `text-white/50`
- Disabled placeholder: `text-white/30`
- Borders/dividers: `border-white/10`

### 5.7 Status dot

```tsx
<span
  className={`h-2.5 w-2.5 rounded-full bg-status-${status}`}
  aria-hidden="true"
/>
```

Use the `bg-status-*` token directly. Don't shorten to a single
"colored dot" component — the dot pattern is small and inline,
abstraction adds friction.

### 5.8 Toast (top-center)

For ephemeral feedback (e.g., "Update found"):

```tsx
<div className="fixed left-1/2 top-12 z-40 -translate-x-1/2
                rounded-md border border-outline/15 bg-white px-3 py-2
                text-xs text-outline-900 shadow-md"
     role="status">
  {message}
</div>
```

Pre-flight error toast uses `top-16` instead of `top-12` to avoid
collision with the toolbar's update toast at `top-12`.

### 5.9 Notification card (bottom-right)

Used by the auto-updater for non-blocking lifecycle feedback:

```tsx
<div className="fixed bottom-6 right-6 z-50 w-[340px] rounded-lg
                border border-outline/15 bg-white p-4 shadow-lg"
     role="status" aria-live="polite">
  ...
</div>
```

`role="status"` + `aria-live="polite"` = screen readers announce
the message but don't interrupt current focus.

---

## 6. Status system

Six status states drive the mascot pose, status dot color, and
sometimes UI strings. Defined in `private/UIDesign.md` §3 with
the full state machine; the table below is the practical reference:

| State | Mascot pose | Dot color | When |
|---|---|---|---|
| Idle | Sleeping | `status-idle` | App opened, no scan started |
| Ready | Neutral | `status-ready` | Mode selected, ready to scan |
| Working | Focused | `status-working` | Scan in progress |
| Complete | Happy | `status-complete` | Scan done, no issues |
| Issues | Surprised | `status-issues` | Scan done with warnings/critical |
| Champion | Champion | `status-champion` (gold) | Top-tier result. v0.2+ |

The mascot SVG itself lives in `branding/mascots/`. The component
wrapper (`SleepingMascot`, future `Mascot`) loads the SVG via the
`@branding` Vite alias — single source of truth.

---

## 7. Mascot integration

The mascot is the **primary status indicator** — colored dot is
secondary. Mascot poses live as separate SVG files in
`branding/mascots/`:

- `tora-sleeping.svg`
- `tora-neutral.svg`
- `tora-focused.svg`
- `tora-happy.svg`
- `tora-surprised.svg`
- `tora-champion.svg`

Loaded in components via:

```tsx
import sleepingMascot from "@branding/mascots/tora-sleeping.svg";
```

Sizing:
- Home screen hero: `h-40 w-40` (160px)
- SiteAuditView header: `h-32 w-32` (128px)
- Future inline mascot in toasts/cards: `h-8 w-8` (32px)

Always `draggable={false}` on the `<img>` — prevents accidental
drag-out on Windows.

---

## 8. Accessibility baseline

v0.0.x targets a **basic** baseline, not full WCAG audit (Phase 3).
What we do today:

- All interactive elements have `aria-label` when icon-only
- Status indicators have `aria-hidden="true"` on the visual dot
  and the meaning in adjacent text
- Modals have `role="dialog" aria-modal="true"
  aria-labelledby="..."` on the title
- Live regions: toast and notification card use
  `role="status" aria-live="polite"`
- Focus rings via Tailwind `focus:ring-*` are not removed
- Native form controls (checkbox, select) get OS-styled focus +
  custom ring on top via `accent-primary` and `focus:ring-primary/*`

Not yet (Phase 3):
- Full keyboard shortcut map
- Esc-to-close on modals
- Skip-to-content link
- Color-contrast audit (current palette is close to WCAG AA on
  the cream surface; on dark surface, `text-white/30` placeholders
  are below AA — acceptable for placeholder-only)
- Screen reader landmark roles beyond `role="banner"` on the
  toolbar

---

## 9. Adding new tokens

When you need a color/spacing/font value that doesn't exist:

1. **Justify it.** A new token must fill a role no existing token
   covers. "Slightly different orange for this one button" is not
   a justification — use `primary-400` or `primary-600` instead.
2. **Add to `tailwind.config.js`.** Place it under
   `theme.extend.colors` (or `spacing`, `fontFamily`, etc.) with
   a comment explaining the role.
3. **Document here.** Add a row to the relevant section above.
   Update the [Token changelog](#token-changelog) at the bottom.
4. **Use it.** Components reference the token via the Tailwind
   class — never inline the hex.
5. **If it makes other tokens obsolete** — remove them in the
   same change. Don't leave parallel tokens for the same role.

For colors specifically: shades in a scale (50/100/400/500/600/700)
are not "new tokens" requiring justification — they're variations
of an existing token. Add them freely as needed.

---

## 10. Token changelog

History of palette evolution. Newest at top.

### v0.0.6 — surface

Added: `surface` color token (#352922) with shade scale
(DEFAULT/900/800).

Reason: sidebars previously used `bg-outline-900/85` which produced
a warm-dark blend over the cream main area. The result was correct
visually but fragile — any change to the parent background would
shift the sidebar's apparent color. `surface` makes the
warm-dark-panel role explicit and reusable for future drawers,
dropdowns, modals on dark.

`outline-900` retains its role for text and outline strokes only.

### v0.0.0 — initial palette

The six brand colors (primary, outline, white, accent, ear, plus
status palette) were defined alongside the brand book and
mascot illustrations. See `branding/compositions/tora-palette-en.svg`
for the canonical visual reference.

---

_This document evolves with the palette. When in doubt, this file
is the source of truth — `private/UIDesign.md` has more reasoning
behind decisions but is internal._
