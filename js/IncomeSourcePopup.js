import { el, openPopup } from './format.js';
import { CashFlowChart } from './CashFlowChart.js';
import { YearlyTable } from './YearlyTable.js';

const LABELS = { chart: 'Yearly cash flow', table: 'Yearly breakdown', both: 'Yearly cash flow and breakdown' };

/**
 * The large popup behind an income source's chart and table expand buttons. It opens on the one
 * whose button was pressed (`start`: 'chart' | 'table'); "Chart + table" shows both, the chart
 * above the table, and is remembered for the project (project.display.popupBoth) so either button
 * opens both next time. It's only offered while both exist (the chart needs a timespan of
 * 20 years or less, the table a set one).
 */
export class IncomeSourcePopup {
  constructor(opp, ctx) {
    this.opp = opp;
    this.ctx = ctx;
  }

  /** onClose: runs once the popup is gone (to re-sync the card, e.g. the chart's value mode). */
  open(start, { onClose } = {}) {
    const { opp, ctx } = this;
    this.start = start;
    this.chart = new CashFlowChart(opp, ctx, { expanded: true });
    this.table = new YearlyTable(opp, ctx, { expanded: true });
    // Rendering builds the chart's title and controls, and the table's basis, for the header.
    this.chartEl = this.chart.render();
    const tableEl = this.table.render();
    this.canCombine = CashFlowChart.available(opp, ctx.project.settings) && !this.table.root.hidden;

    // "Yearly breakdown · After taxes": in the header when the table is alone, above it when both show.
    const tableLabel = (className = '') => el('div', { class: `yt-kicker ${className}`.trim() },
      el('span', { class: 'eyebrow' }, 'Yearly breakdown'),
      el('span', { class: 'yt-basis' }, this.table.basis.textContent));
    this.tableKicker = tableLabel();
    this.tableSubhead = tableLabel('popup-subhead');
    this.tableSection = el('section', { class: 'popup-table' }, this.tableSubhead, tableEl);

    this.bothBtn = el('button', {
      type: 'button', class: 'cf-cumulative popup-both', hidden: !this.canCombine,
      title: 'Show the chart and the yearly table together',
      onclick: () => {
        ctx.project.display.popupBoth = !this.showsBoth();
        this.sync();
        ctx.changed({ light: true });
      },
    }, 'Chart + table');

    this.dialog = openPopup({
      label: LABELS[start],
      kicker: el('div', { class: 'popup-kicker' }, this.chart.titleEl, this.tableKicker),
      title: opp.title || 'Untitled income source',
      controls: el('div', { class: 'popup-controls' }, this.chart.controls, this.bothBtn),
      body: el('div', { class: 'popup-body' }, this.chartEl, this.tableSection),
      onClose,
    });
    this.sync();
  }

  showsBoth() {
    return this.canCombine && !!this.ctx.project.display?.popupBoth;
  }

  /** Show the chart, the table, or both, with the matching header and size. */
  sync() {
    const view = this.showsBoth() ? 'both' : this.start;
    const chart = view !== 'table';
    this.chartEl.hidden = !chart;
    this.chart.titleEl.hidden = !chart;
    this.chart.controls.hidden = !chart; // Received | PV and Cumulative only apply to the chart
    this.tableSection.hidden = view === 'chart';
    this.tableKicker.hidden = view !== 'table';
    this.tableSubhead.hidden = view !== 'both';
    this.bothBtn.setAttribute('aria-pressed', String(view === 'both'));
    this.dialog.setAttribute('aria-label', LABELS[view]);
    this.dialog.classList.toggle('popup-table-only', view === 'table'); // sized to the table
    this.dialog.classList.toggle('popup-both', view === 'both');
  }
}
