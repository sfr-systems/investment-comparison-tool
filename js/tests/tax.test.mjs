// Run: node js/tests/tax.test.mjs
import { Tax } from '../Tax.js';
import { Calculator as C } from '../Calculator.js';

let failed = 0;
function check(name, actual, expected, tol = 1e-4) {
  const ok = actual === expected || Math.abs(actual - expected) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${actual.toFixed(4)}, expected ${expected.toFixed(4)}`);
}

// ---- Federal income tax, 2026 single (standard deduction 16,100)
// 60,000 wages: taxable 43,900 → 10% of 12,400 + 12% of 31,500 = 1,240 + 3,780
check('federal: 60,000 ordinary', Tax.federal({ ordinary: 60000 }), 5020);
check('federal: under the standard deduction', Tax.federal({ ordinary: 16000 }), 0);
// 100,000: taxable 83,900 → 1,240 + 12% of 38,000 + 22% of 33,500 = 1,240 + 4,560 + 7,370
check('federal: 100,000 ordinary', Tax.federal({ ordinary: 100000 }), 13170);
// Gains stack on ordinary income: 40,000 + 30,000 gains → taxable 53,900, ordinary part 23,900
//   ordinary 1,240 + 12% of 11,500 = 2,620; gains 0% up to 49,450, 15% of 4,450 = 667.50
check('federal: gains stacked on ordinary income', Tax.federal({ ordinary: 40000, capitalGains: 30000 }), 3287.5);
// Gains alone use up the standard deduction and stay in the 0% bracket
check('federal: 20,000 gains only', Tax.federal({ capitalGains: 20000 }), 0);
check('federal: a capital loss is not deducted', Tax.federal({ ordinary: 60000, capitalGains: -5000 }), 5020);

// ---- Social Security (6.2% to 184,500) and Medicare (1.45%, +0.9% over 200,000)
check('payroll: 60,000 wages', Tax.payroll(60000), 3720 + 870);
// 11,439 + 3,625 + 0.9% of 50,000 (450)
check('payroll: 250,000 wages', Tax.payroll(250000), 15514);

// ---- State tax
// California: 60,000 − 5,540 = 54,460 → 110.79 + 303.70 + 607.52 + 6% of 13,008 (780.48) − 153 credit
check('state CA: 60,000', Tax.state('CA', { ordinary: 60000 }), 1649.49);
check('state TX: none', Tax.state('TX', { ordinary: 60000 }), 0);
check('state PA: flat 3.07%', Tax.state('PA', { ordinary: 60000 }), 1842);
check('state unknown: 0', Tax.state('', { ordinary: 60000 }), 0);
// Ohio: 20,000 − 2,400 exemption = 17,600, under its 0% bracket (26,050)
check('state OH: zero bracket', Tax.state('OH', { ordinary: 20000 }), 0);
// Washington taxes only gains over 278,000: 7% of 22,000
check('state WA: wages untaxed', Tax.state('WA', { ordinary: 500000 }), 0);
check('state WA: gains over 278,000', Tax.state('WA', { capitalGains: 300000 }), 1540);
// Other states tax gains as ordinary income: PA 3.07% of (10,000 + 5,000)
check('state PA: gains as ordinary income', Tax.state('PA', { ordinary: 10000, capitalGains: 5000 }), 460.5);

// ---- In the PV math (Calculator)
const settings = (state, extra = {}) => ({ discountRate: 10, sp500Rate: 20, loanRate: 5, defaultYears: 2,
  taxes: { enabled: true, state }, ...extra });
const opp = (extra) => ({ yearsMode: 'custom', years: 2, payout: 0, initial: { amount: 0 }, loan: { amount: 0 },
  initialPayout: { amount: 0 }, yearlyReturn: { amount: 0 }, salary: { amount: 0 }, ...extra });
const salary60k = opp({ salary: { amount: 60000, raise: 0 } });

// Salary 60,000 in Texas, d = 10%, n = 2: tax 5,020 + 4,590 = 9,610 a year
//   PV taxes = 9,610/1.1 + 9,610/1.21 = 16,678.5124; salary PV 104,132.2314
const b = C.opportunityBreakdown(salary60k, settings('TX'));
check('PV: federal income tax', b.federalTax, -(5020 / 1.1 + 5020 / 1.21));
check('PV: Social Security & Medicare', b.payrollTax, -(4590 / 1.1 + 4590 / 1.21));
check('PV: no Texas tax', b.stateTax, 0);
check('PV: total after taxes', b.total, 104132.2314 - 16678.5124);
check('PV: taxes off → unchanged', C.opportunityPV(salary60k, { ...settings('TX'), taxes: { enabled: false, state: 'TX' } }),
  104132.2314);
// Indefinite: (60,000 − 9,610) / 10%
check('PV: indefinite salary after taxes', C.opportunityPV({ ...salary60k, yearsMode: 'indefinite' }, settings('TX')), 503900);
check('PV: indefinite at 0% discount stays +∞', C.opportunityPV({ ...salary60k, yearsMode: 'indefinite' },
  settings('TX', { discountRate: 0 })), Infinity);

// Capital gains when investments are cashed out: 100,000 invested at 100% for 1 year + 60,000 salary, d = 0
//   year 1: ordinary 60,000, gains 100,000 → taxable 143,900, ordinary part 43,900
//   federal 5,020 on the salary; capital gains tax 0% on 5,550 + 15% on 94,450 = 14,167.50; FICA 4,590
const growth = opp({ years: 1, initial: { amount: 100000, rate: { mode: 'custom', custom: 100 } },
  salary: { amount: 60000, raise: 0 } });
const gt = C.yearlyTaxes(C.baseCashFlows(growth, settings('TX', { discountRate: 0 }), 1), settings('TX'));
check('gains: federal income tax in the cash-out year (salary only)', gt[1].federal, 5020);
check('gains: capital gains tax at 0% / 15%', gt[1].gains, 14167.5);
check('gains: nothing taxed at the start', gt[0].federal + gt[0].gains + gt[0].payroll + gt[0].state, 0);
check('gains: PV at d = 0', C.opportunityPV(growth, settings('TX', { discountRate: 0 })), -100000 + 200000 + 60000 - 23777.5);
const gb = C.opportunityBreakdown(growth, settings('TX'));
check('gains: capital gains tax PV (d = 10%)', gb.capitalGainsTax, -14167.5 / 1.1);
check('gains: federal income tax PV leaves the gains out', gb.federalTax, -5020 / 1.1);
check('gains: chart cost in the cash-out year', C.yearlyCashFlows(growth, settings('TX')).at(-1).costs.capitalGainsTax, -14167.5);

// The capital gains tax includes the 3.8% NIIT the gains bring on: a 150,000 yearly return (under the
// 200,000 threshold alone) + 100,000 gains → 15% of 100,000 + 3.8% of 50,000. The return's own tax:
//   taxable 133,900 → 1,240 + 4,560 + 22% of 55,300 (12,166) + 24% of 28,200 (6,768) = 24,734
const niitYear = Tax.year({ ordinary: 150000, investment: 150000, capitalGains: 100000 }, 'TX');
check('split: federal income tax on the return alone', niitYear.federal, 24734);
check('split: capital gains tax with the NIIT it triggers', niitYear.gains, 15000 + 1900);
// With state tax itemized (California), the two still add up to the whole federal tax
const caGains = { ordinary: 400000, wages: 400000, capitalGains: 300000 };
const caYear = Tax.year(caGains, 'CA');
check('split: federal + capital gains = all federal tax', caYear.federal + caYear.gains, Tax.federal(caGains, caYear.state));
check('split: federal is the year without the gains', caYear.federal, Tax.year({ ...caGains, capitalGains: 0 }, 'CA').federal);
check('split: state tax includes the gains', caYear.state, Tax.state('CA', caGains));
check('split: no gains → no capital gains tax', Tax.year({ ordinary: 60000 }, 'CA').gains, 0);

// 15 years of a 20,000 yearly return in Texas, all of it invested at 12% after its 390 of tax:
//   gains = 19,610 × (1.12^15 − 1) / 0.12 − 15 × 19,610 (about 436,905), cashed out in year 15 on top of
//   that year's return: 0% up to 49,450 of taxable income (45,550 of gains), then 15%; NIIT on MAGI over 200,000
const ret15 = opp({ years: 15, yearlyReturn: { amount: 20000, raise: 0, invest: true, investPct: 100,
  investRate: { mode: 'custom', custom: 12 } } });
const G15 = 19610 * (1.12 ** 15 - 1) / 0.12 - 15 * 19610;
const r15 = C.yearlyTaxes(C.baseCashFlows(ret15, settings('TX'), 15), settings('TX'));
check('15 years: federal income tax on the year-15 return alone', r15[15].federal, 390);
check('15 years: capital gains tax at long-term rates + NIIT', r15[15].gains, 0.15 * (G15 - 45550) + 0.038 * (G15 - 180000));
check('15 years: no capital gains tax before the cash-out', r15.slice(0, 15).reduce((a, y) => a + y.gains, 0), 0);

// Invested salary: 100,000/yr, 50% of what's left after its taxes (13,170 + 7,650) invested at S&P 20%, n = 2
//   → 39,590 a year invested; year-2 gains 7,918 at 15%
const invested = opp({ salary: { amount: 100000, raise: 0, invest: true, investPct: 50, investRate: { mode: 'sp500' } } });
const it = C.yearlyTaxes(C.baseCashFlows(invested, settings('TX'), 2), settings('TX'));
check('invested salary: year 1 federal (all salary taxed)', it[1].federal, 13170);
check('invested salary: year 2 federal income tax unchanged', it[2].federal, 13170);
check('invested salary: year 2 capital gains tax, 15% of 7,918', it[2].gains, 1187.7);
check('invested salary: half of the after-tax salary invested',
  C.yearlyCashFlows(invested, settings('TX'))[0].income.salaryInvested, 0.5 * (100000 - 20820));
const kept = C.opportunityBreakdown(invested, settings('TX'));
check('invested salary: kept = salary − invested (d = 10%)', kept.salary, (100000 - 39590) / 1.1 + (100000 - 39590) / 1.21);
check('invested salary: taxes off → half of the gross', C.yearlyCashFlows(invested, { ...settings('TX'), taxes: { enabled: false } })[0]
  .income.salaryInvested, 50000);
// Salary + return: income taxes split by amount, FICA all the salary's. 60,000 + 40,000 in Texas: federal 13,170
const both = C.streamTaxes(opp({ salary: { amount: 60000 }, yearlyReturn: { amount: 40000 } }), settings('TX'), 2);
check('stream taxes: salary share + FICA', both.salary(1), 13170 * 0.6 + 4590);
check('stream taxes: return share', both.yearlyReturn(1), 13170 * 0.4);
// Indefinite: invested shares grow at d, so investing after taxes only moves value between kept and invested
const indef = { ...invested, yearsMode: 'indefinite' };
const ib = C.opportunityBreakdown(indef, settings('TX'));
check('indefinite: invested share is of the after-tax salary', ib.salaryInvested, 0.5 * 79180 / 0.1);
check('indefinite: total unchanged', ib.total, (100000 - 20820) / 0.1);
check('indefinite: never cashed out, so no capital gains tax', ib.capitalGainsTax, 0);
check('invested salary: FICA on the full salary', it[1].payroll, 7650);

// Initial payout taxed at the start (year 0): 50,000 in California
const payout = opp({ initialPayout: { amount: 50000, invest: false } });
const pt = C.yearlyTaxes(C.baseCashFlows(payout, settings('CA'), 2), settings('CA'));
check('initial payout: federal at the start', pt[0].federal, Tax.federal({ ordinary: 50000 }));
check('initial payout: no FICA (not wages)', pt[0].payroll, 0);
check('initial payout: state at the start', pt[0].state, Tax.state('CA', { ordinary: 50000 }));

// Chart: taxes are costs in each year's cash flows
const cf = C.yearlyCashFlows(salary60k, settings('CA'));
check('chart: year 1 federal tax cost', cf[0].costs.federalTax, -5020);
check('chart: year 1 state tax cost', cf[0].costs.stateTax, -Tax.state('CA', { ordinary: 60000 }));
check('chart: no tax costs when off', Object.keys(C.yearlyCashFlows(salary60k, { ...settings('CA'), taxes: { enabled: false } })[0].costs).length, 0);

// ---- Yearly table (ledger): each year's net, discounted and summed, is the PV — with and without taxes
const full = opp({
  years: 3, payout: 300,
  initial: { amount: 1000, rate: { mode: 'custom', custom: 10 } },
  initialPayout: { amount: 20000, invest: true, rate: { mode: 'sp500' } },
  yearlyReturn: { amount: 30000, raise: 5, invest: true, investPct: 25, investRate: { mode: 'sp500' } },
  loan: { amount: 10000, rate: { mode: 'loan' } },
  salary: { amount: 70000, raise: 3, invest: true, investPct: 50, investRate: { mode: 'custom', custom: 8 } },
});
for (const [label, s] of [['taxes off', { ...settings('NY'), taxes: { enabled: false } }], ['NY taxes', settings('NY')]]) {
  const ledger = C.yearlyLedger(full, s);
  const pv = ledger.reduce((a, row) => a + row.net / 1.1 ** row.year, 0);
  check(`ledger (${label}): Σ net/(1+d)^t = PV`, pv, C.opportunityPV(full, s), 1e-6);
}
const ledger = C.yearlyLedger(full, settings('NY'));
check('ledger: starts at year 0', ledger[0].year, 0);
check('ledger: start income is the payout', ledger[0].income.initialPayout, 20000);
check('ledger: invested at start = investment + payout after its tax', ledger[0].expenses.invested,
  1000 + 20000 - C.startTax(full, settings('NY')));
check('ledger: salary in full', ledger[1].income.salary, 70000);
const fullTax = C.streamTaxes(full, settings('NY'), 3);
check('ledger: half of salary + a quarter of returns invested, after their taxes', ledger[1].expenses.invested,
  0.5 * (70000 - fullTax.salary(1)) + 0.25 * (30000 - fullTax.yearlyReturn(1)));
check('ledger: cashed out only in the last year', ledger[1].income.cashedOut + ledger[2].income.cashedOut, 0);
check('ledger: taxes match yearlyTaxes', ledger[1].taxes.state,
  C.yearlyTaxes(C.baseCashFlows(full, settings('NY'), 3), settings('NY'))[1].state);
check('ledger: capital gains tax only in the cash-out year', ledger[1].taxes.gains + ledger[2].taxes.gains, 0);
check('ledger: capital gains tax in year 3', ledger[3].taxes.gains,
  C.yearlyTaxes(C.baseCashFlows(full, settings('NY'), 3), settings('NY'))[3].gains);
check('ledger: capital gains tax > 0 on the growth', Math.sign(ledger[3].taxes.gains), 1);
check('ledger: indefinite → none', C.yearlyLedger({ ...full, yearsMode: 'indefinite' }, settings('NY')) === null ? 1 : 0, 1);
check('ledger: Σ pv = PV', ledger.reduce((a, row) => a + row.pv, 0), C.opportunityPV(full, settings('NY')), 1e-6);
check('ledger: discount factor 1/(1+d)^t', ledger[2].factor, 1 / 1.21);
check('ledger: pv = net × factor', ledger[3].pv, ledger[3].net / 1.331);
check('ledger: taxed income is salary + return in full', ledger[1].taxed, 70000 + 30000);
const fullTaxable = C.taxableIncome(C.baseCashFlows(full, settings('NY'), 3))[3];
check('ledger: taxed income in the cash-out year adds the gains', ledger[3].taxed, fullTaxable.ordinary + fullTaxable.capitalGains);
check('ledger: gains in the cash-out year', Math.sign(fullTaxable.capitalGains), 1);

// ---- Indefinite (perpetuity ledger): the start + every year ÷ d is the PV
const forever = { ...full, yearsMode: 'indefinite' };
for (const [label, s] of [['taxes off', { ...settings('NY'), taxes: { enabled: false } }], ['NY taxes', settings('NY')],
  ['CA taxes', settings('CA')], ['no payout', settings('TX')]]) {
  const o = label === 'no payout' ? { ...forever, initialPayout: { amount: 0 } } : forever;
  const { start, every } = C.perpetuityLedger(o, s);
  check(`perpetuity (${label}): start + every year ÷ d = PV`, start.pv + every.pv, C.opportunityPV(o, s), 1e-6);
}
const pl = C.perpetuityLedger(forever, settings('NY'));
check('perpetuity: start is the initial payout', pl.start.income.initialPayout, 20000);
check('perpetuity: start tax is the payout’s', pl.start.taxes.federal + pl.start.taxes.state + pl.start.taxes.payroll,
  C.startTax(forever, settings('NY')));
check('perpetuity: every year the salary + return in full', pl.every.income.salary + pl.every.income.yearlyReturn, 100000);
check('perpetuity: loan interest-only (10,000 × 5%)', pl.every.expenses.loan, 500);
check('perpetuity: nothing invested', pl.every.expenses.invested + pl.start.expenses.invested, 0);
check('perpetuity: valued at 1/d', pl.every.factor, 10);
check('perpetuity: no gains tax', pl.every.taxes.gains, 0);
check('perpetuity: set timespan → none', C.perpetuityLedger(full, settings('NY')) === null ? 1 : 0, 1);
const zeroD = C.perpetuityLedger(forever, settings('TX', { discountRate: 0 }));
check('perpetuity: d = 0 → unbounded yearly value', zeroD.every.pv, Infinity);
check('perpetuity: d = 0, nothing yearly → 0', C.perpetuityLedger(
  { ...forever, salary: { amount: 0 }, yearlyReturn: { amount: 0 }, loan: { amount: 0 } }, settings('TX', { discountRate: 0 })).every.pv, 0);
check('ledger: no start row without start amounts', C.yearlyLedger(salary60k, settings('TX'))[0].year, 1);

// ---- High incomes: federal
const fed = (income, stateTax) => Tax.federalParts(income, stateTax);
// 900,000 wages: taxable 883,900 → 58,448 to 256,225, 35% of 384,375 (134,531.25), 37% of 243,300 (90,021)
check('federal: 900,000 wages', Tax.federal({ ordinary: 900000 }), 283000.25);
check('federal: no AMT on wages', fed({ ordinary: 900000 }).amt, 0);
check('federal: no NIIT on wages', fed({ ordinary: 900000 }).niit, 0);
// The same as a yearly return is investment income: + 3.8% of (900,000 − 200,000)
check('federal: NIIT on a 900,000 yearly return', Tax.federal({ ordinary: 900000, investment: 900000 }), 283000.25 + 26600);
// 150,000 wages + 100,000 gains: NIIT on the 50,000 of MAGI over 200,000
check('federal: NIIT limited by MAGI', fed({ ordinary: 150000, capitalGains: 100000 }).niit, 1900);
// AMT: 100,000 ordinary + 1,000,000 gains. Regular 13,170 + 15% of 461,600 + 20% of 538,400 = 190,090.
//   AMTI 1,100,000 → exemption phased out; 26% of 100,000 + the same gains tax = 202,920 → AMT 12,830
const big = fed({ ordinary: 100000, capitalGains: 1000000 });
check('AMT: regular tax', big.regular, 190090);
check('AMT: exemption phased out by gains', big.amt, 12830);
check('AMT: NIIT on gains over the 200,000 threshold', big.niit, 34200);
// SALT: state tax is itemized when it beats the 16,100 standard deduction, capped at 40,400 → 10,000 by 606,333 of MAGI
check('SALT: under the cap', Tax.saltDeduction(30000, 300000), 30000);
check('SALT: cap phased down by 30% over 505,000', Tax.saltDeduction(50000, 550000), 26900);
check('SALT: floor of 10,000', Tax.saltDeduction(50000, 700000), 10000);
// California, 400,000 wages: state 33,353.228 (credit phased out) → federal taxable 366,646.772
const ca400 = Tax.year({ ordinary: 400000, wages: 400000 }, 'CA');
check('SALT: California tax at 400,000', ca400.state, 33353.228);
check('SALT: federal with state tax itemized', ca400.federal, 58448 + 0.35 * (366646.772 - 256225));
check('SALT: at 900,000 the standard deduction wins again', Tax.year({ ordinary: 900000 }, 'CA').federal, 283000.25);

// ---- High incomes: states
// New York recapture. 120,000: 6,039.75 + (5.9% × 112,000 − 6,039.75) × 0.247
check('NY: recapture phasing in at 120,000', Tax.state('NY', { ordinary: 120000 }), 6039.75 + 568.25 * 0.247);
check('NY: 300,000 → 6.85% of all taxable income', Tax.state('NY', { ordinary: 300000 }), 0.0685 * 292000);
check('NY: 2,000,000 → 9.65% of all taxable income', Tax.state('NY', { ordinary: 2000000 }), 0.0965 * 1992000);
check('NY: over 25,000,000 → 10.9% flat', Tax.state('NY', { ordinary: 30000000 }), 0.109 * 29992000);
// Connecticut 900,000: no exemption; 31,250 + 6.99% of 400,000 + 250 (2% phase-out) + 3,400 recapture
check('CT: 900,000', Tax.state('CT', { ordinary: 900000 }), 59210 + 250 + 3400);
// Connecticut 60,000: 2,000 + 5.5% of 10,000 + 25 add-back, less a 10% personal credit
check('CT: 60,000 with personal credit', Tax.state('CT', { ordinary: 60000 }), 2575 * 0.9);
// Washington: 7% to 1,000,000 of taxable gains, 9.9% above
check('WA: 9.9% over 1,000,000', Tax.state('WA', { capitalGains: 1500000 }), 70000 + 0.099 * 222000);
check('MA: 4% surtax over 1,107,750', Tax.state('MA', { ordinary: 2000000 }), 0.05 * 1995600 + 0.04 * (1995600 - 1107750));
// Maine 1,500,000: deduction and exemption phased out; 2% surcharge over 1,000,000
check('ME: surcharge and phase-outs', Tax.state('ME', { ordinary: 1500000 }), 1589.2 + 2527.875 + 66863.225 + 45750);
check('MD: 2% surtax on gains over 350,000 AGI', Tax.state('MD', { capitalGains: 500000 }) - Tax.state('MD', { ordinary: 500000 }), 10000);
check('MN: 1% on investment income over 1,000,000', Tax.state('MN', { ordinary: 2000000, investment: 2000000 })
  - Tax.state('MN', { ordinary: 2000000 }), 10000);
check('MN: deduction cut to 20%', Tax.state('MN', { ordinary: 2000000 }), Tax.bracketTax(2000000 - 3060, [[0, 0.0535],
  [33310, 0.068], [109430, 0.0785], [203150, 0.0985]]));
// Hawaii: gains capped at 7.25% above 48,000 (where the 7.6% bracket starts): 2,539.20 + 7.25% of 946,456
check('HI: 7.25% cap on gains', Tax.state('HI', { capitalGains: 1000000 }), 2539.2 + 0.0725 * 946456);
// Montana: gains at 3% / 4.1%: 100,000 − 16,100 = 83,900 → 1,425 + 4.1% of 36,400
check('MT: gains rates', Tax.state('MT', { capitalGains: 100000 }), 1425 + 1492.4);
// Arkansas: half of gains taxed: 47,530 → 92 + 3.9% of 42,930, less the 29 credit
check('AR: 50% of gains', Tax.state('AR', { capitalGains: 100000 }), 92 + 1674.27 - 29);
// Alabama deducts federal income tax: 900,000 − 2,500 − 1,500 − 283,000.25 = 612,999.75
const al = Tax.year({ ordinary: 900000 }, 'AL');
check('AL: federal tax deducted', al.state, 110 + 0.05 * (612999.75 - 3000));
// Missouri: 15% of federal tax (5,020) deducted at 60,000 → taxable 43,147
check('MO: partial federal deduction', Tax.year({ ordinary: 60000 }, 'MO').state, 262.86 + 0.047 * (43147 - 9436));
check('GA: 4.99%', Tax.state('GA', { ordinary: 100000 }), 0.0499 * 88000);
check('UT: credit phased out', Tax.state('UT', { ordinary: 100000 }), 4500);
check('WI: deduction phased out', Tax.state('WI', { ordinary: 200000 }), 528.85 + 1620.96 + 7809.55);
check('CA: exemption credit phasing out (153 − 6 × 20)', Tax.state('CA', { ordinary: 300000 }),
  Tax.bracketTax(294460, [[0, 0.01], [11079, 0.02], [26264, 0.04], [41452, 0.06], [57542, 0.08], [72724, 0.093],
    [371479, 0.103]]) - 33);
check('IL: no exemption over 250,000', Tax.state('IL', { ordinary: 300000 }), 14850);

// ---- An invested initial payout invests what's left after its tax
// 100,000 in Texas at 10% for 2 years, d = 0: tax 13,170 at the start, 86,830 invested → 105,064.30
const investedPayout = opp({ initialPayout: { amount: 100000, invest: true, rate: { mode: 'custom', custom: 10 } } });
const ip = settings('TX', { discountRate: 0 });
check('payout: tax at the start', C.startTax(investedPayout, ip), 13170);
check('payout: amount invested', C.payoutInvested(investedPayout, ip), 86830);
check('payout: PV is the after-tax amount grown', C.opportunityPV(investedPayout, ip), 86830 * 1.21);
check('payout: breakdown = tax + net grown', C.opportunityBreakdown(investedPayout, ip).initialPayout, 13170 + 86830 * 1.21);
check('payout: growth from the net amount', C.yearlyCashFlows(investedPayout, ip)[1].income.initialPayoutGrowth, 8683);
check('payout: start year nets to 0', C.yearlyLedger(investedPayout, ip)[0].net, 0);
check('payout: taxes off → gross invested', C.opportunityPV(investedPayout, { ...ip, taxes: { enabled: false } }), 121000);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll passed');
