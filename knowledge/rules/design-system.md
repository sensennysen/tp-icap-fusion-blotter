# Design System

No Figma export exists for this project (`ARCH.md` §11/§13). This is the token set decided
during `/scaffold` PLAN in its place — Tailwind v4, defined in `frontend/src/globals.css` via
`@theme`.

## Colors

| Token                              | Value                                   | Use                                  | Contrast                |
| ---------------------------------- | --------------------------------------- | ------------------------------------ | ----------------------- |
| `--color-buy` / `--color-buy-bg`   | `hsl(142 71% 28%)` / `hsl(142 71% 95%)` | BUY side badge                       | 5.0:1 (buy on buy-bg)   |
| `--color-sell` / `--color-sell-bg` | `hsl(0 72% 45%)` / `hsl(0 72% 96%)`     | SELL side badge, destructive actions | 5.1:1 (sell on sell-bg) |
| `--color-cancelled`                | `hsl(220 9% 55%)`                       | reserved for cancelled-state accents | —                       |
| `--color-toast-info`               | `hsl(217 91% 50%)`                      | real-time event received             | 5.1:1 (white text)      |
| `--color-toast-success`            | `hsl(142 71% 28%)`                      | mutation success                     | 5.4:1 (white text)      |
| `--color-toast-error`              | `hsl(0 72% 45%)`                        | mutation failure                     | 5.8:1 (white text)      |
| `--color-toast-connection`         | `hsl(38 92% 30%)`                       | connection lost/restored             | 5.4:1 (white text)      |

Every foreground/background pairing above was checked against WCAG AA (≥4.5:1 for the
text sizes actually used — badges and toasts are ≤14px, so the "large text" 3:1 exception
doesn't apply). The lightness values are deliberately darker than a typical illustrative
palette for this reason — don't lighten them without re-checking contrast.

Tailwind auto-generates utilities from these (`bg-buy`, `text-sell`, `bg-toast-error`, etc.) — see
`frontend/src/globals.css`.

## States

- Cancelled rows: `opacity-50` on the table row (`TradeGrid.tsx`), not a separate color — keeps
  side-color badges legible while visually deprioritizing the row.
- Row actions (Amend/Cancel) are hidden entirely once a trade is `CANCELLED`, rather than disabled,
  since there is nothing a cancelled trade can still be amended into.

## Icons

`lucide-react`, 16–18px. Icons are `<svg>` and render block-level under Tailwind's preflight —
center them with flex layout or `mx-auto`, never a parent's `text-align: center`.

## Layout

Single page, desktop-oriented (this is a trading tool; no mobile breakpoint spec was given).
Toolbar (filters + New Trade + Refresh) above the grid; modals for create/amend; an inline
confirm dialog for cancel; a fixed bottom-right toast stack for async/real-time feedback.
Toasts auto-dismiss after 5s, each has a close button (`Dismiss notification`), the stack
keeps the newest 5, and error toasts use `role="alert"` (others `role="status"`).
