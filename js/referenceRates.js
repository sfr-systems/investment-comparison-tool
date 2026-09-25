/**
 * Market reference figures shown as notes in the Assumptions bar.
 * Informational only: they never change calculations. Refresh periodically.
 *
 * - sp500Avg15y: compound annual S&P 500 total return (dividends reinvested), 2011–2025,
 *   computed from NYU Stern (Damodaran) annual returns.
 * - primeNow / primeAvg25y: U.S. prime rate (effective Sep 17, 2026) and its average over
 *   Sep 2001–Aug 2026, from Federal Reserve data via FRED (MPRIME).
 * - treasury10y: 10-year Treasury constant-maturity yield, late Sep 2026 (FRED DGS10).
 */
export const REFERENCE_RATES = {
  asOf: 'September 24, 2026',
  sp500Avg15y: 13.9,
  sp500Period: '2011–2025',
  primeNow: 7.0,
  primeAvg25y: 4.9,
  treasury10y: 5.0,
  sources: [
    { label: 'S&P 500 returns (NYU Stern)', url: 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html' },
    { label: 'Prime rate (FRED)', url: 'https://fred.stlouisfed.org/series/MPRIME' },
    { label: '10-yr Treasury (FRED)', url: 'https://fred.stlouisfed.org/series/DGS10' },
  ],
};
