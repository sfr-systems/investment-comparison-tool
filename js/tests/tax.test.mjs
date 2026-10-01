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
//   federal 5,020 + 0% on 5,550 + 15% on 94,450 (14,167.50) = 19,187.50; FICA 4,590
const growth = opp({ years: 1, initial: { amount: 100000, rate: { mode: 'custom', custom: 100 } },
  salary: { amount: 60000, raise: 0 } });
const gt = C.yearlyTaxes(C.baseCashFlows(growth, settings('TX', { discountRate: 0 }), 1), settings('TX'));
check('gains: federal tax in the cash-out year', gt[1].federal, 19187.5);
check('gains: nothing taxed at the start', gt[0].federal + gt[0].payroll + gt[0].state, 0);
check('gains: PV at d = 0', C.opportunityPV(growth, settings('TX', { discountRate: 0 })), -100000 + 200000 + 60000 - 23777.5);

// Invested salary: 100,000/yr, 50% invested at S&P 20%, n = 2 → year-2 gains 10,000 at 15%
const invested = opp({ salary: { amount: 100000, raise: 0, invest: true, investPct: 50, investRate: { mode: 'sp500' } } });
const it = C.yearlyTaxes(C.baseCashFlows(invested, settings('TX'), 2), settings('TX'));
check('invested salary: year 1 federal (all salary taxed)', it[1].federal, 13170);
check('invested salary: year 2 federal + 15% of 10,000 gains', it[2].federal, 14670);
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
check('ledger: invested at start = investment + payout', ledger[0].expenses.invested, 21000);
check('ledger: salary in full', ledger[1].income.salary, 70000);
check('ledger: half of salary + a quarter of returns invested', ledger[1].expenses.invested, 35000 + 7500);
check('ledger: cashed out only in the last year', ledger[1].income.cashedOut + ledger[2].income.cashedOut, 0);
check('ledger: taxes match yearlyTaxes', ledger[1].taxes.state,
  C.yearlyTaxes(C.baseCashFlows(full, settings('NY'), 3), settings('NY'))[1].state);
check('ledger: indefinite → none', C.yearlyLedger({ ...full, yearsMode: 'indefinite' }, settings('NY')) === null ? 1 : 0, 1);
check('ledger: no start row without start amounts', C.yearlyLedger(salary60k, settings('TX'))[0].year, 1);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll passed');
