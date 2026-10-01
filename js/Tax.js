import { FEDERAL, STATES } from './taxData.js';

/**
 * Income taxes for one year, for a single filer under the tables in taxData.js. A year's income is
 * { ordinary, wages, capitalGains }: `ordinary` is everything taxed as regular income (salary, yearly
 * returns, payouts), `wages` the salary part of it (which also pays Social Security and Medicare),
 * and `capitalGains` investment growth cashed out that year (long-term; a net loss isn't deducted).
 */
export class Tax {
  /** Tax on `income` under progressive brackets [[from, rate], ...] (ascending, the first from 0). */
  static bracketTax(income, brackets) {
    let tax = 0;
    for (let i = 0; i < brackets.length; i++) {
      const [from, rate] = brackets[i];
      if (income <= from) break;
      const to = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
      tax += (Math.min(income, to) - from) * rate;
    }
    return tax;
  }

  /**
   * Federal income tax. The standard deduction comes off ordinary income first; capital gains are
   * stacked on top of the ordinary taxable income and taxed at 0 / 15 / 20%.
   */
  static federal({ ordinary = 0, capitalGains = 0 }) {
    const gains = Math.max(0, capitalGains);
    const taxable = Math.max(0, ordinary + gains - FEDERAL.standardDeduction);
    const base = taxable - Math.min(gains, taxable); // ordinary taxable income
    return Tax.bracketTax(base, FEDERAL.brackets)
      + Tax.bracketTax(taxable, FEDERAL.capitalGains) - Tax.bracketTax(base, FEDERAL.capitalGains);
  }

  /** Employee share of Social Security (up to the wage base) and Medicare (plus 0.9% on high wages). */
  static payroll(wages = 0) {
    const { socialSecurity: ss, medicare: m } = FEDERAL;
    const w = Math.max(0, wages);
    return Math.min(w, ss.wageBase) * ss.rate + w * m.rate + Math.max(0, w - m.additionalOver) * m.additionalRate;
  }

  /**
   * State income tax: ordinary income plus capital gains (gains only in Washington), less the
   * state's standard deduction and personal exemption, then less its credit. Unknown or no-tax states: 0.
   */
  static state(code, { ordinary = 0, capitalGains = 0 }) {
    const st = STATES[code];
    if (!st?.brackets) return 0;
    const gains = Math.max(0, capitalGains);
    const income = st.capitalGainsOnly ? gains : ordinary + gains;
    const taxable = Math.max(0, income - (st.deduction || 0) - (st.exemption || 0));
    return Math.max(0, Tax.bracketTax(taxable, st.brackets) - (st.credit || 0));
  }

  /** { federal, payroll, state } owed on one year's { ordinary, wages, capitalGains }. */
  static year(income, stateCode) {
    return {
      federal: Tax.federal(income),
      payroll: Tax.payroll(income.wages),
      state: Tax.state(stateCode, income),
    };
  }
}
