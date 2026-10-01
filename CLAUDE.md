Build a local, no-build-step web app: an investment strategy comparison tool.
Vanilla JavaScript (ES6 classes + ES modules), HTML, CSS. No frameworks, no npm dependencies.

## Setup
- First, save this spec to CLAUDE.md.
- Structure: index.html, css/styles.css, and ALL JavaScript in js/ (one class per file where sensible).
  The one exception is the cloud-sync Vercel Function, which Vercel requires in api/ (api/sync.mjs).
- Serve with `python3 -m http.server 8000` (ES modules need a server), then open http://localhost:8000.
- Persist data in localStorage via a single Storage class. No user accounts yet, but keep persistence swappable for a backend/auth later.
- Projects also sync across devices through a cloud copy (see "Cloud sync" below); localStorage stays the working copy.

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
- Below them, a row of switches:
  - "Include taxes" deducts federal and state taxes in every equation. Turning it on asks for the state of
    residence first (a dialog; a state picker then sits beside the switch).
  - "Show [Charts] [Yearly tables]" includes/excludes every income source's chart and yearly table.

## Strategy
Editable title; add/delete sub groups. A Duplicate button beside Delete (header, top right) inserts a copy just below with fresh ids, titled "Title (copy)" ("(copy 2)"… if taken; `Models.cloneStrategy`), then glides to it and flashes it. Reorder with a swap button centered in the gap between each pair of strategies (trades the two; both flash). Clicking anywhere on the header (except the title input and buttons) collapses/expands it.

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
- Yearly return, laid out like the yearly salary below: yearly increase [% | #], optional return cap,
  and "invest some or all returns at the end of each year" → % invested + growth rate, with a timing note
- Final payout (one-time), paid at end
- Yearly salary + yearly increase with a [% | #] toggle (percentage or fixed dollar amount, default %),
  optional salary cap (enabled only with an increase > 0),
  and "invest some or all salary at the end of each year" → % invested + growth rate, with a timing note
Every rate field has a selector: [S&P 500 | Standard loan | Custom % | None].
Standard options stay linked to the project value (update when it changes).
Display the opportunity's PV.

## PV math (put in its own Calculator class; d = discount rate, t = 1..n)
- Initial investment I, growth g:  −I + I(1+g)^n / (1+d)^n
- Yearly return R:                 same rules as yearly salary below (with R for S)
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
  (initial investment → 0, invested initial payout → P); yearly return/salary have no growth or cap (constant perpetuity R/d) and their invested shares grow at d;
  final payout 0 (never received); loan −L·r/d (interest-only forever; 0 at 0%). Only a discount rate ≤ 0 can
  still make PV unbounded (shown as ±∞ with an explanation). The card shows a note explaining the fixed rates.
- Taxes (when included): each year t = 0..n is taxed on its own, as if this income source were the individual's only
  income (single filer, standard deduction, `Tax` class with 2026 tables in `js/taxData.js`). Ordinary income: salary
  and yearly return in full (invested or not), initial payout at t = 0, final payout at n. Salary also pays Social
  Security (6.2% to the wage base) + Medicare (1.45%, +0.9% over $200k). Investments are cashed out at n: the gains
  (initial investment value − I, plus all growth on invested payout/salary/returns) are long-term capital gains,
  stacked on ordinary income at 0/15/20% federally; states tax them as ordinary income (Washington: gains only).
  Taxes PV = −Σ tax_t / (1+d)^t, split into federal income tax, Social Security & Medicare, and state tax.
  Indefinite: initial payout taxed at the start; yearly return + salary taxed the same every year (−tax/d); no gains.
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
- Calculator tests: `node js/tests/calculator.test.mjs`; tax tests: `node js/tests/tax.test.mjs`; display rounding tests: `node js/tests/format.test.mjs`; risk tests: `node js/tests/risk.test.mjs`; sync tests: `node js/tests/sync.test.mjs`
  (needs Node ≥ 22 to load js/*.js as ES modules without a package.json; on older Node, run from a copy that has `{"type":"module"}`)
- Rates are stored as `{ mode: 'sp500' | 'loan' | 'discount' | 'custom' | 'none', custom: <percent> }` and resolved against project settings at calc time, so standard options stay linked. "Discount rate" is offered only on growth-rate selectors (not the loan interest rate).
- Persistence goes through `Storage`, which wraps an adapter (`LocalStorageAdapter`). User edits go through `saveProject` (new `rev` + `updatedAt`); `storeProject`/`removeProject` write as-is for sync.
- Cloud sync (hosted on Vercel, auto-deployed from `main`): `api/sync.mjs` is a dependency-free Vercel Function storing one Upstash Redis hash (`ict:records`, field = project id) via the REST API. Needs env vars `SYNC_PASSPHRASE` plus `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`), which connecting an Upstash Redis store in Vercel adds. Each device enters the passphrase once; it stores only `SHA-256("ict-sync:" + passphrase)` (pref `syncKey`) and sends it as a Bearer token. 20 wrong tries per IP per 15 min → 429. `GET ?status` tells the app whether sync is set up (plain static servers like `python3 -m http.server` have no API, so the sync UI hides).
  - `ProjectSync` runs syncs (on load, focus/visibility, `online`, every 2 min while visible, ~1.5 s after edits, keepalive upload when the page is hidden); `SyncMerge.plan` decides per project. Versions are `rev`s (unique per save); `Storage` key `sync` keeps `{ base, deleted? }` per id. Uploads are accepted only if the cloud still has `base`, so a device can't overwrite changes it hasn't seen. Edited on two devices → the cloud version wins the original and this device's becomes "Name (conflicted copy)"; an edit beats a deletion. Deletions sync as markers.
  - Untouched sample projects (`sample: true`) never sync; the first edit (ProjectView save) or a duplicate clears the flag.
  - When a pull changes the open project, `App.onRemoteChange` re-mounts it (keeping scroll) with a toast; `isEditing` skips pulling a project with unsaved edits. UI: `SyncControl` (app-bar status button, dialog, project-list note, toasts).
- Styling: tokens in `css/styles.css` `:root` (light + dark). Fonts Inter + Source Serif 4 load from Google Fonts and fall back to system fonts offline. Icons are inline SVGs via `icon()` in `js/format.js`.
- Theme: `<html data-theme="light|dark">`. `js/theme-init.js` (classic script in `<head>`) sets it before paint; `ThemeToggle` switches it and saves the choice via `Storage.setPreference("theme")`. With no saved choice it follows the OS setting.
- New visitors get a "Career Options" sample (`js/SampleProject.js`), seeded once on first load (pref `sampleSeeded`); the empty project list offers "Load sample project".
- Assumption notes (S&P and prime-rate 15-yr averages, current prime rate, Treasury yield) live in `js/referenceRates.js`. They are display-only; refresh the figures and `asOf` date periodically.
- Strategies show a beacon: a Roman numeral + named color (`js/Beacon.js`) used only as a visual/spoken reference. It is positional (I, II, III… in list order) and not stored; the 7 colors (Azure, Violet, Hot pink, Cyan, Slate, Indigo, Plum; never the green/amber/red risk colors) cycle after VII.
- Strategy rail (`js/StrategyRail.js`): only with 2+ strategies on a page ≥ 2× the window height. A fixed column of beacon numerals in the left gutter, centered between the window edge and the content (16–96px from the content; desktop only: ≥ 1300px wide with a fine pointer); the strategy in focus (last one whose top passed a line ~30% down the area below the pinned settings bar, sliding to the bottom near the page end) is enlarged like its badge, the others are buttons that glide to their strategy's start (landing below the pinned bar); the line under each numeral fills as you read through that strategy; the title shows on hover. A barely-there glow on both side edges, strongest at mid-height (`.page-tint`, a registered `--tint` color so it cross-fades), in the focused strategy's color shows on all screen sizes.
- PV display: amounts are rounded for readability (`formatPV` in `js/format.js`: nearest power of ten ≤ 0.1% of the value; whole dollars once that step ≥ $1), with the exact value on hover. Only each sub group's "Sub group total" row shows the exact amount.
- Risk: `js/Risk.js` holds the opportunity toggle, gauge icon and aggregates. Sub group / strategy risk = average of Low 0 / Neutral 1 / High 2 weighted by each opportunity's |PV| (equal weights if all PVs are 0): < 2/3 Low, > 4/3 High, else Neutral. The gauge needle shows the weighted average; the bar shows each level's share of value.
- Taxes: `project.settings.taxes = { enabled, state }` (postal code). `js/taxData.js` holds the federal and per-state single-filer tables (IRS Rev. Proc. 2025-32, SSA wage base, Tax Foundation 2026 state table; local taxes and phase-outs aren't modeled); refresh it yearly with `TAX_YEAR`. `js/Tax.js` does one year's math; `Calculator.taxPV` / `yearlyTaxes` / `taxableIncome` apply it, from `Calculator.baseCashFlows` (pre-tax, undiscounted years 0..n). Breakdown keys `federalTax`, `payrollTax`, `stateTax` (0 when off). `js/ProjectOptions.js` renders the switches row and the state dialog.
- Display switches: `project.display = { charts, tables }` (both default true); hidden ones aren't redrawn (`OpportunityView.update`).
- Cash-flow chart: `js/CashFlowChart.js`, above each opportunity's PV footer, only for timespans ≤ 20 years (a note otherwise). One column per year (plus year 0 "start" when something is received then): income sources stacked, and deductions as a positive bar to the right: loan repayment (pink) then, when taxes are included, federal income tax, Social Security & Medicare and state tax (three steps of one slate hue, validated as an ordinal ramp; `--cf-*-tax`). The deductions bar shows only when there's a loan or taxes, so bars are wider without one. The initial investment paid in isn't charted. Invested salary and invested returns are spread over the years as each year's contribution plus that year's growth on earlier contributions (not one lump at year n). Likewise an invested initial payout shows at the start (year 0) and then its growth each year, in the same color. Stack order, bottom to top: salary, yearly return, final payout, initial payout, investment value (validated so red "returns invested" and orange "investment value" never touch). Growth series (invested salary growth, invested returns growth, initial payout growth) are diagonal stripes of their source's color and that color at 75% opacity; the source amount is solid. Data from `Calculator.yearlyCashFlows` (amounts as received; the [Received | PV] toggle, saved as `opp.chartMode`, discounts each year's amounts; the Cumulative button, saved as `opp.chartCumulative`, shows running totals per source). Series colors are `--cf-*` tokens in `css/styles.css`. At rest it shows only bars (the plot at 75% opacity), a centered title and gridlines at 50% opacity: axis labels, legend and the toggle appear while the card is hovered/focused, the title slides to the left, the y-axis column animates open, and the plot (at rest centered, using 80% of the y-axis width and 80% of the label/legend height) shrinks from that label/legend space (`--cf-below`, measured in `measureBelow`) back to 175px, so the card's height never changes (always shown on touch screens without hover). An expand button beside the toggle opens a large copy (`new CashFlowChart(opp, ctx, { expanded: true })`) in a native `<dialog>`; closing it (×, Esc, backdrop) re-syncs the card's chart.
- Yearly return and salary share one shape (`Models.yearlyStream`: amount, raiseMode, raise, raiseAmount, cap, invest, investPct, investRate), one formula (`Calculator.streamPV` via `streamInputs`) and one UI builder (`OpportunityView.streamGroup`, wording in `STREAMS`). Breakdown keys: `yearlyReturn`/`yearlyReturnInvested`, `salary`/`salaryInvested`. Older yearly returns (and salaries) had a growth-rate selector (`rate`); `Models.upgradeStream` turns its current value into the % increase, and `streamInputs` still reads `rate` for un-upgraded data.
- Naming: the UI calls opportunities "income sources" ("+ Add Income Source", default title "New Income Source"); code and stored data keep `opportunity`/`opportunities`. Saved titles still at the old default "New Opportunity" are renamed on load (`Models.upgradeOpportunity`).
- Sub group totals: "Present value by [Individual | Source]" toggle (saved as `sg.totalsBy`: 'individual' default | 'opportunity'). By source lists each one in card order; unnamed ones (blank or the default title) are labeled "New Income Source 1, 2…" when there's more than one (`Models.opportunityLabels`; titles aren't changed). The grand total row is labeled with the sub group's title once it's named (else "Sub group total").
- Yearly table: `js/YearlyTable.js`, under the chart (hidden on indefinite timespans or when the Yearly tables switch is off). Cash terms from `Calculator.yearlyLedger`: Income (salary and return in full, payouts, investments cashed out at year n), Expenses (amounts invested, loan repayment), Taxes (Federal / FICA / State, shown only when taxes are included) and Net; income/expense columns show only when used. Lists the start (if any) and years 1–2 until expanded ("Show all N years", saved as `opp.tableExpanded`), then adds a Total row. Σ net_t/(1+d)^t equals the opportunity's PV (tested).
