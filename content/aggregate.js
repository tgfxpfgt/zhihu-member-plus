/**
 * 知乎盐选会员增强助手 - 回答聚合侧栏模块（问题页）
 * 提取当前问题下全部回答，按赞同/时间排序生成锚点导航：
 * 卡片式作者+摘要，点击滚动定位，支持单条回答复制
 */
const ZMPAggregate = {
  config: null,
  _observer: null,
  _panel: null,
  _items: [],          // { el, id, author, vote, excerpt, time, order }
  _sortMode: 'vote',

  async init(config) {
    this.config = config.aggregate || {};
    if (this.config.enabled === false) return;
    if (!window.location.pathname.includes('/question/')) return;

    this._sortMode = this.config.sortBy || 'vote';
    this.collectAnswers();
    this.renderPanel();
    this.observeNewAnswers();
  },

  /**
   * 收集页面上的回答（增量：已收集的按 el.isConnected 保留）
   */
  collectAnswers() {
    // 清理已被虚拟滚动移除的旧引用
    this._items = this._items.filter(it => it.el.isConnected);

    const answers = document.querySelectorAll('.List-item, .AnswerItem');
    const known = new Set(this._items.map(it => it.el));
    let order = this._items.length;

    answers.forEach(item => {
      if (known.has(item)) return;
      const authorEl = item.querySelector(ZMPUtils.SELECTORS.AUTHOR);
      const contentEl = item.querySelector('.RichContent-inner, .RichContent');
      const timeEl = item.querySelector('.ContentItem-time, [class*="ContentItem-time"]');

      const excerpt = (contentEl ? contentEl.innerText : '')
        .replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!excerpt) return;

      this._items.push({
        el: item,
        id: item.getAttribute('data-zop') || ('idx-' + order),
        author: authorEl ? authorEl.textContent.trim() : '匿名用户',
        vote: ZMPFilter.getLikeCount(item),
        excerpt,
        time: (timeEl ? (timeEl.getAttribute('title') || timeEl.textContent) : '').trim(),
        order: order++,
      });
    });
  },

  /**
   * 渲染右侧聚合面板
   */
  renderPanel() {
    if (!this._panel) {
      this._panel = document.createElement('div');
      this._panel.id = 'zmp-aggregate-panel';
      this._panel.className = 'zmp-aggregate-panel';
      document.body.appendChild(this._panel);
    }

    const sorted = this.getSortedItems();

    const header = `
      <div class="zmp-agg-header">
        <span class="zmp-agg-title">🗂 回答聚合（${sorted.length}）</span>
        <span class="zmp-agg-sorts">
          <button data-sort="vote" class="${this._sortMode === 'vote' ? 'active' : ''}">赞同</button>
          <button data-sort="time" class="${this._sortMode === 'time' ? 'active' : ''}">默认</button>
        </span>
        <span class="zmp-agg-close" title="收起">✕</span>
      </div>`;

    const list = sorted.map((it, idx) => `
      <div class="zmp-agg-item" data-idx="${this._items.indexOf(it)}">
        <span class="zmp-agg-vote">${this.formatCount(it.vote)}</span>
        <div class="zmp-agg-main">
          <div class="zmp-agg-author">${ZMPUtils.escapeHtml(it.author)}</div>
          <div class="zmp-agg-excerpt">${ZMPUtils.escapeHtml(it.excerpt)}…</div>
        </div>
        <button class="zmp-agg-copy" title="复制该回答全文">⧉</button>
      </div>`).join('');

    this._panel.innerHTML = header + `<div class="zmp-agg-list">${list}</div>`;

    // 交互绑定
    this._panel.querySelector('.zmp-agg-close').onclick = () => this.toggle(false);
    this._panel.querySelectorAll('.zmp-agg-sorts button').forEach(btn => {
      btn.onclick = () => {
        this._sortMode = btn.dataset.sort;
        ZMPStorage.updateNested('aggregate', 'sortBy', this._sortMode);
        this.renderPanel();
      };
    });
    this._panel.querySelectorAll('.zmp-agg-item').forEach(row => {
      row.onclick = (e) => {
        if (e.target.classList.contains('zmp-agg-copy')) return;
        const item = this._items[parseInt(row.dataset.idx, 10)];
        if (item) item.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    this._panel.querySelectorAll('.zmp-agg-copy').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const row = btn.closest('.zmp-agg-item');
        const item = this._items[parseInt(row.dataset.idx, 10)];
        if (!item) return;
        const content = item.el.querySelector('.RichContent-inner, .RichContent');
        ZMPUtils.copyToClipboard(content ? content.innerText : item.excerpt, btn, '⧉');
      };
    });
  },

  /**
   * 排序后的条目列表
   */
  getSortedItems() {
    const items = [...this._items];
    if (this._sortMode === 'vote') items.sort((a, b) => b.vote - a.vote);
    else items.sort((a, b) => a.order - b.order);
    return items;
  },

  /**
   * 格式化赞同数（1234 → 1.2k）
   */
  formatCount(n) {
    if (!n) return '0';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  },

  /**
   * 监听新加载的回答（虚拟滚动增量收集）
   */
  observeNewAnswers() {
    let timer = null;
    this._observer = ZMPUtils.createBodyObserver((node, cls) => {
      if (!cls.includes('List-item') && !cls.includes('AnswerItem') && !cls.includes('ContentItem')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        this.collectAnswers();
        this.renderPanel();
      }, 800);
    });
  },

  /**
   * 切换面板显隐（供悬浮菜单调用）
   */
  toggle(force) {
    if (!this._panel) {
      this.collectAnswers();
      this.renderPanel();
      return;
    }
    const hidden = this._panel.classList.contains('zmp-agg-hidden');
    const show = force !== undefined ? force : hidden;
    this._panel.classList.toggle('zmp-agg-hidden', !show);
  },

  /**
   * 销毁
   */
  destroy() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    if (this._panel) { this._panel.remove(); this._panel = null; }
    this._items = [];
  },
};
