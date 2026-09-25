import { el } from './format.js';

/**
 * Strategy "beacons": a Roman numeral + named color used purely as a spoken/visual
 * reference ("go to Strategy III, the teal one"). Numbered by the strategy's position
 * (I, II, III, ...), so they renumber when strategies are removed. Not an identifier for
 * any logic. Colors cycle after the palette runs out.
 */
export class Beacon {
  // [name, light-theme color, dark-theme color]
  static PALETTE = [
    ['Crimson', '#c2413b', '#f07a72'],
    ['Amber', '#b26f12', '#f2b64f'],
    ['Emerald', '#1f8a5b', '#4fcf92'],
    ['Azure', '#2766b0', '#6aa9ee'],
    ['Violet', '#7048b8', '#a88af0'],
    ['Teal', '#0e8585', '#45c9c4'],
    ['Rose', '#c23c7a', '#f07ab0'],
    ['Olive', '#6b7d1f', '#b5c95a'],
    ['Indigo', '#3f4db8', '#8f98f5'],
    ['Copper', '#a8552a', '#e8925f'],
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
