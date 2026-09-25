// Run: node js/tests/calculator.test.mjs
import { Calculator as C } from '../Calculator.js';

let failed = 0;
function check(name, actual, expected, tol = 1e-4) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${actual.toFixed(4)}, expected ${expected.toFixed(4)}`);
}

// Hand-computed: −1000 + 1000·1.1² / 1.05² = −1000 + 1210 / 1.1025 = 97.5057
check('initial I=1000 g=10% d=5% n=2', C.initialInvestmentPV(1000, 0.10, 0.05, 2), 97.5057);
// 100/1.1 + 100/1.21 + 100/1.331 = 90.9091 + 82.6446 + 75.1315 = 248.6852
check('return R=100 g=0 d=10% n=3', C.growingAnnuityPV(100, 0, 0.10, 3), 248.6852);
// 1000/1.05 + 1030/1.1025 = 952.3810 + 934.2404 = 1886.6213
check('salary S=1000 g=3% d=5% n=2', C.growingAnnuityPV(1000, 0.03, 0.05, 2), 1886.6213);
// 1000 / 1.21 = 826.4463
check('payout P=1000 d=10% n=2', C.payoutPV(1000, 0.10, 2), 826.4463);
// A = 500; 1000 − 500/1.1 − 500/1.21 = 1000 − 454.5455 − 413.2231 = 132.2314
check('loan L=1000 r=0 d=10% n=2', C.loanPV(1000, 0, 0.10, 2), 132.2314);
// Loan at the discount rate is PV-neutral
check('loan L=1000 r=d=5% n=3', C.loanPV(1000, 0.05, 0.05, 3), 0);
// A = 1000·0.1/(1−1.1^−2) = 576.1905; 1000 − 576.1905/1.05 − 576.1905/1.1025 = −71.3746
check('loan L=1000 r=10% d=5% n=2', C.loanPV(1000, 0.10, 0.05, 2), -71.3746);

// Initial payout, not invested: received today, so worth its face value
check('initial payout P=1000 kept', C.initialPayoutPV(1000, false, 0.10, 0.05, 2), 1000);
// Invested at g=10%, d=5%, n=2: 1000·1.21 / 1.1025 = 1097.5057 (= P + initial-investment PV 97.5057)
check('initial payout P=1000 invested g=10% d=5% n=2', C.initialPayoutPV(1000, true, 0.10, 0.05, 2), 1097.5057);
// Invested at the discount rate is PV-neutral: 1000·1.05³ / 1.05³ = 1000
check('initial payout invested g=d=5% n=3', C.initialPayoutPV(1000, true, 0.05, 0.05, 3), 1000);

// Full opportunity: linked S&P growth on investment + custom-rate salary + payout
const settings = { discountRate: 5, sp500Rate: 10, loanRate: 5 };
const opp = {
  years: 2,
  initial: { amount: 1000, rate: { mode: 'sp500' } },
  yearlyReturn: { amount: 0, rate: { mode: 'none' } },
  salary: { amount: 1000, rate: { mode: 'custom', custom: 3 } },
  payout: 0,
  loan: { amount: 1000, rate: { mode: 'loan' } },
};
check('opportunity total', C.opportunityPV(opp, settings), 97.5057 + 1886.6213 + 0);
settings.sp500Rate = 0; // linked rate follows project setting: −1000 + 1000/1.1025 = −92.9705
check('opportunity after S&P → 0%', C.opportunityPV(opp, settings), -92.9705 + 1886.6213);

// Initial payout inside an opportunity, with a linked S&P rate (0% now): 1000 / 1.1025 = 907.0295
check('opportunity with invested initial payout',
  C.opportunityPV({ ...opp, initialPayout: { amount: 1000, invest: true, rate: { mode: 'sp500' } } }, settings),
  -92.9705 + 1886.6213 + 907.0295);
// Older saved opportunities without the field still calculate
check('opportunity missing initialPayout', C.opportunityPV(opp, settings), -92.9705 + 1886.6213);

const sg = { opportunities: [{ ...opp, individual: 'Ann' }, { ...opp, individual: '' }] };
const totals = C.subGroupTotals(sg, settings);
check('sub group total', totals.total, 2 * (-92.9705 + 1886.6213));
console.log('individuals:', totals.byIndividual.map(([n]) => n).join(', '));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll passed');
