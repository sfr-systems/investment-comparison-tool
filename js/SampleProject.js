import { Models } from './Models.js';

/** Builds the "Career Options" demo project with fresh ids each time. */
export class SampleProject {
  static create() {
    const project = Models.project('Career Options');
    project.sample = true; // stays on this device (not synced) until it's edited
    Object.assign(project.settings, { discountRate: 5, sp500Rate: 10, loanRate: 5 });

    const indexFund = Models.opportunity('Index fund + part-time job');
    Object.assign(indexFund, {
      individual: 'Ann',
      risk: 'low',
      yearsMode: 'custom',
      years: 2,
      initial: { amount: 1000, rate: Models.rate('sp500') },
      salary: { ...Models.salary(), amount: 1000, raise: 3 },
    });

    const mba = Models.opportunity('MBA program');
    Object.assign(mba, {
      individual: 'Ben',
      risk: 'high',
      yearsMode: 'custom',
      years: 5,
      salary: { ...Models.salary(), amount: 40000 },
      loan: { amount: 60000, rate: Models.rate('loan') },
    });

    const education = Models.subGroup('Education');
    education.opportunities.push(indexFund, mba);

    const strategy = Models.strategy('Invest & study');
    strategy.subGroups.push(education);
    project.strategies.push(strategy);
    return project;
  }
}
