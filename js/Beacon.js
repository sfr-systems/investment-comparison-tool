import { el } from './format.js';

/**
 * Strategy "beacons": a Roman numeral + named color used purely as a spoken/visual
 * reference ("go to Strategy III, the teal one"). Numbered by the strategy's position
 * (I, II, III, ...), so they renumber when strategies are removed. Not an identifier for
 * any logic. Colors cycle after the palette runs out.
 */
export class Beacon {
  // [name, light-theme color, dark-theme color]
  // Blues, purples and pinks only: green, amber and red are reserved for risk levels (see Risk).
  // Ordered so neighbouring strategies contrast.
  static PALETTE = [
    ['Azure', '#2563b8', '#6aa9ee'],
    ['Violet', '#7442c8', '#b08cf5'],
    ['Hot pink', '#d12f7a', '#ff69b4'],
    ['Cyan', '#0a7ea4', '#4cc6e8'],
    ['Slate', '#56657a', '#a5b4c8'],
    ['Indigo', '#3b3fa8', '#8e94f5'],
    ['Plum', '#6e2f69', '#c98bc4'],
  ];

  static toRoman(n) {
    const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
      [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [value, numeral] of table) {
      while (n >= value) { out += numeral; n -= value; }
    }
    return out;
  }

  static describe(n) {
    const [name, light, dark] = Beacon.PALETTE[(n - 1) % Beacon.PALETTE.length];
    return { numeral: Beacon.toRoman(n), name, light, dark };
  }

  /** Sets the --beacon-* custom properties on a container so descendants can use the color. */
  static paint(node, n) {
    const { light, dark } = Beacon.describe(n);
    node.style.setProperty('--beacon-light', light);
    node.style.setProperty('--beacon-dark', dark);
  }

  /** The medallion badge shown in the strategy header. */
  static badge(n) {
    const { numeral, name } = Beacon.describe(n);
    return el('span', {
      class: 'beacon-badge',
      title: `Strategy ${numeral} · ${name}`,
      'aria-label': `Strategy ${numeral}, ${name}`,
      role: 'img',
    }, numeral);
  }
}
