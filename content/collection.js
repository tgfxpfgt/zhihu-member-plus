/**
 * 知乎盐选会员增强助手 - 本地收藏夹模块
 * 回答/文章操作栏添加「☆ 收藏」按钮：
 * 本地存储（标题/作者/链接/摘要/时间），popup 内管理与导出 Markdown
 */
const ZMPCollection = {
  config: null,
  _observer: null,

  async init(config) {
    this.config = config.collection || {};
    if (this.config.enabled === false) return;

    this.injectButtons();
    let timer = null;
    this._observer = ZMPUtils.createBodyObserver((node, cls) => {
      if (!cls.includes('ContentItem') && !cls.includes('List-item') && !cls.includes('AnswerItem')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => this.injectButtons(), 600);
    });
  },

  /**
   * 为回答/文章注入收藏按钮
   */
  async injectButtons() {
    if (this.config.enabled === false) return;
    const collected = new Set((this.config.items || []).map(it => it.id));

    document.querySelectorAll('.ContentItem-actions').forEach(actions => {
      if (actions.querySelector('.zmp-collect-btn')) return;
      const item = actions.closest('.ContentItem, .AnswerItem, .List-item');
      if (!item) return;

      const id = this.getItemId(item);
      const btn = ZMPUtils.createButton({
        text: collected.has(id) ? '★ 已收藏' : '☆ 收藏',
        className: 'zmp-collect-btn',
      });
      if (collected.has(id)) btn.classList.add('collected');
      btn.onclick = (e) => {
        e.stopPropagation();
        this.toggleCollect(item, btn);
      };
      actions.insertBefore(btn, actions.firstChild);
    });
  },

  /**
   * 条目唯一标识（沿用 tools.js 的取值策略）
   */
  getItemId(item) {
    const zop = item.getAttribute('data-zop');
    if (zop) {
      try { return JSON.parse(zop).itemId || zop; } catch (e) { return zop; }
    }
    return item.getAttribute('data-za-detail-view-element_id') || item.id ||
           window.location.href.split('#')[0];
  },

  /**
   * 收藏/取消收藏
   */
  async toggleCollect(item, btn) {
    const config = await ZMPStorage.getAll();
    const items = (config.collection && config.collection.items) || [];
    const id = this.getItemId(item);

    const existed = items.findIndex(it => it.id === id);
    if (existed >= 0) {
      items.splice(existed, 1);
      btn.textContent = '☆ 收藏';
      btn.classList.remove('collected');
      ZMPUtils.showToast('已取消收藏');
    } else {
      const content = item.querySelector('.RichContent-inner, .RichContent');
      const authorEl = item.querySelector(ZMPUtils.SELECTORS.AUTHOR);
      const titleEl = document.querySelector(ZMPUtils.SELECTORS.TITLE);
      const cardTitle = item.querySelector(ZMPUtils.SELECTORS.CARD_TITLE);

      items.unshift({
        id,
        type: window.location.pathname.includes('/question/') ? 'answer' : 'content',
        title: (cardTitle ? cardTitle.textContent : (titleEl ? titleEl.textContent : '知乎内容')).trim().slice(0, 100),
        author: authorEl ? authorEl.textContent.trim().slice(0, 40) : '',
        url: window.location.href.split('#')[0],
        excerpt: (content ? content.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 120),
        time: Date.now(),
      });
      // 上限 500 条，防止撑爆 storage
      await ZMPStorage.updateNested('collection', 'items', items.slice(0, 500));
      btn.textContent = '★ 已收藏';
      btn.classList.add('collected');
      ZMPUtils.showToast('已收藏 ☆ 可在扩展弹窗管理');
      return;
    }

    await ZMPStorage.updateNested('collection', 'items', items);
    this.config.items = items;
  },

  /**
   * 导出收藏夹为 Markdown（popup 触发）
   */
  async exportMarkdown() {
    const config = await ZMPStorage.getAll();
    const items = (config.collection && config.collection.items) || [];
    if (items.length === 0) {
      ZMPUtils.showToast('收藏夹为空');
      return;
    }

    let md = `# 我的知乎收藏夹\n\n> 共 ${items.length} 条 · 导出时间 ${new Date().toLocaleString()}\n\n`;
    items.forEach((it, i) => {
      md += `## ${i + 1}. ${it.title}\n\n` +
        `- 作者：${it.author || '未知'}\n` +
        `- 链接：${it.url}\n` +
        `- 收藏于：${new Date(it.time).toLocaleString()}\n\n` +
        `> ${it.excerpt}…\n\n`;
    });

    chrome.runtime.sendMessage({
      action: 'downloadFile',
      data: { filename: 'zhihu-collection-' + Date.now(), content: md, type: 'markdown' },
    }).catch(() => ZMPUtils.showToast('导出失败，请重试'));
  },

  /**
   * 销毁
   */
  destroy() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    document.querySelectorAll('.zmp-collect-btn').forEach(b => b.remove());
  },
};
