/**
 * 知乎盐选会员增强助手 - 划词工具模块
 * 选中文字后浮出小工具条：
 *  ＋屏蔽 —— 将选中词加入关键词黑名单（即时生效）
 *  ☆收藏 —— 将选中句子存入表达本（可导出 Markdown）
 */
const ZMPSelection = {
  config: null,
  _toolbar: null,
  _mouseupHandler: null,
  _mousedownHandler: null,
  _scrollHandler: null,

  init(config) {
    this.config = config.selection || {};
    if (this.config.blockWord === false && this.config.expressionBook === false) return;

    this._mouseupHandler = () => this._handleSelection();
    this._mousedownHandler = (e) => {
      // 点击工具条自身不隐藏
      if (this._toolbar && this._toolbar.contains(e.target)) return;
      this._hideToolbar();
    };
    this._scrollHandler = () => this._hideToolbar();

    document.addEventListener('mouseup', this._mouseupHandler);
    document.addEventListener('mousedown', this._mousedownHandler);
    window.addEventListener('scroll', this._scrollHandler, { passive: true });
  },

  /**
   * 处理划词选择
   */
  _handleSelection() {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';

    if (!text || text.length < 2 || text.length > 120) {
      this._hideToolbar();
      return;
    }
    // 输入框内的选择不处理
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this._showToolbar(text, rect);
  },

  /**
   * 显示浮动工具条
   */
  _showToolbar(text, rect) {
    if (!this._toolbar) {
      this._toolbar = document.createElement('div');
      this._toolbar.id = 'zmp-sel-toolbar';
      document.body.appendChild(this._toolbar);
    }

    let html = '';
    if (this.config.blockWord !== false) {
      html += '<button data-act="block">＋ 屏蔽</button>';
    }
    if (this.config.expressionBook !== false) {
      html += '<button data-act="keep">☆ 收藏表达</button>';
    }
    this._toolbar.innerHTML = html;
    this._toolbar.style.display = 'flex';
    this._toolbar.dataset.text = text;

    // 定位（限制在视口内）
    const tb = this._toolbar.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - tb.width / 2),
      window.innerWidth - tb.width - 8
    );
    const top = rect.top > 60 ? rect.top - tb.height - 8 : rect.bottom + 8;
    this._toolbar.style.left = left + 'px';
    this._toolbar.style.top = Math.max(8, top) + 'px';

    this._toolbar.querySelectorAll('button').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const word = this._toolbar.dataset.text;
        btn.dataset.act === 'block' ? this._blockWord(word) : this._keepExpression(word);
        this._hideToolbar();
      };
    });
  },

  /**
   * 隐藏工具条
   */
  _hideToolbar() {
    if (this._toolbar) this._toolbar.style.display = 'none';
  },

  /**
   * 将选中词加入关键词黑名单
   * 写入 storage 后，配置变更监听会自动重新过滤信息流
   */
  async _blockWord(word) {
    const config = await ZMPStorage.getAll();
    const keywords = config.purify.blockKeywords || [];
    if (keywords.includes(word)) {
      ZMPUtils.showToast(`「${word}」已在屏蔽词中`);
      return;
    }
    keywords.push(word);
    await ZMPStorage.updateNested('purify', 'blockKeywords', keywords);
    ZMPUtils.showToast(`已屏蔽关键词「${word}」`);
  },

  /**
   * 将选中句子存入表达本
   */
  async _keepExpression(text) {
    const config = await ZMPStorage.getAll();
    const expressions = (config.selection && config.selection.expressions) || [];
    if (expressions.some(it => it.text === text)) {
      ZMPUtils.showToast('该句子已收藏过');
      return;
    }
    expressions.unshift({ text, url: location.href.split('#')[0], time: Date.now() });
    await ZMPStorage.updateNested('selection', 'expressions', expressions.slice(0, 500));
    ZMPUtils.showToast('已加入表达本 ☆');
  },

  /**
   * 销毁
   */
  destroy() {
    document.removeEventListener('mouseup', this._mouseupHandler);
    document.removeEventListener('mousedown', this._mousedownHandler);
    window.removeEventListener('scroll', this._scrollHandler);
    if (this._toolbar) { this._toolbar.remove(); this._toolbar = null; }
  },
};
