/**
 * 知乎盐选会员增强助手 - 共享工具模块
 * 提供 DOM 操作、防抖、深拷贝、Observer 工厂等跨模块公共方法
 * 必须在所有其他脚本之前加载
 */
const ZMPUtils = {

  /* ========== 常量 ========== */

  /** 通用 DOM 选择器（多模块共享，避免散落各处） */
  SELECTORS: {
    CONTENT:         '.Post-RichTextContainer, .RichContent-inner, .RichText',
    RICH_CONTENT:    '.RichContent-inner, .Post-RichTextContainer',
    CARDS:           '.ContentItem, .Card, [class*="ContentItem"], .List-item',
    ANSWERS:         '.AnswerItem, .List-item > .ContentItem',
    COMMENTS:        '.CommentItemV2, .CommentContent, [class*="CommentItem"]',
    COMMENT_CONTAINER: '.Comments-container, [class*="CommentList"]',
    COMMENT_HEADER:  '.Comments-container .Card-header, [class*="Comment"] .Card-header',
    ANSWER_HEADER:   '.ContentItem-head, .AnswerItem-header, [class*="ContentItem-meta"]',
    ANSWER_FOOTER:   '.ContentItem-footer, [class*="ContentItem-actions"]',
    AUTHOR:          '.AuthorInfo-name, [class*="AuthorInfo"] a, .UserLink a, [class*="ContentItem-meta"] a',
    TITLE:           'h1.QuestionHeader-title, h1.Post-Title, h1',
    CARD_TITLE:      'h2, .ContentItem-title, [class*="ContentItem-title"]',
  },

  /** 字体映射表（reader 模块的 applyReadingStyle 和 updateStyle 共用） */
  FONT_MAP: {
    'system': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    'serif':  "'Georgia', 'Noto Serif SC', 'Source Han Serif SC', serif",
    'sans':   "'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    'mono':   "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    'kaiti':  "'KaiTi', 'STKaiti', '楷体', serif",
  },

  /** 主题列表（content.js 和 popup 共用） */
  THEMES: [
    'default', 'weread', 'jianshu', 'medium', 'eyegreen',
    'parchment', 'academic', 'modern', 'darkzen', 'oled',
  ],

  /** 1x1 透明占位图（performance 懒加载用） */
  PLACEHOLDER_IMG: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',

  /* ========== 函数工具 ========== */

  /**
   * 防抖：延迟 delay 执行 fn，期间再次调用则重置计时器
   */
  debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { fn.apply(this, args); timer = null; }, delay);
    };
  },

  /**
   * 深拷贝（基于 JSON 序列化，适用于纯数据对象）
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * HTML 转义（AI 总结等富文本渲染前必须先转义）
   */
  escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * 通用轻量 toast 提示（自动消失，同一时刻只保留一个）
   */
  showToast(message, duration = 2200) {
    const old = document.getElementById('zmp-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'zmp-toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  },

  /* ========== DOM 工具 ========== */

  /**
   * 安全获取节点的 className 字符串（SVG 等元素的 className 是对象）
   */
  getClassName(node) {
    return (typeof node.className === 'string') ? node.className : '';
  },

  /**
   * 切换 body 上的 CSS 类
   */
  toggleBodyClass(className, condition) {
    document.body.classList.toggle(className, !!condition);
  },

  /**
   * 批量设置 body 上的 CSS 类（配置驱动）
   * @param {Array<{key:string, cls:string}>} toggles - 映射表
   * @param {Object} config - 配置对象
   */
  applyClassToggles(toggles, config) {
    for (const { key, cls } of toggles) {
      this.toggleBodyClass(cls, config[key]);
    }
  },

  /**
   * 创建带样式的按钮元素
   * @param {Object} opts - { text, onClick, style, className }
   */
  createButton({ text, onClick, style, className }) {
    const btn = document.createElement('button');
    btn.textContent = text;
    if (className) btn.className = className;
    if (style) btn.style.cssText = style;
    if (onClick) btn.onclick = onClick;
    return btn;
  },

  /**
   * 复制文本到剪贴板，并在按钮上显示反馈
   */
  copyToClipboard(text, btn, originalText) {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = '已复制!';
    }).catch(() => {
      btn.textContent = '复制失败';
    }).finally(() => {
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    });
  },

  /**
   * 创建 document.body 上的 MutationObserver
   * 自动过滤非元素节点，回调接收 (node, className)
   * @returns {MutationObserver} 可在外部 disconnect
   */
  createBodyObserver(callback, options = { childList: true, subtree: true }) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          callback(node, this.getClassName(node));
        }
      }
    });
    observer.observe(document.body, options);
    return observer;
  },

  /**
   * 从多个选择器中取第一个匹配的元素
   */
  queryFirst(selectorStr) {
    return document.querySelector(selectorStr);
  },

  /**
   * 从多个选择器中取所有匹配的元素
   */
  queryAll(selectorStr) {
    return document.querySelectorAll(selectorStr);
  },
};
