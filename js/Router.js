/** Minimal hash router. Patterns like "/project/:id". */
export class Router {
  constructor() {
    this.routes = [];
    this.fallback = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  on(pattern, handler) {
    const keys = [];
    const regex = new RegExp('^' + pattern.replace(/:([^/]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    }) + '/?$');
    this.routes.push({ regex, keys, handler });
    return this;
  }

  otherwise(handler) {
    this.fallback = handler;
    return this;
  }

  navigate(path) {
    const hash = '#' + path;
    if (location.hash === hash) this.resolve();
    else location.hash = hash;
  }

  resolve() {
    const path = location.hash.replace(/^#/, '') || '/';
    for (const { regex, keys, handler } of this.routes) {
      const m = path.match(regex);
      if (m) {
        const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        return handler(params);
      }
    }
    return this.fallback?.();
  }
}
