import { Tax } from './Tax.js';

/** Tax kinds (Tax.year) → their breakdown / cash-flow keys. */
const TAX_KEYS = { federal: 'federalTax', payroll: 'payrollTax', state: 'stateTax' };
/** Cash-flow keys taxed as ordinary income, and growth taxed as capital gains when cashed out at year n. */
const ORDINARY_KEYS = ['salary', 'salaryInvested', 'yearlyReturn', 'yearlyReturnInvested', 'initialPayout', 'payout'];
const GROWTH_KEYS = ['salaryGrowth', 'yearlyReturnGrowth', 'initialPayoutGrowth'];
const sumKeys = (obj, keys) => keys.reduce((a, k) => a + (obj[k] || 0), 0);

/**
 * Present-value math. All rates passed in are decimals (0.05 = 5%).
 * d = discount rate, n = years, t = 1..n.
 * n may be Infinity (an indefinite timespan): each formula then uses its limit as n → ∞,
 * returning ±Infinity where that limit doesn't exist (e.g. growth at or above the discount rate).
 */
export class Calculator {
  /** lim (1+g)^n / (1+d)^n as n → ∞: 0 below, 1 at, ∞ above the discount rate. */
  static growthRatioLimit(g, d) {
    const ratio = (1 + g) / (1 + d);
    if (Math.abs(ratio - 1) < 1e-12) return 1;
    return ratio < 1 ? 0 : Infinity;
  }

  /** −I + I(1+g)^n / (1+d)^n. Indefinite: the investment is never cashed out. */
  static initialInvestmentPV(I, g, d, n) {
    if (!I) return 0;
    if (n === Infinity) return -I + I * Calculator.growthRatioLimit(g, d);
    return -I + (I * Math.pow(1 + g, n)) / Math.pow(1 + d, n);
  }

  /**
   * Initial payout P (one-time) received at the start (t = 0).
   * Not invested: +P. Invested at g until year n: P(1+g)^n / (1+d)^n.
   */
  static initialPayoutPV(P, invested, g, d, n) {
    if (!P) return 0;
    if (n === Infinity) return invested ? P * Calculator.growthRatioLimit(g, d) : P;
    return invested ? (P * Math.pow(1 + g, n)) / Math.pow(1 + d, n) : P;
  }

  /**
   * Σ C(1+g)^(t−1) / (1+d)^t: a yearly amount growing at g.
   * Indefinite: growing perpetuity C / (d − g), which only converges when g < d.
   */
  static growingAnnuityPV(C, g, d, n) {
    if (!C) return 0;
    if (n === Infinity) return g < d ? C / (d - g) : Math.sign(C) * Infinity;
    let pv = 0;
    for (let t = 1; t <= n; t++) {
      pv += (C * Math.pow(1 + g, t - 1)) / Math.pow(1 + d, t);
    }
    return pv;
  }

  /**
   * A yearly amount S (yearly return or salary) received at the end of each year t = 1..n, rising
   * by g (a rate) or k (a fixed dollar amount) a year until it reaches `cap` (the cap never lowers
   * the amount below S, and only applies when the increase is > 0). A negative k lowers it each
   * year, never below 0. A share p of each year's amount is invested at the end of that year and
   * grows at gi from the following year until year n, where it's counted:
   * p·amount_t·(1+gi)^(n−t) / (1+d)^n. Returns { kept, invested } present values.
   * Indefinite: no increase or cap and the invested share grows at d, so the total is the perpetuity S/d.
   */
  static streamPV({ S, g = 0, k = 0, cap = null, p = 0, gi = 0 }, d, n) {
    if (!S) return { kept: 0, invested: 0 };
    if (n === Infinity) {
      const total = Calculator.growingAnnuityPV(S, 0, d, Infinity);
      return { kept: p >= 1 ? 0 : total * (1 - p), invested: p <= 0 ? 0 : total * p };
    }
    const ceiling = Calculator.streamCeiling({ S, g, k, cap });
    const endDiscount = Math.pow(1 + d, n);
    let kept = 0;
    let invested = 0;
    for (let t = 1; t <= n; t++) {
      const amount = Calculator.streamAmount(t, { S, g, k }, ceiling);
      kept += ((1 - p) * amount) / Math.pow(1 + d, t);
      invested += (p * amount * Math.pow(1 + gi, n - t)) / endDiscount;
    }
    return { kept, invested };
  }

  /** The most a yearly amount can reach: max(cap, S) when it rises and has a cap, else unlimited. */
  static streamCeiling({ S, g = 0, k = 0, cap = null }) {
    return (g > 0 || k > 0) && cap != null ? Math.max(cap, S) : Infinity;
  }

  /** Amount in year t: S(1+g)^(t−1) + k(t−1), never below 0 or above `ceiling`. */
  static streamAmount(t, { S, g = 0, k = 0 }, ceiling = Infinity) {
    return Math.min(Math.max(0, S * Math.pow(1 + g, t - 1) + k * (t - 1)), ceiling);
  }

  /** P / (1+d)^n. Indefinite: the end never comes, so the payout is never received. */
  static payoutPV(P, d, n) {
    if (!P) return 0;
    if (n === Infinity) return 0;
    return P / Math.pow(1 + d, n);
  }

  /** Level annual payment amortizing L over n years at r (L/n when r = 0). Indefinite: L·r. */
  static loanPayment(L, r, n) {
    if (n === Infinity) return L * r;
    if (r === 0) return L / n;
    return (L * r) / (1 - Math.pow(1 + r, -n));
  }

  /**
   * −Σ A / (1+d)^t: the present value of the repayments, always a cost.
   * The borrowed cash itself isn't counted as a gain; it's assumed to be spent on the opportunity.
   * Indefinite: interest-only payments A = L·r forever, so −L·r/d (0 at 0% interest).
   */
  static loanPV(L, r, d, n) {
    if (!L) return 0;
    if (n === Infinity) {
      if (r === 0) return 0;
      return d > 0 ? -(L * r) / d : -Infinity;
    }
    const A = Calculator.loanPayment(L, r, n);
    let pv = 0;
    for (let t = 1; t <= n; t++) pv -= A / Math.pow(1 + d, t);
    return pv;
  }

  /**
   * Resolve a stored rate selection to a decimal using project settings.
   * rate: { mode: 'sp500' | 'loan' | 'discount' | 'custom' | 'none', custom: percent }
   */
  static resolveRate(rate, settings) {
    switch (rate?.mode) {
      case 'sp500': return (Number(settings.sp500Rate) || 0) / 100;
      case 'loan': return (Number(settings.loanRate) || 0) / 100;
      case 'discount': return (Number(settings.discountRate) || 0) / 100;
      case 'custom': return (Number(rate.custom) || 0) / 100;
      default: return 0;
    }
  }

  /** Timespan n: Infinity when indefinite, the project default when following it, else its own years. */
  static resolveYears(opp, settings) {
    if (opp.yearsMode === 'indefinite') return Infinity;
    const raw = opp.yearsMode === 'default' ? (settings.defaultYears ?? 15) : opp.years;
    return Math.max(1, Math.floor(Number(raw) || 1));
  }

  /**
   * Breakdown of an opportunity's PV by component, plus the total.
   * On an indefinite timespan the entered growth rates are set aside so the PV stays finite:
   * one-time amounts (initial investment, invested initial payout) grow at the discount rate,
   * holding their value, and yearly return / salary don't grow (constant perpetuity C / d) while
   * their invested shares grow at the discount rate. With taxes on, `federalTax`, `payrollTax` and
   * `stateTax` (negative) are part of the total (see taxPV); they're 0 otherwise.
   */
  static opportunityBreakdown(opp, settings) {
    const d = (Number(settings.discountRate) || 0) / 100;
    const n = Calculator.resolveYears(opp, settings);
    const rate = (r) => Calculator.resolveRate(r, settings);
    const indefinite = n === Infinity;
    const lumpGrowth = (r) => (indefinite ? d : rate(r));
    const stream = (group) => Calculator.streamPV(Calculator.streamInputs(group, settings, d, n), d, n);
    const returns = stream(opp.yearlyReturn);
    const salary = stream(opp.salary);
    const parts = {
      initial: Calculator.initialInvestmentPV(+opp.initial.amount || 0, lumpGrowth(opp.initial.rate), d, n),
      initialPayout: Calculator.initialPayoutPV(+opp.initialPayout?.amount || 0,
        !!opp.initialPayout?.invest, lumpGrowth(opp.initialPayout?.rate), d, n),
      yearlyReturn: returns.kept,
      yearlyReturnInvested: returns.invested,
      salary: salary.kept,
      salaryInvested: salary.invested,
      payout: Calculator.payoutPV(+opp.payout || 0, d, n),
      loan: Calculator.loanPV(+opp.loan.amount || 0, rate(opp.loan.rate), d, n),
    };
    const preTax = Object.values(parts).reduce((a, b) => a + b, 0);
    const taxes = Calculator.taxPV(opp, settings, d, n);
    const taxTotal = Object.values(taxes).reduce((a, b) => a + b, 0);
    // Unbounded income pays unbounded tax, but always less than it earns.
    const total = preTax === Infinity && taxTotal === -Infinity ? Infinity : preTax + taxTotal;
    return { ...parts, ...taxes, total };
  }

  /** Whether the project includes federal and state taxes (settings.taxes: { enabled, state }). */
  static taxesOn(settings) {
    return !!settings.taxes?.enabled;
  }

  /**
   * Present value of the taxes on an opportunity, as negative amounts by kind
   * ({ federalTax, payrollTax, stateTax }); all 0 when taxes are off. Each year's taxable income
   * is taxed on its own (see taxableIncome), then discounted like the cash flows.
   * Indefinite: the initial payout is taxed at the start, and yearly return + salary (held
   * constant) are taxed the same every year, a perpetuity tax / d; investments are never cashed
   * out, so there are no capital gains.
   */
  static taxPV(opp, settings, d, n) {
    const out = { federalTax: 0, payrollTax: 0, stateTax: 0 };
    if (!Calculator.taxesOn(settings)) return out;
    const state = settings.taxes.state;
    if (n === Infinity) {
      const start = Tax.year({ ordinary: +opp.initialPayout?.amount || 0, wages: 0 }, state);
      const R = +opp.yearlyReturn?.amount || 0;
      const S = +opp.salary?.amount || 0;
      const yearly = Tax.year({ ordinary: R + S, wages: S }, state);
      for (const [kind, key] of Object.entries(TAX_KEYS)) {
        const forever = !yearly[kind] ? 0 : d > 0 ? yearly[kind] / d : Infinity;
        out[key] = -(start[kind] + forever) || 0;
      }
      return out;
    }
    const years = Calculator.baseCashFlows(opp, settings, n);
    Calculator.yearlyTaxes(years, settings).forEach((tax, t) => {
      for (const [kind, key] of Object.entries(TAX_KEYS)) out[key] -= tax[kind] / Math.pow(1 + d, t);
    });
    return out;
  }

  /**
   * Each year's taxable income from pre-tax cash flows for years 0..n (baseCashFlows):
   * { ordinary, wages, capitalGains }. Salary and yearly returns are taxed in the year they're
   * received, invested or not; the initial payout at the start; the final payout in year n.
   * Investments are cashed out at year n, so all capital gains fall then: the initial investment's
   * value less what was paid in, plus all the growth on invested payout, salary and returns.
   */
  static taxableIncome(years) {
    const n = years.length - 1;
    const gains = (years[n].income.initial || 0) + (years[0].costs.initial || 0)
      + years.reduce((a, row) => a + sumKeys(row.income, GROWTH_KEYS), 0);
    return years.map((row, t) => ({
      ordinary: sumKeys(row.income, ORDINARY_KEYS),
      wages: sumKeys(row.income, ['salary', 'salaryInvested']),
      capitalGains: t === n ? gains : 0,
    }));
  }

  /** Taxes owed each year, [{ federal, payroll, state }] lined up with years 0..n; null when taxes are off. */
  static yearlyTaxes(years, settings) {
    if (!Calculator.taxesOn(settings)) return null;
    return Calculator.taxableIncome(years).map((income) => Tax.year(income, settings.taxes.state));
  }

  /** Resolve a yearly return or salary (see Models.yearlyStream) to streamPV's { S, g, k, cap, p, gi } (decimals). */
  static streamInputs(group = {}, settings, d, n) {
    const indefinite = n === Infinity;
    // `raise` is a percent, `raiseAmount` dollars (raiseMode 'fixed'); ones saved before either
    // existed had a growth-rate selector (`rate`).
    const fixed = group.raiseMode === 'fixed';
    const raise = fixed ? 0
      : group.raise != null ? (Number(group.raise) || 0) / 100 : Calculator.resolveRate(group.rate, settings);
    const raiseAmount = fixed ? Number(group.raiseAmount) || 0 : 0;
    return {
      S: +group.amount || 0,
      g: indefinite ? 0 : raise,
      k: indefinite ? 0 : raiseAmount,
      cap: indefinite ? null : group.cap ?? null,
      p: group.invest ? Math.min(100, Math.max(0, Number(group.investPct ?? 100))) / 100 : 0,
      gi: indefinite ? d : Calculator.resolveRate(group.investRate, settings),
    };
  }

  /**
   * Year-by-year cash flows for a set timespan (null when indefinite), for the cash-flow chart.
   * Returns [{ year, income: { key: amount }, costs: { key: amount < 0 } }] for years 0..n,
   * where year 0 is the start (listed only when something happens then). Keys match
   * opportunityBreakdown; `initial` is the investment paid in (a cost at the start) and its
   * grown value (income at year n). Invested salary and returns are shown as they build up rather
   * than as one balance at year n: `salaryInvested` / `yearlyReturnInvested` is the share of that
   * year's amount put in, and `salaryGrowth` / `yearlyReturnGrowth` the growth that year on what was
   * put in before (no growth in the year earned), so over the years they add up to the final
   * balance. An initial payout is received at the start; if it's invested, `initialPayoutGrowth` is
   * what it earns each year after that. With taxes on, each year's `federalTax`, `payrollTax` and
   * `stateTax` are costs too. Amounts are as received or accrued that year; with `discounted` each
   * is divided by (1+d)^t.
   */
  static yearlyCashFlows(opp, settings, { discounted = false } = {}) {
    const n = Calculator.resolveYears(opp, settings);
    if (n === Infinity) return null;
    const d = (Number(settings.discountRate) || 0) / 100;
    const years = Calculator.baseCashFlows(opp, settings, n);
    Calculator.yearlyTaxes(years, settings)?.forEach((tax, t) => {
      for (const [kind, key] of Object.entries(TAX_KEYS)) if (tax[kind]) years[t].costs[key] = -tax[kind];
    });
    if (discounted) {
      for (const row of years) {
        const factor = Math.pow(1 + d, row.year);
        for (const side of [row.income, row.costs]) for (const key of Object.keys(side)) side[key] /= factor;
      }
    }
    const hasStart = Object.keys(years[0].income).length || Object.keys(years[0].costs).length;
    return hasStart ? years : years.slice(1);
  }

  /** Pre-tax, undiscounted cash flows for every year 0..n of a set timespan (see yearlyCashFlows). */
  static baseCashFlows(opp, settings, n) {
    const d = (Number(settings.discountRate) || 0) / 100;
    const rate = (r) => Calculator.resolveRate(r, settings);
    const years = Array.from({ length: n + 1 }, (_, year) => ({ year, income: {}, costs: {} }));
    const add = (t, side, key, amount) => {
      if (!amount) return;
      years[t][side][key] = (years[t][side][key] || 0) + amount;
    };

    const I = +opp.initial?.amount || 0;
    add(0, 'costs', 'initial', -I);
    add(n, 'income', 'initial', I * Math.pow(1 + rate(opp.initial?.rate), n));

    const P0 = +opp.initialPayout?.amount || 0;
    add(0, 'income', 'initialPayout', P0);
    if (opp.initialPayout?.invest) {
      const g = rate(opp.initialPayout.rate);
      for (let t = 1; t <= n; t++) add(t, 'income', 'initialPayoutGrowth', P0 * Math.pow(1 + g, t - 1) * g);
    }

    const streams = [['yearlyReturn', opp.yearlyReturn], ['salary', opp.salary]].map(([key, group]) => {
      const s = Calculator.streamInputs(group, settings, d, n);
      return { key, s, ceiling: Calculator.streamCeiling(s), balance: 0 }; // balance: invested so far
    });
    const L = +opp.loan?.amount || 0;
    const A = L ? Calculator.loanPayment(L, rate(opp.loan?.rate), n) : 0;
    for (let t = 1; t <= n; t++) {
      for (const st of streams) {
        const { key, s } = st;
        const amount = s.S ? Calculator.streamAmount(t, s, st.ceiling) : 0;
        const growth = st.balance * s.gi;
        add(t, 'income', key, (1 - s.p) * amount);
        add(t, 'income', `${key}Growth`, growth);
        add(t, 'income', `${key}Invested`, s.p * amount);
        st.balance += growth + s.p * amount;
      }
      add(t, 'costs', 'loan', -A);
    }
    add(n, 'income', 'payout', +opp.payout || 0);
    return years;
  }

  /**
   * Year-by-year statement for the yearly table (null when indefinite), in cash terms: for years
   * 0..n (the start only when something happens then), what's received (`income`: salary and
   * yearly return in full, payouts, and every investment cashed out at year n), what's paid out
   * (`expenses`: amounts put into investments, loan repayments), `taxes` ({ federal, payroll,
   * state }, all 0 when taxes are off) and the `net` left. All amounts are positive except `net`.
   * Discounting each year's net by (1+d)^t and adding them up gives the opportunity's PV.
   */
  static yearlyLedger(opp, settings) {
    const n = Calculator.resolveYears(opp, settings);
    if (n === Infinity) return null;
    const years = Calculator.baseCashFlows(opp, settings, n);
    const taxes = Calculator.yearlyTaxes(years, settings);
    const payoutInvested = opp.initialPayout?.invest ? +opp.initialPayout.amount || 0 : 0;
    // Invested payout, salary and returns: everything put in plus its growth, cashed out at year n.
    const balance = payoutInvested + years.reduce((a, row) =>
      a + sumKeys(row.income, ['salaryInvested', 'yearlyReturnInvested', ...GROWTH_KEYS]), 0);
    const rows = years.map(({ year, income: i, costs }) => {
      const income = {
        salary: sumKeys(i, ['salary', 'salaryInvested']),
        yearlyReturn: sumKeys(i, ['yearlyReturn', 'yearlyReturnInvested']),
        initialPayout: i.initialPayout || 0,
        payout: i.payout || 0,
        cashedOut: year === n ? (i.initial || 0) + balance : 0,
      };
      const expenses = {
        invested: -(costs.initial || 0) + sumKeys(i, ['salaryInvested', 'yearlyReturnInvested'])
          + (year === 0 ? payoutInvested : 0),
        loan: -(costs.loan || 0),
      };
      const tax = taxes?.[year] ?? { federal: 0, payroll: 0, state: 0 };
      const total = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
      return { year, income, expenses, taxes: tax, net: total(income) - total(expenses) - total(tax) };
    });
    const start = rows[0];
    const hasStart = [start.income, start.expenses, start.taxes].some((obj) => Object.values(obj).some(Boolean));
    return hasStart ? rows : rows.slice(1);
  }

  static opportunityPV(opp, settings) {
    return Calculator.opportunityBreakdown(opp, settings).total;
  }

  /** { byIndividual: [[name, pv], ...] sorted with "Unassigned" last, total } */
  static subGroupTotals(subGroup, settings) {
    const map = new Map();
    let total = 0;
    for (const opp of subGroup.opportunities) {
      const pv = Calculator.opportunityPV(opp, settings);
      const key = (opp.individual || '').trim() || 'Unassigned';
      map.set(key, (map.get(key) || 0) + pv);
      total += pv;
    }
    const byIndividual = [...map.entries()].sort(([a], [b]) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
    return { byIndividual, total };
  }

  static strategyTotal(strategy, settings) {
    return strategy.subGroups.reduce(
      (sum, sg) => sum + Calculator.subGroupTotals(sg, settings).total, 0);
  }
}
