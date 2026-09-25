// Run: node js/tests/risk.test.mjs
import { Risk } from '../Risk.js';

let failed = 0;
function check(name, actual, expected, tol = 1e-3) {
  const ok = typeof expected === 'number'
    ? Math.abs(actual - expected) <= tol
    : JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// Discount 0% so an opportunity's PV equals its final payout exactly.
const settings = { discountRate: 0, sp500Rate: 0, loanRate: 0, defaultYears: 1 };
const opp = (risk, pv) => ({
  risk, yearsMode: 'custom', years: 1, payout: pv,
  initial: { amount: 0 }, yearlyReturn: { amount: 0 }, salary: { amount: 0 }, loan: { amount: 0 },
});
const summary = (...list) => Risk.summarize(list, settings);

check('empty → no summary', Risk.summarize([], settings), null);

// The motivating case: low $100 + high $10,000 → (100·0 + 10000·2) / 10100 ≈ 1.98 → High
const lopsided = summary(opp('low', 100), opp('high', 10000));
check('low $100 + high $10,000: level', lopsided.level, 'high');
check('low $100 + high $10,000: needle avg 1.980', lopsided.avg, 20000 / 10100);
check('low $100 + high $10,000: high share 99%', lopsided.shares.high, 10000 / 10100);
check('counts still reported', lopsided.counts, { low: 1, neutral: 0, high: 1 });

// And the reverse: the big one is low risk
check('high $100 + low $10,000 → low', summary(opp('high', 100), opp('low', 10000)).level, 'low');
// Equal values: low + high average to neutral (avg 1.0)
check('equal-value low + high → neutral', summary(opp('low', 500), opp('high', 500)).avg, 1);
// Negative PVs weigh by size: a −$9,000 high-risk loan dominates a $1,000 low
check('negative PV counts by magnitude', summary(opp('low', 1000), opp('high', -9000)).avg, 1.8);
// All-zero PVs (new opportunities) → count equally
const zeros = summary(opp('low', 0), opp('low', 0), opp('high', 0));
check('all-zero PVs fall back to counting', zeros.avg, 2 / 3);
check('fallback flagged as unweighted', zeros.weighted, false);
// Zero-value opportunities don't pull a weighted average
check('zero-PV high ignored when others have value', summary(opp('low', 1000), opp('high', 0)).level, 'low');
check('missing risk counts as neutral', summary(opp(undefined, 100)).level, 'neutral');

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll passed');
