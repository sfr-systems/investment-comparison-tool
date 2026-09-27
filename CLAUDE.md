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
- Project (#/project/:id): settings bar at top, then strategies in a vertical stacked list. A Duplicate button (top right) copies the project with fresh ids as "Name (copy)" and opens it.

## Project settings (top of project page; changes recalc everything live)
- Discount rate (%, default 7), used for all PV calculations
- Standard S&P 500 return (%, default 12)
- Standard loan interest rate (%, default 5)
- Default timespan (years, default 15)

## Strategy
Editable title; add/delete sub groups. Reorder with up/down arrows on the container's left edge (shown on hover/focus). Clicking anywhere on the header (except the title input and buttons) collapses/expands it.

## Sub group
Editable title; add/delete opportunities.
Footer: PV subtotal per individual (plus "Unassigned"), then the sub group's total PV.

## Opportunity inputs
- Title
- Risk: [Low | Neutral | High] toggle, default Neutral
- Individual (free text, suggestions from names already used in the project)
- Timespan n: [Default | Custom | Indefinite]. New opportunities use Default, which stays linked to the project's default timespan; Custom takes its own years (integer ≥ 1); Indefinite = perpetuity (n → ∞)
- Loan amount + loan interest rate
- Initial investment + growth rate
- Initial payout (one-time), paid at start + option to invest it for the timespan at a growth rate
- Yearly return + growth rate
- Final payout (one-time), paid at end
- Yearly salary + yearly increase with a [% | #] toggle (percentage or fixed dollar amount, default %),
  optional salary cap (enabled only with an increase > 0),
  and "invest some or all salary at the end of each year" → % invested + growth rate, with a timing note
Every rate field has a selector: [S&P 500 | Standard loan | Custom % | None].
Standard options stay linked to the project value (update when it changes).
Display the opportunity's PV.

## PV math (put in its own Calculator class; d = discount rate, t = 1..n)
- Initial investment I, growth g:  −I + I(1+g)^n / (1+d)^n
- Yearly return R, growth g:       Σ R(1+g)^(t−1) / (1+d)^t
- Yearly salary S, increase g:     pay_t = min(S(1+g)^(t−1), max(cap, S)) (cap only when g > 0);
                                   fixed $ increase k instead: pay_t = min(max(0, S + k(t−1)), max(cap, S)) (cap only when k > 0);
                                   kept Σ (1−p)·pay_t / (1+d)^t + invested Σ p·pay_t(1+gi)^(n−t) / (1+d)^n
                                   (p = share invested at year end, gi = its growth; no growth in the year earned)
- Initial payout P0 (one-time, paid at start): +P0; if invested at g for the timespan: P0(1+g)^n / (1+d)^n
- Final payout P (one-time):       P / (1+d)^n
- Loan L at rate r:                −Σ A / (1+d)^t (repayments only; the borrowed cash is assumed spent on the
                                   opportunity, so it isn't a gain), where A = level annual payment
                                   amortizing L over n years at r (A = L/n if r = 0)
- Indefinite timespan (n → ∞): entered growth rates are disabled so PV stays finite. One-time amounts grow at d
  (initial investment → 0, invested initial payout → P); yearly return/salary have no growth (constant perpetuity R/d);
  final payout 0 (never received); loan −L·r/d (interest-only forever; 0 at 0%). Only a discount rate ≤ 0 can
  still make PV unbounded (shown as ±∞ with an explanation). The card shows a note explaining the fixed rates.
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
- Calculator tests: `node js/tests/calculator.test.mjs`; display rounding tests: `node js/tests/format.test.mjs`; risk tests: `node js/tests/risk.test.mjs`
- Rates are stored as `{ mode: 'sp500' | 'loan' | 'custom' | 'none', custom: <percent> }` and resolved against project settings at calc time, so standard options stay linked.
- Persistence goes through `Storage`, which wraps an adapter (`LocalStorageAdapter`). Swap the adapter for a backend later.
- Styling: tokens in `css/styles.css` `:root` (light + dark). Fonts Inter + Source Serif 4 load from Google Fonts and fall back to system fonts offline. Icons are inline SVGs via `icon()` in `js/format.js`.
- Theme: `<html data-theme="light|dark">`. `js/theme-init.js` (classic script in `<head>`) sets it before paint; `ThemeToggle` switches it and saves the choice via `Storage.setPreference("theme")`. With no saved choice it follows the OS setting.
- New visitors get a "Career Options" sample (`js/SampleProject.js`), seeded once on first load (pref `sampleSeeded`); the empty project list offers "Load sample project".
- Assumption notes (S&P and prime-rate 15-yr averages, current prime rate, Treasury yield) live in `js/referenceRates.js`. They are display-only; refresh the figures and `asOf` date periodically.
- Strategies show a beacon: a Roman numeral + named color (`js/Beacon.js`) used only as a visual/spoken reference. It is positional (I, II, III… in list order) and not stored; the 7 colors (Azure, Violet, Hot pink, Cyan, Slate, Indigo, Plum; never the green/amber/red risk colors) cycle after VII.
- PV display: amounts are rounded for readability (`formatPV` in `js/format.js`: nearest power of ten ≤ 0.1% of the value; whole dollars once that step ≥ $1), with the exact value on hover. Only each sub group's "Sub group total" row shows the exact amount.
- Risk: `js/Risk.js` holds the opportunity toggle, gauge icon and aggregates. Sub group / strategy risk = average of Low 0 / Neutral 1 / High 2 weighted by each opportunity's |PV| (equal weights if all PVs are 0): < 2/3 Low, > 4/3 High, else Neutral. The gauge needle shows the weighted average; the bar shows each level's share of value.
- Cash-flow chart: `js/CashFlowChart.js`, above each opportunity's PV footer, only for timespans ≤ 20 years (a note otherwise). One column per year (plus year 0 "start" when something is received then): income sources stacked, and loan repayments as a positive pink bar to the right (only when there's a loan, so bars are wider without one). The initial investment paid in isn't charted. Invested salary is spread over the years as each year's contribution plus that year's growth on earlier contributions (not one lump at year n). Likewise an invested initial payout shows at the start (year 0) and then its growth each year, in the same color. Growth series (invested salary growth, initial payout growth) are diagonal stripes of their source's color and that color at 75% opacity; the source amount is solid. Data from `Calculator.yearlyCashFlows` (amounts as received; the [Received | PV] toggle, saved as `opp.chartMode`, discounts each year's amounts; the Cumulative button, saved as `opp.chartCumulative`, shows running totals per source). Series colors are `--cf-*` tokens in `css/styles.css`. At rest it shows only bars: axis labels, legend and the toggle appear while the card is hovered/focused, and the y-axis column animates open (always shown on touch screens without hover). An expand button beside the toggle opens a large copy (`new CashFlowChart(opp, ctx, { expanded: true })`) in a native `<dialog>`; closing it (×, Esc, backdrop) re-syncs the card's chart.
- Sub group totals: "Present value by [Individual | Opportunity]" toggle (saved as `sg.totalsBy`, default individual). By opportunity lists each one in card order; unnamed ones (blank or the default "New Opportunity") are labeled "New Opportunity 1, 2…" when there's more than one (`Models.opportunityLabels`; titles aren't changed).
