// Run: node js/tests/risk.test.mjs
import { Risk } from '../Risk.js';

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
const opps = (...risks) => risks.map((risk) => ({ risk }));
const level = (...risks) => Risk.summarize(opps(...risks)).level;

check('empty → no summary', Risk.summarize([]), null);
check('all low → low', level('low', 'low'), 'low');
check('all high → high', level('high'), 'high');
check('low + high average to neutral', level('low', 'high'), 'neutral');
check('2 low + 1 neutral (avg 0.33) → low', level('low', 'low', 'neutral'), 'low');
check('1 low + 1 neutral (avg 0.5) → low', level('low', 'neutral'), 'low');
check('1 low + 2 neutral (avg 0.67) → neutral', level('low', 'neutral', 'neutral'), 'neutral');
check('1 neutral + 1 high (avg 1.5) → high', level('neutral', 'high'), 'high');
check('missing risk counts as neutral', level(undefined), 'neutral');
check('counts', Risk.summarize(opps('low', 'high', 'high', 'neutral')).counts, { low: 1, neutral: 1, high: 2 });

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nAll passed');
