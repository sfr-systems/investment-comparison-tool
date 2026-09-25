// Run: node js/tests/format.test.mjs
import { roundPV, formatPV } from '../format.js';

let failed = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${actual}, expected ${expected}`);
}

// Step = largest power of ten ≤ 0.1% of the value
check('$187,086.31 → nearest $100', formatPV(187086.31), '$187,100');
check('$173,179.07 → nearest $100', formatPV(173179.07), '$173,200');
check('$13,402.18 → nearest $10', formatPV(13402.18), '$13,400');
check('$1,984.13 → nearest $1 (0.1% ≈ $1.98)', formatPV(1984.13), '$1,984');
check('$1,000 exactly → whole dollars', formatPV(1000), '$1,000');
check('$999.99 → nearest $0.10, keeps cents', formatPV(999.99), '$1,000.00');
check('$481.02 → nearest $0.10', formatPV(481.02), '$481.00');
check('$97.51 → nearest $0.01', formatPV(97.51), '$97.51');
check('negative -$71,374.60 → nearest $10', formatPV(-71374.6), '-$71,370');
check('$6,000,000 → nearest $1,000', formatPV(6123456.78), '$6,123,000');
check('zero', formatPV(0), '$0.00');
check('tiny negative reads as zero', formatPV(-0.001), '$0.00');
check('step for $187,086', roundPV(187086.31).step, 100);
check('unbounded shows ∞', formatPV(Infinity), '∞');
check('unbounded loss shows −∞', formatPV(-Infinity), '−∞');
check('undefined shows —', formatPV(NaN), '—');

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll passed');
