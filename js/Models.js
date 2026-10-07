/**
 * Factories for the data model: Project → Strategy[] → SubGroup[] → Opportunity[].
 * Opportunities are called "income sources" in the UI.
 */
export class Models {
  static DEFAULT_YEARS = 15;

  static id() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  static rate(mode = 'none', custom = 0) {
    return { mode, custom };
  }

  static project(name) {
    return {
      id: Models.id(),
      name: (name || '').trim() || 'Untitled Project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: {
        discountRate: 7, sp500Rate: 12, loanRate: 5, defaultYears: Models.DEFAULT_YEARS, taxes: Models.taxes(),
      },
      display: Models.display(),
      strategies: [],
    };
  }

  /** Federal and state income taxes in every calculation, for a resident of `state` (postal code). */
  static taxes() {
    return { enabled: false, state: '' };
  }

  /**
   * Whether income source cards show their cash-flow chart and yearly table, and whether the
   * expanded popup shows both together (IncomeSourcePopup).
   */
  static display() {
    return { charts: true, tables: true, popupBoth: false };
  }

  static strategy(title = 'New Strategy') {
    return { id: Models.id(), title, collapsed: false, subGroups: [] };
  }

  static DEFAULT_SUBGROUP_TITLE = 'New Sub Group';

  static subGroup(title = Models.DEFAULT_SUBGROUP_TITLE) {
    return { id: Models.id(), title, collapsed: false, opportunities: [] };
  }

  /**
   * An amount received at the end of every year (yearly return, yearly salary): raiseMode picks a
   * yearly % increase (raise) or a fixed $ increase (raiseAmount); cap is an optional maximum
   * (null = none); when `invest` is on, investPct % of each year's amount is invested at year end
   * at investRate.
   */
  static yearlyStream() {
    return {
      amount: 0, raiseMode: 'percent', raise: 0, raiseAmount: 0, cap: null,
      invest: false, investPct: 100, investRate: Models.rate('sp500'),
    };
  }

  /** Paid to the individual at t = 0; optionally invested until the end of the timespan. */
  static initialPayout() {
    return { amount: 0, invest: false, rate: Models.rate('sp500') };
  }

  /** Fill fields added after an opportunity was saved (older projects). */
  static upgradeOpportunity(opp, settings = {}) {
    if (opp.title === 'New Opportunity') opp.title = Models.DEFAULT_OPPORTUNITY_TITLE; // the old default
    opp.initialPayout ??= Models.initialPayout();
    opp.yearlyReturn = Models.upgradeStream(opp.yearlyReturn, settings);
    opp.salary = Models.upgradeStream(opp.salary, settings);
    opp.risk ??= 'neutral';
    opp.filingStatus ??= 'single';
    opp.yearsMode ??= 'custom'; // saved before default timespans existed: keep their years
    return opp;
  }

  /**
   * Fill a yearly stream's newer fields. Older yearly returns and salaries had a growth-rate selector
   * instead of a yearly increase; its current value becomes the % increase.
   */
  static upgradeStream(stream, settings = {}) {
    const s = stream ?? Models.yearlyStream();
    if (s.raise == null) {
      const r = s.rate ?? {};
      const linked = { sp500: settings.sp500Rate, loan: settings.loanRate, discount: settings.discountRate };
      s.raise = Number(r.mode === 'custom' ? r.custom : linked[r.mode]) || 0;
      delete s.rate;
    }
    const defaults = Models.yearlyStream();
    for (const key of Object.keys(defaults)) s[key] ??= defaults[key];
    return s;
  }

  /**
   * Deep copy of a project with fresh ids throughout (project, strategies, sub groups,
   * opportunities), so the copy is fully independent. `name` is the copy's name.
   */
  static cloneProject(project, name) {
    const copy = structuredClone(project);
    copy.id = Models.id();
    copy.name = name;
    copy.createdAt = copy.updatedAt = Date.now();
    delete copy.sample; // a copy is the user's own project, synced like any other
    copy.strategies.forEach(Models.freshIds);
    return copy;
  }

  /** Deep copy of a strategy titled `title`, with fresh ids for it and everything in it. */
  static cloneStrategy(strategy, title) {
    const copy = Models.freshIds(structuredClone(strategy));
    copy.title = title;
    return copy;
  }

  /** Give a (copied) strategy, its sub groups and their opportunities new ids. */
  static freshIds(strategy) {
    strategy.id = Models.id();
    for (const sg of strategy.subGroups) {
      sg.id = Models.id();
      for (const opp of sg.opportunities) opp.id = Models.id();
    }
    return strategy;
  }

  /** "Name (copy)", or "Name (copy 2)", "(copy 3)"… if taken. */
  static copyName(name, takenNames) {
    const base = name.replace(/ \(copy(?: \d+)?\)$/, '');
    const taken = new Set(takenNames);
    let candidate = `${base} (copy)`;
    for (let i = 2; taken.has(candidate); i++) candidate = `${base} (copy ${i})`;
    return candidate;
  }

  /** Fill project-level fields added after a project was saved. */
  static upgradeProject(project) {
    project.settings.defaultYears ??= Models.DEFAULT_YEARS;
    project.settings.taxes ??= Models.taxes();
    project.display ??= Models.display();
    for (const st of project.strategies) delete st.beacon; // beacons are now positional
    for (const st of project.strategies)
      for (const sg of st.subGroups)
        sg.opportunities.forEach((opp) => Models.upgradeOpportunity(opp, project.settings));
    return project;
  }

  static DEFAULT_OPPORTUNITY_TITLE = 'New Income Source';

  /**
   * Display names for a list of opportunities: their titles, except that unnamed ones (blank or
   * still the default title) are numbered in list order when there's more than one of them,
   * e.g. "New Income Source 1", "New Income Source 2". Titles themselves are left unchanged.
   */
  static opportunityLabels(opportunities) {
    const base = Models.DEFAULT_OPPORTUNITY_TITLE;
    const unnamed = (o) => !(o.title || '').trim() || o.title.trim() === base;
    const count = opportunities.filter(unnamed).length;
    let i = 0;
    return opportunities.map((o) => {
      if (!unnamed(o)) return o.title.trim();
      i += 1;
      return count > 1 ? `${base} ${i}` : base;
    });
  }

  static opportunity(title = Models.DEFAULT_OPPORTUNITY_TITLE) {
    return {
      id: Models.id(),
      title,
      individual: '',
      risk: 'neutral', // 'low' | 'neutral' | 'high' (see Risk)
      filingStatus: 'single', // 'single' | 'joint' (married filing jointly): how its income is taxed
      yearsMode: 'default', // 'default' follows project.settings.defaultYears; 'custom' uses `years`
      years: Models.DEFAULT_YEARS,
      initial: { amount: 0, rate: Models.rate('sp500') },
      initialPayout: Models.initialPayout(),
      yearlyReturn: Models.yearlyStream(),
      salary: Models.yearlyStream(),
      payout: 0,
      loan: { amount: 0, rate: Models.rate('loan') },
    };
  }
}
