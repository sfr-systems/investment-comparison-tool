/**
 * Present-value math. All rates passed in are decimals (0.05 = 5%).
 * d = discount rate, n = years, t = 1..n.
 */
export class Calculator {
  /** −I + I(1+g)^n / (1+d)^n */
  static initialInvestmentPV(I, g, d, n) {
    if (!I) return 0;
    return -I + (I * Math.pow(1 + g, n)) / Math.pow(1 + d, n);
  }

  /**
   * Initial payout P (one-time) received at the start (t = 0).
   * Not invested: +P. Invested at g until year n: P(1+g)^n / (1+d)^n.
   */
  static initialPayoutPV(P, invested, g, d, n) {
    if (!P) return 0;
    return invested ? (P * Math.pow(1 + g, n)) / Math.pow(1 + d, n) : P;
  }

  /** Σ C(1+g)^(t−1) / (1+d)^t — used for yearly return and yearly salary. */
  static growingAnnuityPV(C, g, d, n) {
    if (!C) return 0;
    let pv = 0;
    for (let t = 1; t <= n; t++) {
      pv += (C * Math.pow(1 + g, t - 1)) / Math.pow(1 + d, t);
    }
    return pv;
  }

  /** P / (1+d)^n */
  static payoutPV(P, d, n) {
    if (!P) return 0;
    return P / Math.pow(1 + d, n);
  }

  /** Level annual payment amortizing L over n years at r (L/n when r = 0). */
  static loanPayment(L, r, n) {
    if (r === 0) return L / n;
    return (L * r) / (1 - Math.pow(1 + r, -n));
  }

  /** +L − Σ A / (1+d)^t */
  static loanPV(L, r, d, n) {
    if (!L) return 0;
    const A = Calculator.loanPayment(L, r, n);
    let pv = L;
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

  /** Breakdown of an opportunity's PV by component, plus the total. */
  static opportunityBreakdown(opp, settings) {
    const d = (Number(settings.discountRate) || 0) / 100;
    const n = Math.max(1, Math.floor(Number(opp.years) || 1));
    const rate = (r) => Calculator.resolveRate(r, settings);
    const parts = {
      initial: Calculator.initialInvestmentPV(+opp.initial.amount || 0, rate(opp.initial.rate), d, n),
      initialPayout: Calculator.initialPayoutPV(+opp.initialPayout?.amount || 0,
        !!opp.initialPayout?.invest, rate(opp.initialPayout?.rate), d, n),
      yearlyReturn: Calculator.growingAnnuityPV(+opp.yearlyReturn.amount || 0, rate(opp.yearlyReturn.rate), d, n),
      salary: Calculator.growingAnnuityPV(+opp.salary.amount || 0, rate(opp.salary.rate), d, n),
      payout: Calculator.payoutPV(+opp.payout || 0, d, n),
      loan: Calculator.loanPV(+opp.loan.amount || 0, rate(opp.loan.rate), d, n),
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    return { ...parts, total };
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
