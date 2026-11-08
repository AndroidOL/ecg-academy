export function navigate(path) {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = target;
}

export class Router {
  constructor(routes, mount, onRoute = null) {
    this.routes = routes;
    this.mount = mount;
    this.onRoute = onRoute;
    this.current = null;
    this.token = 0;
    this.bound = () => this.render();
  }

  start() {
    window.addEventListener('hashchange', this.bound);
    if (!window.location.hash) {
      history.replaceState(null, '', '#/');
    }
    this.render();
  }

  stop() {
    window.removeEventListener('hashchange', this.bound);
    if (this.current?.destroy) this.current.destroy();
  }

  parse() {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart = ''] = raw.split('?');
    const path = `/${pathPart.replace(/^\/+|\/+$/g, '')}`;
    return { path: path === '/' ? '/' : path, query: new URLSearchParams(queryPart) };
  }

  match(pattern, path) {
    const pSeg = pattern.split('/').filter(Boolean);
    const tSeg = path.split('/').filter(Boolean);
    if (pSeg.length !== tSeg.length) return null;
    const params = {};
    for (let i = 0; i < pSeg.length; i += 1) {
      if (pSeg[i].startsWith(':')) {
        params[pSeg[i].slice(1)] = decodeURIComponent(tSeg[i]);
      } else if (pSeg[i] !== tSeg[i]) {
        return null;
      }
    }
    return params;
  }

  async render() {
    const { path, query } = this.parse();
    const token = ++this.token;
    let matched = null;
    let params = {};
    for (const route of this.routes) {
      const result = this.match(route.path, path);
      if (result) {
        matched = route;
        params = result;
        break;
      }
    }
    if (this.current?.destroy) {
      try {
        this.current.destroy();
      } catch (error) {
        console.error(error);
      }
      this.current = null;
    }
    if (this.onRoute) this.onRoute({ path, query, params, route: matched });
    this.mount.innerHTML = `<div class="page"><div class="loading-panel"><span class="spinner"></span><span>正在读取心电图…</span></div></div>`;
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (!matched) {
      this.mount.innerHTML = `<div class="page"><div class="empty"><div class="empty-icon">${''}</div><div class="empty-title">页面不存在</div><div>返回首页继续学习。</div><a class="btn btn-primary" href="#/">返回首页</a></div></div>`;
      return;
    }

    try {
      const view = await matched.handler({ params, query, path });
      if (token !== this.token) {
        if (view?.destroy) view.destroy();
        return;
      }
      this.mount.innerHTML = '';
      const el = view instanceof HTMLElement ? view : view.el;
      this.mount.appendChild(el);
      this.current = view instanceof HTMLElement ? { el: view } : view;
      if (typeof this.current.afterMount === 'function') this.current.afterMount();
    } catch (error) {
      console.error(error);
      if (token !== this.token) return;
      const message = error?.message ? String(error.message) : '加载失败，请稍后重试';
      const panel = document.createElement('div');
      panel.className = 'page';
      const errorBox = document.createElement('div');
      errorBox.className = 'error-panel';
      errorBox.textContent = message;
      const retry = document.createElement('button');
      retry.className = 'btn btn-primary';
      retry.type = 'button';
      retry.textContent = '重新加载';
      retry.addEventListener('click', () => this.render());
      panel.append(errorBox, retry);
      this.mount.innerHTML = '';
      this.mount.appendChild(panel);
    }
  }
}
