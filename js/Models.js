/** Factories for the data model: Project → Strategy[] → SubGroup[] → Opportunity[]. */
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
      settings: { discountRate: 7, sp500Rate: 12, loanRate: 5, defaultYears: Models.DEFAULT_YEARS },
      strategies: [],
    };
  }

  static strategy(title = 'New Strategy') {
    return { id: Models.id(), title, collapsed: false, subGroups: [] };
  }

  static subGroup(title = 'New Sub Group') {
    return { id: Models.id(), title, collapsed: false, opportunities: [] };
  }

  /**
   * Yearly salary: raise is a yearly % increase, cap an optional maximum (null = none);
   * when `invest` is on, investPct % of each year's pay is invested at year end at investRate.
   */
  static salary() {
    return {
      amount: 0, raise: 0, cap: null,
      invest: false, investPct: 100, investRate: Models.rate('sp500'),
    };
  }

  /** Paid to the individual at t = 0; optionally invested until the end of the timespan. */
  static initialPayout() {
    return { amount: 0, invest: false, rate: Models.rate('sp500') };
  }

  /** Fill fields added after an opportunity was saved (older projects). */
  static upgradeOpportunity(opp, settings = {}) {
    opp.initialPayout ??= Models.initialPayout();
    const sal = (opp.salary ??= Models.salary());
    if (sal.raise == null) {
      // Older salaries had a growth-rate selector; keep its current value as the yearly increase.
      const r = sal.rate ?? {};
      sal.raise = r.mode === 'custom' ? Number(r.custom) || 0
        : r.mode === 'sp500' ? Number(settings.sp500Rate) || 0
          : r.mode === 'loan' ? Number(settings.loanRate) || 0 : 0;
      delete sal.rate;
    }
    sal.cap ??= null;
    sal.invest ??= false;
    sal.investPct ??= 100;
    sal.investRate ??= Models.rate('sp500');
    opp.risk ??= 'neutral';
    opp.yearsMode ??= 'custom'; // saved before default timespans existed: keep their years
    return opp;
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
    for (const st of copy.strategies) {
      st.id = Models.id();
      for (const sg of st.subGroups) {
        sg.id = Models.id();
        for (const opp of sg.opportunities) opp.id = Models.id();
      }
    }
    return copy;
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
    for (const st of project.strategies) delete st.beacon; // beacons are now positional
    for (const st of project.strategies)
      for (const sg of st.subGroups)
        sg.opportunities.forEach((opp) => Models.upgradeOpportunity(opp, project.settings));
    return project;
  }

  static opportunity(title = 'New Opportunity') {
    return {
      id: Models.id(),
      title,
      individual: '',
      risk: 'neutral', // 'low' | 'neutral' | 'high' (see Risk)
      yearsMode: 'default', // 'default' follows project.settings.defaultYears; 'custom' uses `years`
      years: Models.DEFAULT_YEARS,
      initial: { amount: 0, rate: Models.rate('sp500') },
      initialPayout: Models.initialPayout(),
      yearlyReturn: { amount: 0, rate: Models.rate('none') },
      salary: Models.salary(),
      payout: 0,
      loan: { amount: 0, rate: Models.rate('loan') },
    };
  }
}
