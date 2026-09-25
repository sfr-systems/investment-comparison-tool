Build a local, no-build-step web app: an investment strategy comparison tool.
Vanilla JavaScript (ES6 classes + ES modules), HTML, CSS. No frameworks, no npm dependencies.

## Setup
- First, save this spec to CLAUDE.md.
- Structure: index.html, css/styles.css, and ALL JavaScript in js/ (one class per file where sensible).
- Serve with `python3 -m http.server 8000` (ES modules need a server), then open http://localhost:8000.
- Persist data in localStorage via a single Storage class. No user accounts yet, but keep persistence swappable for a backend/auth later.

## Data model
Project → Strategy[] → SubGroup[] → Opportunity[]

## Pages (hash routing)
- Home (#/): project list, "New Project" (optional name, default "Untitled Project"), open, delete. A project is required before anything else.
- Project (#/project/:id): settings bar at top, then strategies in a vertical stacked list.

## Project settings (top of project page; changes recalc everything live)
- Discount rate (%), used for all PV calculations
- Standard S&P 500 return (%, default 12)
- Standard loan interest rate (%, default 5)
- Default timespan (years, default 15)

## Strategy
Editable title; add/delete sub groups.

## Sub group
Editable title; add/delete opportunities.
Footer: PV subtotal per individual (plus "Unassigned"), then the sub group's total PV.

## Opportunity inputs
- Title
- Individual (free text, suggestions from names already used in the project)
- Timespan n: [Default | Custom]. New opportunities use Default, which stays linked to the project's default timespan; Custom takes its own years (integer ≥ 1)
- Loan amount + loan interest rate
- Initial investment + growth rate
- Initial payout (one-time), paid at start + option to invest it for the timespan at a growth rate
- Yearly return + growth rate
- Yearly salary + growth rate
- Final payout (one-time), paid at end
Every rate field has a selector: [S&P 500 | Standard loan | Custom % | None].
Standard options stay linked to the project value (update when it changes).
Display the opportunity's PV.

## PV math (put in its own Calculator class; d = discount rate, t = 1..n)
- Initial investment I, growth g:  −I + I(1+g)^n / (1+d)^n
- Yearly return R, growth g:       Σ R(1+g)^(t−1) / (1+d)^t
- Yearly salary S, growth g:       Σ S(1+g)^(t−1) / (1+d)^t
- Initial payout P0 (one-time, paid at start): +P0; if invested at g for the timespan: P0(1+g)^n / (1+d)^n
- Final payout P (one-time):       P / (1+d)^n
- Loan L at rate r:                +L − Σ A / (1+d)^t, where A = level annual payment
                                   amortizing L over n years at r (A = L/n if r = 0)
- Opportunity PV = sum of the above. Format as USD.

## UI
Clean and responsive; collapsible strategies and sub groups; confirm before deletes;
validate inputs (non-negative amounts, n ≥ 1).

## Working style
- Show a brief plan (file list + class outline), then build without further check-ins.
- Verify Calculator against 2–3 hand-computed examples.
- Don't paste full file contents into chat. Finish with a ≤10-line summary and the run command.

## Implementation notes
- Run: `python3 -m http.server 8000` → http://localhost:8000
- Calculator tests: `node js/tests/calculator.test.mjs`
- Rates are stored as `{ mode: 'sp500' | 'loan' | 'custom' | 'none', custom: <percent> }` and resolved against project settings at calc time, so standard options stay linked.
- Persistence goes through `Storage`, which wraps an adapter (`LocalStorageAdapter`). Swap the adapter for a backend later.
- Styling: tokens in `css/styles.css` `:root` (light + dark). Fonts Inter + Source Serif 4 load from Google Fonts and fall back to system fonts offline. Icons are inline SVGs via `icon()` in `js/format.js`.
- Theme: `<html data-theme="light|dark">`. `js/theme-init.js` (classic script in `<head>`) sets it before paint; `ThemeToggle` switches it and saves the choice via `Storage.setPreference("theme")`. With no saved choice it follows the OS setting.
- New visitors get a "Career Options" sample (`js/SampleProject.js`), seeded once on first load (pref `sampleSeeded`); the empty project list offers "Load sample project".
- Assumption notes (S&P 15-yr average, prime rate, Treasury yield) live in `js/referenceRates.js`. They are display-only; refresh the figures and `asOf` date periodically.
- Strategies show a beacon: a Roman numeral + named color (`js/Beacon.js`) used only as a visual/spoken reference. It is positional (I, II, III… in list order) and not stored; the 10 colors cycle after X.
