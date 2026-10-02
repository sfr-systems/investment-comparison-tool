/**
 * Income tax tables for a single filer, used when a project includes taxes (see Tax.js).
 * Brackets are [[from, rate], ...]: `rate` applies to taxable income above `from`.
 * Refresh yearly (and update TAX_YEAR).
 *
 * - FEDERAL: IRS Rev. Proc. 2025-32 (2026 brackets, standard deduction, capital gains thresholds, AMT
 *   exemption and 28% threshold); One Big Beautiful Bill Act (AMT exemption phase-out at 50%, SALT cap);
 *   Social Security wage base from the SSA's 2026 announcement. Medicare's 0.9% additional tax and the
 *   3.8% net investment income tax start at $200,000 (neither is indexed).
 * - STATES: Tax Foundation, "State Individual Income Tax Rates and Brackets, 2026" (single filer:
 *   rates, standard deduction, personal exemption; "credit" amounts are subtracted from the tax) and its
 *   footnotes for phase-outs, recapture and surtaxes, with these corrections from the states: Georgia 4.99%
 *   (HB 463, 2026); Maine's 2026 rate schedule (standard deduction, phase-outs, 2% surcharge over $1M);
 *   Massachusetts' 2026 surtax threshold; Washington's 9.9% tier (SB 5813); New York's IT-201 tax
 *   computation worksheets; Connecticut's CT-1040 TCS tables. Local income taxes and state payroll taxes
 *   (e.g. California SDI) aren't modeled.
 *
 * Optional state fields (amounts by AGI are allowances, see Tax.allowance):
 * - deduction, exemption, credit: a number, or an allowance that phases out with AGI.
 * - capitalGainsOnly: only capital gains are taxed (Washington).
 * - gains: { exclude: share of gains not taxed, excludeUpTo: dollars not taxed, exemptOver: gains above this
 *   aren't taxed, brackets: own rates stacked on ordinary income, maxRate: an alternative tax caps gains at
 *   this rate, surtax + agiOver: extra rate on all gains when AGI is above agiOver }.
 * - federalDeduction: { share, max }: deducts that share of federal income tax, up to max.
 * - recapture: New York's tax benefit recapture (Tax.recapture).
 * - addBacks: [{ from, per, step, max }]: `per` dollars for each `step` of AGI (or part) over `from`, up to max.
 * - creditShare: a share of the tax forgiven (Connecticut's personal tax credit), by AGI tiers.
 * - investmentSurtax: { rate, over }: on investment income (yearly returns and gains) above `over`.
 */
export const TAX_YEAR = 2026;

export const TAX_SOURCES = [
  { label: 'IRS 2026 adjustments', url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill' },
  { label: 'State rates (Tax Foundation)', url: 'https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/' },
];

export const FEDERAL = {
  standardDeduction: 16_100,
  brackets: [[0, 0.10], [12_400, 0.12], [50_400, 0.22], [105_700, 0.24], [201_775, 0.32], [256_225, 0.35], [640_600, 0.37]],
  /** Long-term capital gains, stacked on top of ordinary taxable income. */
  capitalGains: [[0, 0], [49_450, 0.15], [545_500, 0.20]],
  /** 3.8% of the lesser of net investment income and modified AGI over $200,000. */
  netInvestmentIncome: { rate: 0.038, over: 200_000 },
  /** Alternative minimum tax: the exemption shrinks by 50¢ per dollar of AMTI over $500,000. */
  amt: { exemption: 90_100, phaseOutFrom: 500_000, phaseOutRate: 0.5, brackets: [[0, 0.26], [244_500, 0.28]] },
  /** State income tax as an itemized deduction: up to $40,400, less 30% of MAGI over $505,000, but at least $10,000. */
  salt: { cap: 40_400, phaseDownFrom: 505_000, phaseDownRate: 0.3, floor: 10_000 },
  socialSecurity: { rate: 0.062, wageBase: 184_500 },
  medicare: { rate: 0.0145, additionalRate: 0.009, additionalOver: 200_000 },
};

/** By postal code. No `brackets`: no income tax. */
export const STATES = {
  AL: {
    name: 'Alabama', brackets: [[0, 0.02], [500, 0.04], [3_000, 0.05]],
    deduction: { amount: 3_000, from: 25_499, per: 25, step: 500, min: 2_500 }, exemption: 1_500,
    federalDeduction: { share: 1 },
  },
  AK: { name: 'Alaska' },
  AZ: { name: 'Arizona', brackets: [[0, 0.025]], deduction: 8_350, gains: { exclude: 0.25 } },
  AR: {
    name: 'Arkansas', brackets: [[0, 0.02], [4_600, 0.039]], deduction: 2_470, credit: 29,
    gains: { exclude: 0.5, exemptOver: 10_000_000 },
  },
  CA: {
    name: 'California',
    brackets: [[0, 0.01], [11_079, 0.02], [26_264, 0.04], [41_452, 0.06], [57_542, 0.08], [72_724, 0.093],
      [371_479, 0.103], [445_771, 0.113], [742_953, 0.123], [1_000_000, 0.133]],
    deduction: 5_540, credit: { amount: 153, from: 252_203, per: 6, step: 2_500 },
  },
  CO: { name: 'Colorado', brackets: [[0, 0.044]], deduction: 16_100 },
  CT: {
    name: 'Connecticut',
    brackets: [[0, 0.02], [10_000, 0.045], [50_000, 0.055], [100_000, 0.06], [200_000, 0.065], [250_000, 0.069], [500_000, 0.0699]],
    exemption: { amount: 15_000, from: 30_000, per: 1_000, step: 1_000 },
    // Table C (2% rate phase-out) and Table D (tax recapture)
    addBacks: [
      { from: 56_500, per: 25, step: 5_000, max: 250 },
      { from: 105_000, per: 25, step: 5_000, max: 250 },
      { from: 200_000, per: 90, step: 5_000, max: 2_700 },
      { from: 500_000, per: 50, step: 5_000, max: 450 },
    ],
    // Table E (personal tax credits)
    creditShare: {
      tiers: [[18_800, 0.75], [19_300, 0.7], [19_800, 0.65], [20_300, 0.6], [20_800, 0.55], [21_300, 0.5],
        [21_800, 0.45], [22_300, 0.4], [25_000, 0.35], [25_500, 0.3], [26_000, 0.25], [26_500, 0.2], [31_300, 0.15],
        [31_800, 0.14], [32_300, 0.13], [32_800, 0.12], [33_300, 0.11], [60_000, 0.1], [60_500, 0.09], [61_000, 0.08],
        [61_500, 0.07], [62_000, 0.06], [62_500, 0.05], [63_000, 0.04], [63_500, 0.03], [64_000, 0.02], [64_500, 0.01]],
    },
  },
  DE: {
    name: 'Delaware',
    brackets: [[0, 0], [2_000, 0.022], [5_000, 0.039], [10_000, 0.048], [20_000, 0.052], [25_000, 0.0555], [60_000, 0.066]],
    deduction: 3_250, credit: 110,
  },
  DC: {
    name: 'District of Columbia',
    brackets: [[0, 0.04], [10_000, 0.06], [40_000, 0.065], [60_000, 0.085], [250_000, 0.0925], [500_000, 0.0975], [1_000_000, 0.1075]],
    deduction: 16_100,
  },
  FL: { name: 'Florida' },
  GA: { name: 'Georgia', brackets: [[0, 0.0499]], deduction: 12_000 },
  HI: {
    name: 'Hawaii',
    brackets: [[0, 0.014], [9_600, 0.032], [14_400, 0.055], [19_200, 0.064], [24_000, 0.068], [36_000, 0.072], [48_000, 0.076],
      [125_000, 0.079], [175_000, 0.0825], [225_000, 0.09], [275_000, 0.10], [325_000, 0.11]],
    deduction: 4_400, exemption: 1_144, gains: { maxRate: 0.0725 },
  },
  ID: { name: 'Idaho', brackets: [[0, 0], [4_811, 0.053]], deduction: 16_100 },
  IL: { name: 'Illinois', brackets: [[0, 0.0495]], exemption: { tiers: [[250_000, 2_925]] } },
  IN: { name: 'Indiana', brackets: [[0, 0.0295]], exemption: 1_000 },
  IA: { name: 'Iowa', brackets: [[0, 0.038]], deduction: 16_100, credit: 40 },
  KS: { name: 'Kansas', brackets: [[0, 0.052], [23_000, 0.0558]], deduction: 3_605, exemption: 9_160 },
  KY: { name: 'Kentucky', brackets: [[0, 0.035]], deduction: 3_360 },
  LA: { name: 'Louisiana', brackets: [[0, 0.03]], deduction: 12_875 },
  ME: {
    name: 'Maine', brackets: [[0, 0.058], [27_400, 0.0675], [64_850, 0.0715], [1_000_000, 0.0915]],
    deduction: { amount: 15_700, cuts: [[102_250, 15_700 / 75_000]] },
    exemption: { amount: 5_300, cuts: [[341_000, 5_300 / 125_000]] },
  },
  MD: {
    name: 'Maryland',
    brackets: [[0, 0.02], [1_000, 0.03], [2_000, 0.04], [3_000, 0.0475], [100_000, 0.05], [125_000, 0.0525], [150_000, 0.055],
      [250_000, 0.0575], [500_000, 0.0625], [1_000_000, 0.065]],
    deduction: 3_350, exemption: { tiers: [[100_000, 3_200], [125_000, 1_600], [150_000, 800]] },
    gains: { surtax: 0.02, agiOver: 350_000 },
  },
  MA: { name: 'Massachusetts', brackets: [[0, 0.05], [1_107_750, 0.09]], exemption: 4_400 },
  MI: { name: 'Michigan', brackets: [[0, 0.0425]], exemption: 5_900 },
  MN: {
    name: 'Minnesota', brackets: [[0, 0.0535], [33_310, 0.068], [109_430, 0.0785], [203_150, 0.0985]],
    deduction: { amount: 15_300, cuts: [[244_400, 0.03], [337_800, 0.10]], min: 15_300 * 0.2 },
    investmentSurtax: { rate: 0.01, over: 1_000_000 },
  },
  MS: { name: 'Mississippi', brackets: [[0, 0], [10_000, 0.04]], deduction: 2_300, exemption: 6_000 },
  MO: {
    name: 'Missouri',
    brackets: [[0, 0], [1_348, 0.02], [2_696, 0.025], [4_044, 0.03], [5_392, 0.035], [6_740, 0.04], [8_088, 0.045], [9_436, 0.047]],
    deduction: 16_100,
    federalDeduction: { share: { tiers: [[25_000, 0.35], [50_000, 0.25], [100_000, 0.15], [125_000, 0.05]] }, max: 5_000 },
  },
  MT: {
    name: 'Montana', brackets: [[0, 0.047], [47_500, 0.0565]], deduction: 16_100,
    gains: { brackets: [[0, 0.03], [47_500, 0.041]] },
  },
  NE: { name: 'Nebraska', brackets: [[0, 0.0246], [4_130, 0.0351], [24_760, 0.0455]], deduction: 8_850, credit: 176 },
  NV: { name: 'Nevada' },
  NH: { name: 'New Hampshire' },
  NJ: {
    name: 'New Jersey',
    brackets: [[0, 0.014], [20_000, 0.0175], [35_000, 0.035], [40_000, 0.0553], [75_000, 0.0637], [500_000, 0.0897], [1_000_000, 0.1075]],
    exemption: 1_000,
  },
  NM: {
    name: 'New Mexico',
    brackets: [[0, 0.015], [5_500, 0.032], [16_500, 0.043], [33_500, 0.047], [66_500, 0.049], [210_000, 0.059]],
    deduction: 16_100, gains: { excludeUpTo: 2_500 },
  },
  NY: {
    name: 'New York',
    brackets: [[0, 0.039], [8_500, 0.044], [11_700, 0.0515], [13_900, 0.054], [80_650, 0.059], [215_400, 0.0685],
      [1_077_550, 0.0965], [5_000_000, 0.103], [25_000_000, 0.109]],
    deduction: 8_000,
    recapture: { from: 107_650, bracket: 80_650, phaseIn: 50_000, flatOver: 25_000_000 },
  },
  NC: { name: 'North Carolina', brackets: [[0, 0.0399]], deduction: 12_750 },
  ND: { name: 'North Dakota', brackets: [[0, 0], [48_475, 0.0195], [244_825, 0.025]], deduction: 16_100, gains: { exclude: 0.4 } },
  OH: { name: 'Ohio', brackets: [[0, 0], [26_050, 0.0275]], exemption: { tiers: [[40_000, 2_400], [80_000, 2_150], [500_000, 1_900]] } },
  OK: { name: 'Oklahoma', brackets: [[0, 0], [3_750, 0.025], [4_900, 0.035], [7_200, 0.045]], deduction: 6_350, exemption: 1_000 },
  OR: {
    name: 'Oregon', brackets: [[0, 0.0475], [4_550, 0.0675], [11_400, 0.0875], [125_000, 0.099]],
    deduction: 2_910, credit: { tiers: [[100_000, 256]] },
    federalDeduction: { share: 1, max: { tiers: [[125_000, 8_500], [130_000, 6_800], [135_000, 5_100], [140_000, 3_400], [145_000, 1_700]] } },
  },
  PA: { name: 'Pennsylvania', brackets: [[0, 0.0307]] },
  RI: {
    name: 'Rhode Island', brackets: [[0, 0.0375], [82_050, 0.0475], [186_450, 0.0599]],
    deduction: { amount: 11_200, cuts: [[261_000, 11_200 / 29_800]] },
    exemption: { amount: 5_250, cuts: [[261_000, 5_250 / 29_800]] },
  },
  SC: { name: 'South Carolina', brackets: [[0, 0], [3_640, 0.03], [18_230, 0.06]], deduction: 8_350, gains: { exclude: 0.44 } },
  SD: { name: 'South Dakota' },
  TN: { name: 'Tennessee' },
  TX: { name: 'Texas' },
  UT: { name: 'Utah', brackets: [[0, 0.045]], credit: { amount: 966, cuts: [[18_213, 0.013]] } },
  VT: {
    name: 'Vermont', brackets: [[0, 0.0335], [49_400, 0.066], [119_700, 0.076], [249_700, 0.0875]],
    deduction: 7_650, exemption: 5_300, gains: { excludeUpTo: 5_000 },
  },
  VA: { name: 'Virginia', brackets: [[0, 0.02], [3_000, 0.03], [5_000, 0.05], [17_000, 0.0575]], deduction: 8_750, exemption: 930 },
  WA: { name: 'Washington', capitalGainsOnly: true, brackets: [[0, 0.07], [1_000_000, 0.099]], deduction: 278_000 },
  WV: { name: 'West Virginia', brackets: [[0, 0.0222], [10_000, 0.0296], [25_000, 0.0333], [40_000, 0.0444], [60_000, 0.0482]], exemption: 2_000 },
  WI: {
    name: 'Wisconsin', brackets: [[0, 0.035], [15_110, 0.044], [51_950, 0.053], [332_720, 0.0765]],
    deduction: { amount: 13_960, cuts: [[20_119, 0.12]] }, exemption: 700, gains: { exclude: 0.3 },
  },
  WY: { name: 'Wyoming' },
};
