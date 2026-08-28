// ==UserScript==
// @name         知乎盐选会员增强助手（轻量版）
// @namespace    https://github.com/tgfxpfgt/zhihu-member-plus
// @version      1.1.0
// @description  知乎增强轻量版：页面净化、广告屏蔽、站外直链、时间显示、代码复制、低赞屏蔽、阅读样式、快捷键。与 Chrome 扩展版功能同步演进。
// @author       tgfxpfgt
// @match        https://www.zhihu.com/*
// @match        https://zhuanlan.zhihu.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-idle
// @noframes
// @license      MIT
// ==/UserScript==

/**
 * 知乎盐选会员增强助手 - 油猴轻量版
 *
 * 与 Chrome 扩展版（zhihu-member-plus）的同步约定：
 * - 功能域划分一致：purify（净化屏蔽）/ filter（黑名单）/ enhance（效率）/ reader（阅读）
 * - DOM 选择器与扩展 utils/helpers.js SELECTORS 保持一致
 * - 配置键名与扩展 storage.js DEFAULTS 保持一致
 * - 版本号与扩展 manifest.json 保持一致
 *
 * 差异说明（轻量版裁剪项）：
 * - 无性能节流模块（依赖扩展 background SW 调度）
 * - 无导出 Markdown / 阅读进度（扩展版功能更完整）
 * - 设置项精简为常用开关（Tampermonkey 菜单打开设置面板）
 */
(function () {
  'use strict';

  /* ==================== 配置层 ==================== */

  const DEFAULTS = {
    purify: {
      hideAds: true,
      hideLiveStream: true,
      hideCourseAds: true,
      hideGoodsCards: true,
      hideConsultCards: true,
      hideMemberPromo: true,
      hideVideo: false,
      hideLowLike: false,
      lowLikeThreshold: 10,
    },
    filter: {
      blockKeywords: [],
      blockAuthors: [],
    },
    enhance: {
      directLinks: true,
      showFullTime: true,
      codeCopyButton: true,
      collapseAllButton: true,
      removeLoginPopup: true,
    },
    reader: {
      fontSize: 0,        // 0 = 不调整
      lineHeight: 0,      // 0 = 不调整
      nightMode: false,
    },
  };

  /** 读取配置（GM 存储 + 默认值合并） */
  function loadConfig() {
    const saved = GM_getValue('zmpLiteConfig', null);
    return deepMerge(deepClone(DEFAULTS), saved || {});
  }

  /** 保存配置 */
  function saveConfig(config) {
    GM_setValue('zmpLiteConfig', config);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  /* ==================== 共享工具 ==================== */

  /** 通用选择器（与扩展版 SELECTORS 一致） */
  const SELECTORS = {
    CONTENT: '.Post-RichTextContainer, .RichContent-inner, .RichText',
    CARDS: '.ContentItem, .Card, [class*="ContentItem"], .List-item',
    ANSWERS: '.AnswerItem, .List-item > .ContentItem',
    AUTHOR: '.AuthorInfo-name, [class*="AuthorInfo"] a, .UserLink a, [class*="ContentItem-meta"] a',
    CARD_TITLE: 'h2, .ContentItem-title, [class*="ContentItem-title"]',
    ANSWER_HEADER: '.ContentItem-head, .AnswerItem-header, [class*="ContentItem-meta"]',
    PLACEHOLDER_IMG: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  };

  const FONT_MAP = {
    'system': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    'serif':  "'Georgia', 'Noto Serif SC', 'Source Han Serif SC', serif",
    'sans':   "'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    'mono':   "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    'kaiti':  "'KaiTi', 'STKaiti', '楷体', serif",
  };

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { fn.apply(this, args); timer = null; }, delay);
    };
  }

  function getClassName(node) {
    return (typeof node.className === 'string') ? node.className : '';
  }

  function toggleBodyClass(cls, condition) {
    document.body.classList.toggle(cls, !!condition);
  }

  /**
   * body MutationObserver 工厂（回调接收 node 与 className）
   */
  function createBodyObserver(callback, options = { childList: true, subtree: true }) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          callback(node, getClassName(node));
        }
      }
    });
    observer.observe(document.body, options);
    return observer;
  }

  /* ==================== 样式注入（content.css 轻量子集） ==================== */

  GM_addStyle(`
    /* ===== 页面净化 ===== */
    body.zmp-hide-ads .Pc-card,
    body.zmp-hide-ads [class*="AdBelowMainColumn"],
    body.zmp-hide-ads [class*="Pc-word"],
    body.zmp-hide-ads .AdblockBanner,
    body.zmp-hide-ads [data-za-detail-view-path-module*="Ad"],
    body.zmp-hide-ads [class*="AdaptiveSlider"],
    body.zmp-hide-ads [class*="brand-card"],
    body.zmp-hide-ads [class*="BrandCard"],
    body.zmp-hide-ads [class*="RelatedReadings"],
    body.zmp-hide-ads [class*="Recommendations-Main"] { display: none !important; }

    body.zmp-hide-live .LiveWrapper,
    body.zmp-hide-live [class*="live-card"],
    body.zmp-hide-live [class*="LiveCard"] { display: none !important; }

    body.zmp-hide-course [class*="Education"],
    body.zmp-hide-course .EBookCard,
    body.zmp-hide-course [class*="course-card"] { display: none !important; }

    body.zmp-hide-goods .GoodsCard,
    body.zmp-hide-goods .MCNLinkCard,
    body.zmp-hide-goods [class*="Goods-"] { display: none !important; }

    body.zmp-hide-consult [class*="Consult"] { display: none !important; }

    body.zmp-hide-member-promo [class*="MemberButton"],
    body.zmp-hide-member-promo [class*="vip-banner"],
    body.zmp-hide-member-promo .MembershipGuide,
    body.zmp-hide-member-promo [class*="openMember"] { display: none !important; }

    body.zmp-hide-video .ZVideoItem,
    body.zmp-hide-video [class*="ZVideo"],
    body.zmp-hide-video [class*="VideoCard"],
    body.zmp-hide-video .ContentItem[data-zop-type="zvideo"],
    body.zmp-hide-video [class*="video-card"] { display: none !important; }

    /* ===== 夜间模式（轻量版） ===== */
    body.zmp-night-mode {
      background: #1a1a1a !important;
    }
    body.zmp-night-mode .Card,
    body.zmp-night-mode .TopstoryItem,
    body.zmp-night-mode [class*="ContentItem"] {
      background: #242424 !important;
      color: #c8c8c8 !important;
    }
    body.zmp-night-mode .RichText,
    body.zmp-night-mode .RichContent-inner,
    body.zmp-night-mode h1, body.zmp-night-mode h2,
    body.zmp-night-mode .ContentItem-title {
      color: #d4d4d4 !important;
    }

    /* ===== 效率增强 ===== */
    .zmp-code-copy-btn {
      position: absolute;
      top: 8px; right: 8px;
      padding: 3px 10px;
      font-size: 12px;
      color: #8590a6;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid #d3dce6;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 5;
    }
    pre:hover .zmp-code-copy-btn { opacity: 1; }
    .zmp-code-copy-btn:hover { color: #175199; border-color: #8590a6; }

    .zmp-top-time {
      float: right;
      font-size: 12px;
      color: #999;
      font-weight: normal;
      margin-left: 8px;
    }
    .zmp-full-time { color: #8590a6; margin-left: 6px; }

    .zmp-collapse-all-btn {
      position: fixed;
      right: 24px; bottom: 88px;
      z-index: 10000;
      padding: 8px 14px;
      font-size: 13px;
      color: #fff;
      background: #0084ff;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0, 132, 255, 0.35);
    }
    .zmp-collapse-all-btn:hover { background: #006acc; }

    /* ===== 设置面板 ===== */
    #zmp-lite-settings {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 999999;
      width: 340px;
      max-height: 80vh;
      overflow-y: auto;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.25);
      padding: 18px;
      font-size: 13px;
      color: #333;
    }
    #zmp-lite-settings h3 {
      margin: 0 0 10px;
      font-size: 15px;
      color: #0084ff;
    }
    #zmp-lite-settings .zmp-ls-group {
      margin-bottom: 12px;
    }
    #zmp-lite-settings .zmp-ls-group > b {
      display: block;
      margin-bottom: 6px;
      color: #666;
    }
    #zmp-lite-settings label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      cursor: pointer;
    }
    #zmp-lite-settings textarea {
      width: 100%;
      box-sizing: border-box;
      font-size: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 4px;
      min-height: 40px;
    }
    #zmp-lite-settings .zmp-ls-footer {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 10px;
    }
    #zmp-lite-settings button {
      padding: 5px 14px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    #zmp-ls-save { background: #0084ff; color: #fff; }
    #zmp-ls-close { background: #eee; color: #333; }
  `);

  /* ==================== 模块：页面净化 Purify ==================== */

  const Purify = {
    config: null,
    observer: null,

    init(config) {
      this.config = config.purify;
      this.applyClasses();
      this.removeExistingAds();
      if (this.config.hideVideo) this.hideVideoCards();
      this.observeNewAds();
    },

    applyClasses() {
      const toggles = [
        ['hideAds', 'zmp-hide-ads'],
        ['hideLiveStream', 'zmp-hide-live'],
        ['hideCourseAds', 'zmp-hide-course'],
        ['hideGoodsCards', 'zmp-hide-goods'],
        ['hideConsultCards', 'zmp-hide-consult'],
        ['hideMemberPromo', 'zmp-hide-member-promo'],
        ['hideVideo', 'zmp-hide-video'],
      ];
      toggles.forEach(([key, cls]) => toggleBodyClass(cls, this.config[key]));
    },

    removeExistingAds() {
      document.querySelectorAll('[data-za-detail-view-path-module*="Ad"], [class*="AdaptiveSlider"]')
        .forEach(el => { el.style.display = 'none'; });
    },

    hideVideoCards() {
      document.querySelectorAll('.ZVideoItem, [class*="ZVideo"], [class*="VideoCard"]')
        .forEach(el => { el.style.display = 'none'; });
    },

    observeNewAds() {
      this.observer = createBodyObserver((node, cls) => {
        if (!this.config.hideAds) return;
        const patterns = ['Pc-card', 'AdBelow', 'AdblockBanner', 'LiveWrapper',
                          'GoodsCard', 'MCNLinkCard', 'AdaptiveSlider', 'brand-card', 'BrandCard'];
        if (patterns.some(p => cls.includes(p))) {
          node.style.display = 'none';
          return;
        }
        const dataModule = node.getAttribute('data-za-detail-view-path-module') || '';
        if (dataModule.includes('Ad') || dataModule.includes('Sticky')) {
          node.style.display = 'none';
        }
      });
    },

    destroy() {
      if (this.observer) { this.observer.disconnect(); this.observer = null; }
    },
  };

  /* ==================== 模块：黑名单过滤 Filter ==================== */

  const GOODS_KEYWORDS = ['好物推荐', '种草', '测评', '入手', '回购', '安利'];

  const Filter = {
    config: null,
    observer: null,
    _filterTimer: null,

    init(config) {
      this.config = {
        blockKeywords: config.filter.blockKeywords,
        blockAuthors: config.filter.blockAuthors,
        hideLowLike: config.purify.hideLowLike,
        lowLikeThreshold: config.purify.lowLikeThreshold,
      };
      this.filterFeed();
      this.observeNewContent();
    },

    filterFeed() {
      document.querySelectorAll(SELECTORS.CARDS).forEach(card => {
        if (this._isLowLike(card) || this._isBlockedAuthor(card) || this._isBlockedKeyword(card)) {
          card.style.display = 'none';
        }
      });
    },

    _isLowLike(card) {
      if (!this.config.hideLowLike) return false;
      const threshold = this.config.lowLikeThreshold || 10;
      const likeCount = this.getLikeCount(card);
      // 0 = 无法解析，不误杀
      return likeCount > 0 && likeCount < threshold;
    },

    /** 解析赞数（支持 "1.2 万" / "亿" / "k" 格式，与扩展版一致） */
    getLikeCount(card) {
      const voteBtn = card.querySelector('[class*="VoteButton"], button[class*="vote"], [class*="Vote"] button');
      if (!voteBtn) return 0;
      const raw = (voteBtn.textContent || '').replace(/[^\d.万亿kKwW]/g, '').trim();
      if (!raw) return 0;
      let num = parseFloat(raw);
      if (isNaN(num)) return 0;
      if (/万|w|W/.test(raw)) num *= 10000;
      if (/亿/.test(raw)) num *= 100000000;
      if (/k|K/.test(raw)) num *= 1000;
      return Math.round(num);
    },

    _isBlockedAuthor(card) {
      const authors = this.config.blockAuthors;
      if (!authors || authors.length === 0) return false;
      const authorEl = card.querySelector(SELECTORS.AUTHOR);
      const author = authorEl ? authorEl.textContent.trim() : '';
      return author && authors.some(a => author.includes(a));
    },

    _isBlockedKeyword(card) {
      const keywords = this.config.blockKeywords;
      if (!keywords || keywords.length === 0) return false;
      const text = card.textContent || '';
      const titleEl = card.querySelector(SELECTORS.CARD_TITLE);
      const title = titleEl ? titleEl.textContent : '';
      return keywords.some(kw => title.includes(kw) || (text.length < 500 && text.includes(kw)));
    },

    observeNewContent() {
      this.observer = createBodyObserver((node, cls) => {
        if (cls.includes('ContentItem') || cls.includes('List-item') || cls.includes('Card')) {
          if (this._filterTimer) clearTimeout(this._filterTimer);
          this._filterTimer = setTimeout(() => this.filterFeed(), 300);
        }
      });
    },

    destroy() {
      if (this.observer) { this.observer.disconnect(); this.observer = null; }
      if (this._filterTimer) { clearTimeout(this._filterTimer); this._filterTimer = null; }
    },
  };

  /* ==================== 模块：效率增强 Enhance ==================== */

  const Enhance = {
    config: null,
    observer: null,
    _collapseBtn: null,

    init(config) {
      this.config = config.enhance;

      if (this.config.directLinks) this.rewriteDirectLinks();
      if (this.config.showFullTime) this.enhanceTimeDisplay();
      if (this.config.codeCopyButton) this.addCodeCopyButtons();
      if (this.config.collapseAllButton) this.addCollapseAllButton();
      if (this.config.removeLoginPopup) this.removeLoginPopup();

      // 动态内容统一监听（与扩展版 enhance 模块约定一致）
      if (this.config.directLinks || this.config.showFullTime || this.config.codeCopyButton) {
        let timer = null;
        this.observer = createBodyObserver(() => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => this.processDynamicContent(), 500);
        });
      }
    },

    processDynamicContent() {
      if (this.config.directLinks) this.rewriteDirectLinks();
      if (this.config.showFullTime) this.enhanceTimeDisplay();
      if (this.config.codeCopyButton) this.addCodeCopyButtons();
    },

    /** 站外直链还原（link.zhihu.com/?target= 解码） */
    rewriteDirectLinks(root = document) {
      root.querySelectorAll('a[href*="link.zhihu.com/?target="], a[href*="link.zhihu.com%2F%3Ftarget%3D"]')
        .forEach(a => {
          try {
            const url = new URL(a.getAttribute('href'), window.location.origin);
            const target = url.searchParams.get('target');
            if (target) a.setAttribute('href', decodeURIComponent(target));
          } catch (e) { /* 忽略非法链接 */ }
        });
    },

    /** 完整时间显示 + 置顶 */
    enhanceTimeDisplay(root = document) {
      root.querySelectorAll('.ContentItem-time, [class*="ContentItem-time"]').forEach(timeEl => {
        if (timeEl.querySelector('.zmp-full-time')) return;

        const full = timeEl.getAttribute('title') || timeEl.getAttribute('data-tooltip') ||
                     (timeEl.textContent || '').trim();
        if (!full) return;

        const titleAttr = timeEl.getAttribute('title') || timeEl.getAttribute('data-tooltip');
        if (titleAttr) {
          const span = document.createElement('span');
          span.className = 'zmp-full-time';
          span.textContent = titleAttr.trim();
          timeEl.appendChild(span);
        }

        const item = timeEl.closest('.ContentItem, .AnswerItem, [class*="ContentItem"]');
        const head = item ? item.querySelector(SELECTORS.ANSWER_HEADER) : null;
        if (item && head && !head.querySelector('.zmp-top-time')) {
          const topTime = document.createElement('span');
          topTime.className = 'zmp-top-time';
          topTime.textContent = '🕒 ' + full;
          head.appendChild(topTime);
        }
      });
    },

    /** 代码块复制按钮 */
    addCodeCopyButtons(root = document) {
      root.querySelectorAll('pre:not([data-zmp-codecopy])').forEach(pre => {
        pre.setAttribute('data-zmp-codecopy', '1');
        pre.style.position = 'relative';

        const btn = document.createElement('button');
        btn.className = 'zmp-code-copy-btn';
        btn.textContent = '复制代码';
        btn.onclick = () => {
          navigator.clipboard.writeText(pre.innerText).then(() => { btn.textContent = '✓ 已复制'; })
            .catch(() => { btn.textContent = '✗ 复制失败'; });
          setTimeout(() => { btn.textContent = '复制代码'; }, 1500);
        };
        pre.appendChild(btn);
      });
    },

    /** 一键收起全部回答（问题页） */
    addCollapseAllButton() {
      if (this._collapseBtn || !window.location.pathname.includes('/question/')) return;

      const btn = document.createElement('button');
      btn.className = 'zmp-collapse-all-btn';
      btn.textContent = '⤒ 收起全部';
      btn.onclick = () => {
        document.querySelectorAll('.ContentItem-expandButton, button[class*="collapse"], .Button--plain')
          .forEach(b => {
            const text = (b.textContent || '').trim();
            if (text === '收起' || text.includes('收起')) b.click();
          });
      };
      document.body.appendChild(btn);
      this._collapseBtn = btn;
    },

    /** 移除登录弹窗 */
    removeLoginPopup() {
      const dismiss = () => {
        document.querySelectorAll(
          '.Modal-signupModal, .Modal-loginModal, [class*="signFlowModal"], [class*="LoginModal"], [class*="signupModal"]'
        ).forEach(el => { el.style.display = 'none'; });
        const backdrop = document.querySelector('.Modal-backdrop');
        if (backdrop) backdrop.style.display = 'none';
        document.body.style.removeProperty('overflow');
        document.documentElement.style.removeProperty('overflow');
      };
      dismiss();
      setTimeout(dismiss, 1500);
      setTimeout(dismiss, 4000);
    },

    destroy() {
      if (this.observer) { this.observer.disconnect(); this.observer = null; }
      if (this._collapseBtn) { this._collapseBtn.remove(); this._collapseBtn = null; }
    },
  };

  /* ==================== 模块：阅读样式 Reader ==================== */

  const Reader = {
    config: null,

    init(config) {
      this.config = config.reader;
      this.applyStyle();
    },

    applyStyle() {
      if (this.config.fontSize > 0) {
        document.body.style.setProperty('--zmp-font-size', this.config.fontSize + 'px');
        document.documentElement.style.setProperty('font-size', '');
      }
      if (this.config.lineHeight > 0) {
        document.body.style.setProperty('--zmp-line-height', String(this.config.lineHeight));
      }
      toggleBodyClass('zmp-night-mode', this.config.nightMode);
    },

    toggleNightMode() {
      document.body.classList.toggle('zmp-night-mode');
      this.config.nightMode = document.body.classList.contains('zmp-night-mode');
      saveConfig(App.config);
      return this.config.nightMode;
    },
  };

  /* ==================== 模块：快捷键 ==================== */

  const Shortcuts = {
    _keyHandler: null,

    init() {
      this._keyHandler = (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey) return;
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

        switch (e.key.toLowerCase()) {
          case 'n': e.preventDefault(); Reader.toggleNightMode(); break;
          case 's': e.preventDefault(); showSettings(); break;
        }
      };
      document.addEventListener('keydown', this._keyHandler);
    },

    destroy() {
      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = null;
      }
    },
  };

  /* ==================== 设置面板 ==================== */

  /** 设置面板字段定义（label / key / type / options） */
  const SETTINGS_SCHEMA = [
    {
      group: '页面净化',
      items: [
        { label: '隐藏广告推广', key: 'purify.hideAds', type: 'bool' },
        { label: '隐藏直播推送', key: 'purify.hideLiveStream', type: 'bool' },
        { label: '隐藏课程/电子书广告', key: 'purify.hideCourseAds', type: 'bool' },
        { label: '隐藏带货商品卡片', key: 'purify.hideGoodsCards', type: 'bool' },
        { label: '隐藏付费咨询卡片', key: 'purify.hideConsultCards', type: 'bool' },
        { label: '隐藏会员推广横幅', key: 'purify.hideMemberPromo', type: 'bool' },
        { label: '屏蔽视频/视频回答', key: 'purify.hideVideo', type: 'bool' },
        { label: '屏蔽低赞内容', key: 'purify.hideLowLike', type: 'bool' },
        { label: '低赞阈值', key: 'purify.lowLikeThreshold', type: 'number', min: 1, max: 100 },
      ],
    },
    {
      group: '效率增强',
      items: [
        { label: '站外链接直链还原', key: 'enhance.directLinks', type: 'bool' },
        { label: '完整显示发布时间并置顶', key: 'enhance.showFullTime', type: 'bool' },
        { label: '代码块一键复制按钮', key: 'enhance.codeCopyButton', type: 'bool' },
        { label: '一键收起全部回答', key: 'enhance.collapseAllButton', type: 'bool' },
        { label: '自动关闭登录弹窗', key: 'enhance.removeLoginPopup', type: 'bool' },
      ],
    },
    {
      group: '阅读样式',
      items: [
        { label: '夜间模式', key: 'reader.nightMode', type: 'bool' },
        { label: '字号 px（0=不调整）', key: 'reader.fontSize', type: 'number', min: 0, max: 24 },
        { label: '行距（0=不调整）', key: 'reader.lineHeight', type: 'number', min: 0, max: 3, step: 0.1 },
      ],
    },
    {
      group: '黑名单（每行一个）',
      items: [
        { label: '屏蔽关键词', key: 'filter.blockKeywords', type: 'lines' },
        { label: '屏蔽作者', key: 'filter.blockAuthors', type: 'lines' },
      ],
    },
  ];

  /** 按点路径读写配置 */
  function configGet(config, path) {
    return path.split('.').reduce((o, k) => (o ? o[k] : undefined), config);
  }
  function configSet(config, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const obj = keys.reduce((o, k) => o[k], config);
    obj[last] = value;
  }

  function showSettings() {
    const existing = document.getElementById('zmp-lite-settings');
    if (existing) { existing.remove(); return; }

    const config = App.config;
    const panel = document.createElement('div');
    panel.id = 'zmp-lite-settings';

    panel.innerHTML = '<h3>⚙ 知乎增强（轻量版）设置</h3>';

    SETTINGS_SCHEMA.forEach(({ group, items }) => {
      const div = document.createElement('div');
      div.className = 'zmp-ls-group';
      div.innerHTML = `<b>${group}</b>`;
      items.forEach(({ label, key, type, min, max, step }) => {
        const row = document.createElement('label');
        const value = configGet(config, key);

        if (type === 'bool') {
          row.innerHTML = `<span>${label}</span><input type="checkbox" data-key="${key}" ${value ? 'checked' : ''}>`;
        } else if (type === 'number') {
          row.innerHTML = `<span>${label}</span>
            <input type="number" data-key="${key}" value="${value}" min="${min || 0}" max="${max || 999}" step="${step || 1}" style="width:60px;">`;
        } else if (type === 'lines') {
          row.style.flexDirection = 'column';
          row.style.alignItems = 'stretch';
          const val = (value || []).join('\n');
          row.innerHTML = `<span>${label}</span><textarea data-key="${key}" rows="2">${val}</textarea>`;
        }
        div.appendChild(row);
      });
      panel.appendChild(div);
    });

    const footer = document.createElement('div');
    footer.className = 'zmp-ls-footer';
    footer.innerHTML = '<button id="zmp-ls-close">关闭</button><button id="zmp-ls-save">保存并生效</button>';
    panel.appendChild(footer);

    document.body.appendChild(panel);

    document.getElementById('zmp-ls-close').onclick = () => panel.remove();
    document.getElementById('zmp-ls-save').onclick = () => {
      panel.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        const current = configGet(config, key);
        let value;
        if (el.type === 'checkbox') value = el.checked;
        else if (el.type === 'number') value = parseFloat(el.value) || 0;
        else value = el.value.split('\n').map(s => s.trim()).filter(Boolean);
        configSet(config, key, value ?? current);
      });
      saveConfig(config);
      panel.remove();
      App.restart();
      console.log('[ZMP Lite] 设置已保存并生效');
    };
  }

  GM_registerMenuCommand('⚙ 打开设置', showSettings);
  GM_registerMenuCommand('🌙 切换夜间模式', () => Reader.toggleNightMode());

  /* ==================== 主入口 ==================== */

  const App = {
    config: null,
    modules: [Purify, Filter, Enhance, Reader, Shortcuts],

    start() {
      if (this._started) return;
      this._started = true;

      this.config = loadConfig();
      this.modules.forEach(m => m.init(this.config));
      console.log('[ZMP Lite] 知乎增强（轻量版）已启动 v' + GM_info.script.version);
    },

    /** 重启所有模块（设置保存后调用） */
    restart() {
      // 先移除旧的功能类
      document.body.className = document.body.className
        .split(/\s+/).filter(c => !c.startsWith('zmp-')).join(' ');
      this.modules.forEach(m => m.destroy && m.destroy());
      this.modules.forEach(m => m.init(this.config));
    },
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => App.start(), 500);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => App.start(), 500));
  }
})();
