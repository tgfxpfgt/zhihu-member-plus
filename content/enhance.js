/**
 * 知乎盐选会员增强助手 - 效率增强模块
 * 参考 X.I.U《知乎增强》等成熟项目的标杆功能：
 * 站外直链还原、完整时间显示、代码块复制、一键收起回答、移除登录弹窗
 */
const ZMPEnhance = {
  config: null,
  _observer: null,
  _collapseBtn: null,

  async init(config) {
    this.config = config.enhance || {};

    if (this.config.directLinks) this.rewriteDirectLinks();
    if (this.config.showFullTime) this.enhanceTimeDisplay();
    if (this.config.codeCopyButton) this.addCodeCopyButtons();
    if (this.config.collapseAllButton) this.addCollapseAllButton();
    if (this.config.removeLoginPopup) this.removeLoginPopup();

    // 动态内容统一监听（防抖）
    if (this.config.directLinks || this.config.showFullTime || this.config.codeCopyButton) {
      let timer = null;
      this._observer = ZMPUtils.createBodyObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => this.processDynamicContent(), 500);
      });
    }
  },

  /**
   * 对动态新增的内容统一应用（直链/时间/代码复制）
   */
  processDynamicContent() {
    if (this.config.directLinks) this.rewriteDirectLinks();
    if (this.config.showFullTime) this.enhanceTimeDisplay();
    if (this.config.codeCopyButton) this.addCodeCopyButtons();
  },

  /* ========== 站外链接直链还原 ========== */

  /**
   * 将知乎跳转链接（link.zhihu.com/?target=xxx）还原为原始直链
   * 处理已有 <a> 与 <img src> 之外的所有含跳转域名的属性
   */
  rewriteDirectLinks(root = document) {
    const links = root.querySelectorAll('a[href*="link.zhihu.com/?target="], a[href*="link.zhihu.com%2F%3Ftarget%3D"]');
    links.forEach(a => {
      const direct = this.decodeZhihuLink(a.getAttribute('href'));
      if (direct) {
        a.setAttribute('href', direct);
        // 去掉"外部链接"角标提示，不再新窗口转嫁页
        a.removeAttribute('data-za-detail-view-element_name');
      }
    });
  },

  /**
   * 解码知乎跳转链接为原始 URL
   */
  decodeZhihuLink(href) {
    try {
      const url = new URL(href, window.location.origin);
      const target = url.searchParams.get('target');
      return target ? decodeURIComponent(target) : null;
    } catch (e) {
      return null;
    }
  },

  /* ========== 时间显示增强 ========== */

  /** 从 ContentItem-time 元素解析出完整时间文本 */
  _parseTimeText(el) {
    const raw = el.getAttribute('data-tuiguang') || el.getAttribute('title') ||
                el.getAttribute('data-tooltip') || el.textContent;
    return raw ? raw.trim() : '';
  },

  /**
   * 完整显示发布/编辑时间（原版只显示相对日期），并复制一份到内容顶部
   */
  enhanceTimeDisplay(root = document) {
    const timeEls = root.querySelectorAll('.ContentItem-time, [class*="ContentItem-time"]');
    timeEls.forEach(timeEl => {
      if (timeEl.querySelector('.zmp-full-time')) return;

      const full = this._parseTimeText(timeEl);
      if (!full) return;

      // 完整显示（title 属性里通常是完整时间）
      const titleAttr = timeEl.getAttribute('title') || timeEl.getAttribute('data-tooltip');
      if (titleAttr) {
        const span = document.createElement('span');
        span.className = 'zmp-full-time';
        span.textContent = titleAttr.trim();
        timeEl.appendChild(span);
      }

      // 置顶显示：复制时间到所属回答/文章的头部
      const item = timeEl.closest('.ContentItem, .AnswerItem, [class*="ContentItem"]');
      const head = item ? item.querySelector(ZMPUtils.SELECTORS.ANSWER_HEADER) : null;
      if (item && head && !head.querySelector('.zmp-top-time')) {
        const topTime = document.createElement('span');
        topTime.className = 'zmp-top-time';
        topTime.textContent = '🕒 ' + full;
        head.appendChild(topTime);
      }
    });
  },

  /* ========== 代码块一键复制 ========== */

  /**
   * 为代码块（pre）添加右上角复制按钮
   */
  addCodeCopyButtons(root = document) {
    const pres = root.querySelectorAll('pre:not([data-zmp-codecopy])');
    pres.forEach(pre => {
      pre.setAttribute('data-zmp-codecopy', '1');
      pre.style.position = 'relative';

      const btn = ZMPUtils.createButton({
        text: '复制代码',
        className: 'zmp-code-copy-btn',
      });
      btn.onclick = () => {
        navigator.clipboard.writeText(pre.innerText).then(() => {
          btn.textContent = '✓ 已复制';
        }).catch(() => {
          btn.textContent = '✗ 复制失败';
        });
        setTimeout(() => { btn.textContent = '复制代码'; }, 1500);
      };
      pre.appendChild(btn);
    });
  },

  /* ========== 一键收起全部回答 ========== */

  /**
   * 问题页右下角添加"收起全部回答"悬浮按钮
   */
  addCollapseAllButton() {
    if (this._collapseBtn || !window.location.pathname.includes('/question/')) return;

    const btn = ZMPUtils.createButton({
      text: '⤒ 收起全部',
      className: 'zmp-collapse-all-btn',
      onClick: () => this.collapseAllAnswers(),
    });

    document.body.appendChild(btn);
    this._collapseBtn = btn;
  },

  /**
   * 收起当前问题页所有展开的长回答（模拟点击收起按钮）
   */
  collapseAllAnswers() {
    let count = 0;
    // 知乎收起按钮（展开态）
    document.querySelectorAll(
      '.ContentItem-expandButton, button[class*="ContentItem-actions"] [class*="collapse"], .Button--plain'
    ).forEach(btn => {
      const text = (btn.textContent || '').trim();
      if (text === '收起' || text.includes('收起')) {
        btn.click();
        count++;
      }
    });

    // 兜底：直接折叠展开态的 RichContent
    document.querySelectorAll('.RichContent--unescapable, .RichContent.is-collapsed ~ .RichContent')
      .forEach(() => { /* 结构差异大，不做激进处理 */ });

    console.log(`[ZMP] 已收起 ${count} 个回答`);
  },

  /* ========== 移除登录弹窗 ========== */

  /**
   * 游客访问时自动关闭登录引导弹窗与遮罩
   */
  removeLoginPopup() {
    const dismiss = () => {
      document.querySelectorAll(
        '.Modal-signupModal, .Modal-loginModal, [class*="signFlowModal"], [class*="LoginModal"], [class*="signupModal"]'
      ).forEach(el => { el.style.display = 'none'; });

      const backdrop = document.querySelector('.Modal-backdrop, [class*="Modal-wrapper"]');
      if (backdrop && !backdrop.closest('[id]')) {
        backdrop.style.display = 'none';
      }
      // 恢复页面滚动（知乎弹窗会锁 body 滚动）
      document.body.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('overflow');
    };

    dismiss();
    setTimeout(dismiss, 1500);
    setTimeout(dismiss, 4000);
  },

  /**
   * 销毁 observer 与按钮
   */
  destroy() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    if (this._collapseBtn) { this._collapseBtn.remove(); this._collapseBtn = null; }
  },
};
