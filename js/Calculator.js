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
   * Σ C(1+g)^(t−1) / (1+d)^t — used for yearly return and yearly salary.
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
   * Yearly salary S paid at the end of each year t = 1..n, rising by g (a rate) or k (a fixed
   * dollar amount) a year until it reaches `cap` (the cap never lowers pay below S, and only
   * applies when the increase is > 0). A negative k lowers pay each year, never below 0.
   * A share p of each year's pay is invested at the end of that year and grows at gi from the
   * following year until year n, where it's counted: p·pay_t·(1+gi)^(n−t) / (1+d)^n.
   * Returns { kept, invested } present values.
   * Indefinite: no raises or cap and invested pay grows at d, so the total is the perpetuity S/d.
   */
  static salaryPV({ S, g = 0, k = 0, cap = null, p = 0, gi = 0 }, d, n) {
    if (!S) return { kept: 0, invested: 0 };
    if (n === Infinity) {
      const total = Calculator.growingAnnuityPV(S, 0, d, Infinity);
      return { kept: p >= 1 ? 0 : total * (1 - p), invested: p <= 0 ? 0 : total * p };
    }
    const ceiling = (g > 0 || k > 0) && cap != null ? Math.max(cap, S) : Infinity;
    const endDiscount = Math.pow(1 + d, n);
    let kept = 0;
    let invested = 0;
    for (let t = 1; t <= n; t++) {
      const pay = Calculator.salaryPay(t, { S, g, k }, ceiling);
      kept += ((1 - p) * pay) / Math.pow(1 + d, t);
      invested += (p * pay * Math.pow(1 + gi, n - t)) / endDiscount;
    }
    return { kept, invested };
  }

  /** Pay in year t: S(1+g)^(t−1) + k(t−1), never below 0 or above `ceiling`. */
  static salaryPay(t, { S, g = 0, k = 0 }, ceiling = Infinity) {
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
   * rate: { mode: 'sp500' | 'loan' | 'custom' | 'none', custom: percent }
   */
  static resolveRate(rate, settings) {
    switch (rate?.mode) {
      case 'sp500': return (Number(settings.sp500Rate) || 0) / 100;
      case 'loan': return (Number(settings.loanRate) || 0) / 100;
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
   * holding their value, and yearly return / salary don't grow (constant perpetuity C / d).
   */
  static opportunityBreakdown(opp, settings) {
    const d = (Number(settings.discountRate) || 0) / 100;
    const n = Calculator.resolveYears(opp, settings);
    const rate = (r) => Calculator.resolveRate(r, settings);
    const indefinite = n === Infinity;
    const lumpGrowth = (r) => (indefinite ? d : rate(r));
    const streamGrowth = (r) => (indefinite ? 0 : rate(r));
    const parts = {
      initial: Calculator.initialInvestmentPV(+opp.initial.amount || 0, lumpGrowth(opp.initial.rate), d, n),
      initialPayout: Calculator.initialPayoutPV(+opp.initialPayout?.amount || 0,
        !!opp.initialPayout?.invest, lumpGrowth(opp.initialPayout?.rate), d, n),
      yearlyReturn: Calculator.growingAnnuityPV(+opp.yearlyReturn.amount || 0, streamGrowth(opp.yearlyReturn.rate), d, n),
      ...Calculator.salaryParts(opp.salary, settings, d, n),
      payout: Calculator.payoutPV(+opp.payout || 0, d, n),
      loan: Calculator.loanPV(+opp.loan.amount || 0, rate(opp.loan.rate), d, n),
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    return { ...parts, total };
  }

  /** { salary, salaryInvested } for an opportunity's salary settings. */
  static salaryParts(sal = {}, settings, d, n) {
    const { kept, invested } = Calculator.salaryPV(Calculator.salaryInputs(sal, settings, d, n), d, n);
    return { salary: kept, salaryInvested: invested };
  }

  /** Resolve salary settings to salaryPV's { S, g, k, cap, p, gi } (decimals). */
  static salaryInputs(sal = {}, settings, d, n) {
    const indefinite = n === Infinity;
    // `raise` is a percent, `raiseAmount` dollars (raiseMode 'fixed'); salaries saved before
    // either existed used a rate selector.
    const fixed = sal.raiseMode === 'fixed';
    const raise = fixed ? 0
      : sal.raise != null ? (Number(sal.raise) || 0) / 100 : Calculator.resolveRate(sal.rate, settings);
    const raiseAmount = fixed ? Number(sal.raiseAmount) || 0 : 0;
    const investing = !!sal.invest;
    return {
      S: +sal.amount || 0,
      g: indefinite ? 0 : raise,
      k: indefinite ? 0 : raiseAmount,
      cap: indefinite ? null : sal.cap,
      p: investing ? Math.min(100, Math.max(0, Number(sal.investPct ?? 100))) / 100 : 0,
      gi: indefinite ? d : Calculator.resolveRate(sal.investRate, settings),
    };
  }

  /**
   * Year-by-year cash flows for a set timespan (null when indefinite), for the cash-flow chart.
   * Returns [{ year, income: { key: amount }, costs: { key: amount < 0 } }] for years 0..n,
   * where year 0 is the start (listed only when something happens then). Keys match
   * opportunityBreakdown; `initial` is the investment paid in (a cost at the start) and its
   * grown value (income at year n). Invested salary is shown as it builds up rather than as one
   * balance at year n: `salaryInvested` is the share of that year's pay put in, and
   * `salaryGrowth` the growth that year on what was put in before (no growth in the year earned),
   * so over the years they add up to the final balance. An initial payout is received at the start;
   * if it's invested, `initialPayoutGrowth` is what it earns each year after that. Amounts are as
   * received or accrued that
   * year; with `discounted` each is divided by (1+d)^t.
   */
  static yearlyCashFlows(opp, settings, { discounted = false } = {}) {
    const n = Calculator.resolveYears(opp, settings);
    if (n === Infinity) return null;
    const d = (Number(settings.discountRate) || 0) / 100;
    const rate = (r) => Calculator.resolveRate(r, settings);
    const years = Array.from({ length: n + 1 }, (_, year) => ({ year, income: {}, costs: {} }));
    const add = (t, side, key, amount) => {
      if (!amount) return;
      const v = discounted ? amount / Math.pow(1 + d, t) : amount;
      years[t][side][key] = (years[t][side][key] || 0) + v;
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

    const R = +opp.yearlyReturn?.amount || 0;
    const gR = rate(opp.yearlyReturn?.rate);
    const s = Calculator.salaryInputs(opp.salary, settings, d, n);
    const ceiling = (s.g > 0 || s.k > 0) && s.cap != null ? Math.max(s.cap, s.S) : Infinity;
    const L = +opp.loan?.amount || 0;
    const A = L ? Calculator.loanPayment(L, rate(opp.loan?.rate), n) : 0;
    let balance = 0; // invested salary so far
    for (let t = 1; t <= n; t++) {
      add(t, 'income', 'yearlyReturn', R * Math.pow(1 + gR, t - 1));
      const pay = s.S ? Calculator.salaryPay(t, s, ceiling) : 0;
      add(t, 'income', 'salary', (1 - s.p) * pay);
      const growth = balance * s.gi;
      add(t, 'income', 'salaryGrowth', growth);
      add(t, 'income', 'salaryInvested', s.p * pay);
      balance += growth + s.p * pay;
      add(t, 'costs', 'loan', -A);
    }
    add(n, 'income', 'payout', +opp.payout || 0);

    const hasStart = Object.keys(years[0].income).length || Object.keys(years[0].costs).length;
    return hasStart ? years : years.slice(1);
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
