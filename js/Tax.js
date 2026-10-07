import { FEDERAL, STATES } from './taxData.js';

/**
 * Income taxes for one year under the tables in taxData.js, for a single filer or a married couple filing
 * jointly (`status`: 'single' | 'joint', default single; a joint return is taxed as if this were the
 * couple's only income). A year's income is
 * { ordinary, wages, investment, capitalGains }: `ordinary` is everything taxed as regular income (salary,
 * yearly returns, payouts), `wages` the salary part of it (which also pays Social Security and Medicare),
 * `investment` the part that's net investment income (yearly returns, like interest, dividends or rent),
 * and `capitalGains` investment growth cashed out that year (long-term; a net loss isn't deducted).
 * AGI is ordinary income plus gains.
 */
export class Tax {
  /** The federal table for a filing status: the single figures, with a joint return's in their place. */
  static federalTable(status = 'single') {
    return status === 'joint' ? { ...FEDERAL, ...FEDERAL.joint } : FEDERAL;
  }

  /** A state's table for a filing status (undefined for an unknown state). */
  static stateTable(code, status = 'single') {
    const st = STATES[code];
    return status === 'joint' && st?.joint ? { ...st, ...st.joint } : st;
  }

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

  /** Tax on ordinary taxable income `base` at `brackets`, plus the rest of `taxable` (gains, stacked on top) at `gainsBrackets`. */
  static stackedTax(base, taxable, brackets, gainsBrackets) {
    return Tax.bracketTax(base, brackets) + Tax.bracketTax(taxable, gainsBrackets) - Tax.bracketTax(base, gainsBrackets);
  }

  /**
   * An amount (deduction, exemption, credit…) that may shrink as AGI rises:
   * - a number: the same at any AGI;
   * - { amount, cuts: [[from, rate], ...], min }: less `rate` per dollar of AGI over each `from`, never below `min`;
   * - { amount, from, per, step, min }: less `per` for each `step` of AGI (or part of one) over `from`;
   * - { tiers: [[upTo, amount], ...] }: the amount of the first tier whose `upTo` AGI isn't exceeded, else 0.
   */
  static allowance(spec, agi) {
    if (spec == null) return 0;
    if (typeof spec === 'number') return spec;
    if (spec.tiers) return spec.tiers.find(([upTo]) => agi <= upTo)?.[1] ?? 0;
    const cut = spec.cuts ? Tax.bracketTax(agi, [[0, 0], ...spec.cuts])
      : spec.step ? spec.per * Math.ceil(Math.max(0, agi - spec.from) / spec.step) : 0;
    return Math.max(spec.min || 0, spec.amount - cut);
  }

  /** Federal income tax: regular tax, plus any alternative minimum tax and the net investment income tax. */
  static federal(income, stateTax = 0, status = 'single') {
    const { regular, amt, niit } = Tax.federalParts(income, stateTax, status);
    return regular + amt + niit;
  }

  /**
   * Federal income tax by part. `regular`: the standard deduction, or the state income tax as an
   * itemized deduction when that's larger (see saltDeduction), comes off ordinary income first; capital
   * gains are stacked on top of the ordinary taxable income and taxed at 0 / 15 / 20%. `amt`: how much
   * the tentative minimum tax exceeds the regular tax. `niit`: 3.8% of investment income (yearly returns
   * and gains), up to the amount AGI is over $200,000 ($250,000 joint).
   */
  static federalParts({ ordinary = 0, investment = 0, capitalGains = 0 }, stateTax = 0, status = 'single') {
    const fed = Tax.federalTable(status);
    const gains = Math.max(0, capitalGains);
    const agi = ordinary + gains;
    const deduction = Math.max(fed.standardDeduction, Tax.saltDeduction(stateTax, agi, status));
    const taxable = Math.max(0, agi - deduction);
    const base = taxable - Math.min(gains, taxable); // ordinary taxable income
    const regular = Tax.stackedTax(base, taxable, fed.brackets, fed.capitalGains);
    const amt = Math.max(0, Tax.minimumTax(agi, gains, base, status) - regular);
    const { rate, over } = fed.netInvestmentIncome;
    const niit = rate * Math.max(0, Math.min(investment + gains, agi - over));
    return { regular, amt, niit };
  }

  /** State income tax deductible federally: the SALT cap, which shrinks above $505,000 of MAGI to a $10,000 floor. */
  static saltDeduction(stateTax, agi, status = 'single') {
    const { cap, phaseDownFrom, phaseDownRate, floor } = Tax.federalTable(status).salt;
    return Math.min(Math.max(0, stateTax), Math.max(floor, cap - phaseDownRate * Math.max(0, agi - phaseDownFrom)));
  }

  /**
   * Tentative minimum tax (Form 6251, Part III). AMTI is AGI (no standard deduction, and state tax isn't
   * deductible); the exemption phases out above $500,000 ($1,000,000 joint). Gains keep their 0 / 15 / 20%
   * rates, with the bands measured from `regularBase` (the regular tax's ordinary taxable income); the rest
   * is taxed at 26 / 28%. Never more than 26 / 28% on everything.
   */
  static minimumTax(amti, gains, regularBase, status = 'single') {
    const fed = Tax.federalTable(status);
    const { exemption, phaseOutFrom, phaseOutRate, brackets } = fed.amt;
    const amtBase = Math.max(0, amti - Math.max(0, exemption - phaseOutRate * Math.max(0, amti - phaseOutFrom)));
    const flat = Tax.bracketTax(amtBase, brackets);
    const g = Math.min(amtBase, gains);
    if (!g) return flat;
    const [, [top0, rate1], [top1, rate2]] = fed.capitalGains;
    const at0 = Math.min(g, Math.max(0, top0 - regularBase));
    const at1 = Math.min(g - at0, Math.max(0, top1 - Math.max(top0, regularBase)));
    return Math.min(flat, Tax.bracketTax(amtBase - g, brackets) + rate1 * at1 + rate2 * (g - at0 - at1));
  }

  /**
   * Employee share of Social Security (up to the wage base, per worker) and Medicare (plus 0.9% on wages
   * over $200,000, or a couple's over $250,000).
   */
  static payroll(wages = 0, status = 'single') {
    const { socialSecurity: ss, medicare: m } = Tax.federalTable(status);
    const w = Math.max(0, wages);
    return Math.min(w, ss.wageBase) * ss.rate + w * m.rate + Math.max(0, w - m.additionalOver) * m.additionalRate;
  }

  /**
   * State income tax (`federalTax`: that year's federal income tax, for the states that deduct it), under
   * the state's table for the filing status.
   * Taxable income is ordinary income plus the taxed part of the gains (gains only in Washington), less
   * the state's deduction, exemption and any federal tax deduction, each phased by AGI. The bracket tax
   * (with New York's recapture, Montana's gains rates or Hawaii's gains cap), plus Connecticut's
   * add-backs, less credits, plus surtaxes on gains or investment income. Unknown or no-tax states: 0.
   * See taxData.js for the fields.
   */
  static state(code, { ordinary = 0, investment = 0, capitalGains = 0 }, federalTax = 0, status = 'single') {
    const st = Tax.stateTable(code, status);
    if (!st?.brackets) return 0;
    const gains = Math.max(0, capitalGains);
    const agi = ordinary + gains;
    const g = st.gains || {};
    const taxedGains = Math.max(0, Math.min(gains, g.exemptOver ?? Infinity) * (1 - (g.exclude || 0)) - (g.excludeUpTo || 0));
    const fd = st.federalDeduction;
    const federal = fd ? Math.min(Math.max(0, federalTax) * Tax.allowance(fd.share, agi),
      fd.max == null ? Infinity : Tax.allowance(fd.max, agi)) : 0;
    const taxable = Math.max(0, (st.capitalGainsOnly ? 0 : ordinary) + taxedGains
      - Tax.allowance(st.deduction, agi) - Tax.allowance(st.exemption, agi) - federal);
    const base = taxable - Math.min(taxedGains, taxable); // ordinary part
    let tax = st.recapture ? Tax.recapture(taxable, agi, st.brackets, st.recapture)
      : g.brackets ? Tax.stackedTax(base, taxable, st.brackets, g.brackets)
        : Tax.bracketTax(taxable, st.brackets);
    if (g.maxRate) tax = Math.min(tax, Tax.maxRateTax(base, taxable, st.brackets, g.maxRate));
    for (const { from, per, step, max } of st.addBacks || []) {
      tax += Math.min(max, per * Math.ceil(Math.max(0, agi - from) / step));
    }
    tax = Math.max(0, tax * (1 - Tax.allowance(st.creditShare, agi)) - Tax.allowance(st.credit, agi));
    if (g.surtax && agi > g.agiOver) tax += g.surtax * gains;
    const surtax = st.investmentSurtax;
    if (surtax) tax += surtax.rate * Math.max(0, investment + gains - surtax.over);
    return tax;
  }

  /**
   * New York's tax benefit recapture (IT-201 tax computation worksheets). Once AGI passes `from`, the
   * benefit of the brackets below the one holding taxable income is taken back, phased in over `phaseIn`
   * of AGI (past `from` for the first recaptured bracket, which starts at `bracket`; past the bracket's
   * start for higher ones, which keep what the lower ones already took back), until all taxable income is
   * taxed at that bracket's rate. Over `flatOver` of AGI the top rate applies to all of it.
   */
  static recapture(taxable, agi, brackets, { from, bracket, phaseIn, flatOver }) {
    const tax = Tax.bracketTax(taxable, brackets);
    if (agi <= from) return tax;
    if (agi > flatOver) return taxable * brackets[brackets.length - 1][1];
    const first = brackets.findIndex(([start]) => start === bracket);
    const k = Math.max(first, brackets.findLastIndex(([start]) => taxable > start));
    const [start, rate] = brackets[k];
    const base = k === first ? 0 : brackets[k - 1][1] * start - Tax.bracketTax(start, brackets);
    const share = Math.round((Math.min(1, Math.max(0, agi - (k === first ? from : start)) / phaseIn)) * 1e4) / 1e4;
    return tax + base + (rate * taxable - tax - base) * share;
  }

  /**
   * Hawaii's alternative tax on capital gains: the brackets apply up to where their rate passes
   * `maxRate` (or to the ordinary part, if that's more), and the rest is taxed at `maxRate`.
   */
  static maxRateTax(base, taxable, brackets, maxRate) {
    const capFrom = brackets.find(([, rate]) => rate > maxRate)?.[0] ?? Infinity;
    const upTo = Math.min(taxable, Math.max(base, capFrom));
    return Tax.bracketTax(upTo, brackets) + maxRate * (taxable - upTo);
  }

  /**
   * { federal, gains, payroll, state } owed on one year's income. `gains` is the federal tax that the
   * year's capital gains add (their 0 / 15 / 20% rates, plus any net investment income tax and
   * alternative minimum tax they bring on, and their effect on the state tax deduction), and `federal`
   * the rest: the federal income tax the year would owe without them. State tax includes any on the gains.
   */
  static year(income, stateCode, status = 'single') {
    const { federal, state } = Tax.settle(income, stateCode, status);
    const withoutGains = income.capitalGains > 0
      ? Tax.settle({ ...income, capitalGains: 0 }, stateCode, status).federal : federal;
    return { federal: withoutGains, gains: federal - withoutGains, payroll: Tax.payroll(income.wages, status), state };
  }

  /**
   * { federal, state } income tax on one year's income. Federal tax can deduct the state tax and a few
   * states deduct federal tax, so for those the two are settled together (it converges in a few rounds).
   */
  static settle(income, stateCode, status = 'single') {
    let state = Tax.state(stateCode, income, 0, status);
    let federal = Tax.federal(income, state, status);
    for (let i = 0; i < 4 && STATES[stateCode]?.federalDeduction; i++) {
      state = Tax.state(stateCode, income, federal, status);
      federal = Tax.federal(income, state, status);
    }
    return { federal, state };
  }
}
