// ==UserScript==
// @name         知乎盐选会员增强助手（轻量版）
// @namespace    https://github.com/tgfxpfgt/zhihu-member-plus
// @version      2.0.0
// @description  知乎增强轻量版：页面净化、广告屏蔽、按页面分类屏蔽、站外直链、时间显示、代码复制、默认收起回答、直达问题、一句话提炼、划词屏蔽、图片预览、阅读样式、快捷键。与 Chrome 扩展版功能同步演进。
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
 * - 无导出 Markdown / 阅读进度 / 收藏夹 / 统计（扩展版功能更完整）
 * - 无 AI 总结 / TTS 听书 / 回答聚合 / 自动滚动（需要扩展 popup 与消息通道）
 * - 划词工具仅保留"加屏蔽词"（表达本依赖扩展存储层）
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
      hideLowComments: false,
      lowCommentThreshold: 3,
      cleanSearchPage: true,
      blockTypes: {
        home:   { video: false, article: false, pin: false, salt: false, followActivity: true },
        follow: { video: false, article: false, pin: false, salt: false, followActivity: true },
        hot:    { video: false, article: false, pin: false, salt: false },
        search: { video: false, article: false, pin: false, salt: false },
      },
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
      openInNewTab: false,
      collapseByDefault: false,
      showQuestionAuthor: true,
      directQuestionButton: true,
      imageHoverPreview: true,
      nightImageDim: true,
    },
    digest: {
      enabled: true,
      classify: true,
      minWords: 500,
    },
    selection: {
      blockWord: true,
      expressionBook: false,
    },
    reader: {
      fontSize: 0,        // 0 = 不调整
      lineHeight: 0,      // 0 = 不调整
      nightMode: false,
    },
    general: {
      onboarded: false,   // 首次启动引导 toast 已显示（与扩展版 uiEnhance.onboarded 对应）
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

    /* ===== 首次启动引导 toast（与扩展版 content.css 一致） ===== */
    #zmp-onboard-toast {
      position: fixed;
      left: 50%;
      bottom: 32px;
      transform: translateX(-50%);
      z-index: 999999;
      padding: 14px 22px;
      background: rgba(20, 22, 28, 0.92);
      color: #fff;
      border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
      cursor: pointer;
      text-align: center;
      max-width: 90vw;
    }
    #zmp-onboard-toast .zmp-toast-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    #zmp-onboard-toast .zmp-toast-desc {
      font-size: 12px;
      color: #c8cdd6;
      line-height: 1.8;
    }
    #zmp-onboard-toast kbd {
      display: inline-block;
      padding: 0 5px;
      font-size: 11px;
      background: #2d3138;
      border: 1px solid #4a505a;
      border-bottom-width: 2px;
      border-radius: 3px;
      color: #e8eaee;
      font-family: inherit;
    }

    /* ===== v2.0.0 新增 ===== */
    /* 通用 toast */
    #zmp-toast {
      position: fixed;
      left: 50%;
      bottom: 64px;
      transform: translateX(-50%);
      z-index: 1000000;
      padding: 10px 18px;
      background: rgba(20, 22, 28, 0.92);
      color: #fff;
      font-size: 13px;
      border-radius: 8px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
      max-width: 80vw;
      pointer-events: none;
    }

    /* 搜索页净化 */
    body.zmp-clean-search .SearchSideCards,
    body.zmp-clean-search [class*="SearchSide"] { display: none !important; }

    /* 夜间模式图片调暗 */
    body.zmp-night-mode.zmp-night-img-dim img { filter: brightness(0.75) contrast(0.95); }
    body.zmp-night-mode.zmp-night-img-dim .zmp-img-overlay img { filter: none; }

    /* 直达问题按钮 / 提问者 */
    .zmp-direct-q {
      display: inline-block;
      margin-left: 8px;
      padding: 1px 8px;
      font-size: 11px;
      vertical-align: middle;
      background: #eef4ff;
      border: 1px solid #b6d4f5;
      border-radius: 9px;
      color: #2b6fd6;
      text-decoration: none;
    }
    .zmp-direct-q:hover { background: #e0efff; }
    .zmp-question-author {
      display: inline-block;
      margin-left: 12px;
      font-size: 13px;
      color: #8590a6;
    }

    /* 一句话提炼条 */
    .zmp-digest-bar {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
      padding: 7px 12px;
      margin: 8px 0 4px;
      background: #f7f9fc;
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.6;
    }
    .zmp-digest-label { flex-shrink: 0; font-weight: 600; color: #8590a6; font-size: 12px; }
    .zmp-digest-tag { flex-shrink: 0; font-size: 11px; padding: 1px 8px; border-radius: 9px; font-weight: 600; }
    .zmp-digest-tag.zmp-digest-ad { color: #c0392b; background: #fdecea; }
    .zmp-digest-tag.zmp-digest-emotion { color: #b07d1e; background: #fdf3e0; }
    .zmp-digest-tag.zmp-digest-knowledge { color: #1e7e4a; background: #e6f6ee; }
    .zmp-digest-tag.zmp-digest-opinion { color: #2b6fd6; background: #eef4ff; }
    .zmp-digest-text { color: #444; flex: 1; min-width: 200px; }
    body.zmp-night-mode .zmp-digest-bar { background: #1e222a; }
    body.zmp-night-mode .zmp-digest-text { color: #b8bec8; }

    /* 划词工具条 */
    #zmp-sel-toolbar {
      position: fixed;
      display: none;
      gap: 2px;
      padding: 4px;
      background: rgba(20, 22, 28, 0.94);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      z-index: 1000000;
    }
    #zmp-sel-toolbar button {
      border: none;
      background: none;
      color: #d8dce3;
      font-size: 12px;
      padding: 5px 10px;
      border-radius: 5px;
      cursor: pointer;
      white-space: nowrap;
    }
    #zmp-sel-toolbar button:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }

    /* 图片悬停预览 */
    .zmp-img-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.82);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      z-index: 999990;
      cursor: zoom-out;
    }
    .zmp-img-overlay img {
      max-width: 90vw;
      max-height: 88vh;
      border-radius: 4px;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
    }
    .zmp-img-caption { margin-top: 12px; color: rgba(255,255,255,0.55); font-size: 12px; }
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
        ['cleanSearchPage', 'zmp-clean-search'],
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
        hideLowComments: config.purify.hideLowComments,
        lowCommentThreshold: config.purify.lowCommentThreshold,
        blockTypes: config.purify.blockTypes,
      };
      this.filterFeed();
      this.observeNewContent();
    },

    /** 检测当前页面类型（与扩展版 filter.detectPage 一致） */
    detectPage() {
      const path = window.location.pathname;
      if (path.includes('/follow')) return 'follow';
      if (path.includes('/hot')) return 'hot';
      if (path.includes('/search')) return 'search';
      return 'home';
    },

    filterFeed() {
      document.querySelectorAll(SELECTORS.CARDS).forEach(card => {
        if (this._isBlockedType(card) ||
            this._isLowLike(card) ||
            this._isLowComments(card) ||
            this._isBlockedAuthor(card) ||
            this._isBlockedKeyword(card)) {
          card.style.display = 'none';
        }
      });
    },

    /** 按页面分类屏蔽（视频/文章/想法/盐选/关注动态） */
    _isBlockedType(card) {
      const pageRules = this.config.blockTypes && this.config.blockTypes[this.detectPage()];
      if (!pageRules) return false;
      const type = this._getCardType(card);
      if (!type) return false;
      if (type === 'followActivity') {
        return !!pageRules.followActivity && this._isFollowActivity(card);
      }
      return !!pageRules[type];
    },

    /** 识别卡片内容类型（与扩展版一致：zop 优先，结构兜底） */
    _getCardType(card) {
      const zopEl = card.closest('[data-zop]') || card.querySelector('[data-zop]');
      if (zopEl) {
        try {
          const zop = JSON.parse(zopEl.getAttribute('data-zop'));
          if (zop && zop.type) {
            const t = zop.type;
            if (t === 'zvideo' || t === 'video') return 'video';
            if (t === 'article' || t === 'Article') return 'article';
            if (t === 'pin') return 'pin';
          }
        } catch (e) { /* 忽略解析失败 */ }
      }
      if (card.querySelector('.VideoAnswerPlayer, [class*="ZVideoItem"], video')) return 'video';
      if (card.querySelector('.PinItem, [class*="PinItem"]')) return 'pin';
      if (card.querySelector('a[href*="/p/"]')) return 'article';
      if (card.querySelector('[class*="KfeCollection"], [class*="PayWall"], a[href*="/salt/"], a[href*="盐选"]')) return 'salt';
      return null;
    },

    /** 关注动态类卡片（xx 赞同了回答 / xx 关注了问题） */
    _isFollowActivity(card) {
      const source = card.querySelector('.FeedSource, [class*="FeedSource"]');
      if (!source) return false;
      return /赞同了|关注了|回答了|发布了/.test(source.textContent || '');
    },

    /** 低评论内容屏蔽 */
    _isLowComments(card) {
      if (!this.config.hideLowComments) return false;
      const threshold = this.config.lowCommentThreshold || 3;
      const count = this.getCommentCount(card);
      return count > 0 && count < threshold;
    },

    /** 解析评论数（"N 条评论"） */
    getCommentCount(card) {
      const btn = card.querySelector('button[class*="ContentItem-action"], .ContentItem-actions button');
      if (!btn) return 0;
      const match = (btn.textContent || '').match(/(\d+(?:\.\d+)?)\s*(万)?\s*条评论/);
      if (!match) return 0;
      let num = parseFloat(match[1]);
      if (match[2]) num *= 10000;
      return Math.round(num);
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

      toggleBodyClass('zmp-night-img-dim', this.config.nightImageDim);

      if (this.config.directLinks) this.rewriteDirectLinks();
      if (this.config.showFullTime) this.enhanceTimeDisplay();
      if (this.config.codeCopyButton) this.addCodeCopyButtons();
      if (this.config.collapseAllButton) this.addCollapseAllButton();
      if (this.config.removeLoginPopup) this.removeLoginPopup();
      if (this.config.collapseByDefault) this.collapseDefaultAnswers();
      if (this.config.showQuestionAuthor) this.showQuestionAuthor();
      if (this.config.directQuestionButton) this.addDirectQuestionButtons();
      if (this.config.openInNewTab) this.applyOpenInNewTab();
      if (this.config.imageHoverPreview) this.initImagePreview();

      // 动态内容统一监听（与扩展版 enhance 模块约定一致）
      if (this.config.directLinks || this.config.showFullTime || this.config.codeCopyButton ||
          this.config.collapseByDefault || this.config.directQuestionButton || this.config.openInNewTab) {
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
      if (this.config.collapseByDefault) this.collapseDefaultAnswers();
      if (this.config.directQuestionButton) this.addDirectQuestionButtons();
      if (this.config.openInNewTab) this.applyOpenInNewTab();
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

    /* ===== v2.0.0 新增 ===== */

    /** 默认收起长回答（保留前 3 个展开，与扩展版一致） */
    collapseDefaultAnswers() {
      if (!window.location.pathname.includes('/question/')) return;

      document.querySelectorAll('.List-item .ContentItem, .List-item').forEach(item => {
        if (item.dataset.zmpCollapsed) return;
        if (!item.querySelector('.RichContent-inner')) return;

        this._collapsedCount = (this._collapsedCount || 0) + 1;
        item.dataset.zmpCollapsed = '1';
        if (this._collapsedCount <= 3) return;

        const btn = this._findCollapseButton(item);
        if (btn) btn.click();
      });
    },

    _findCollapseButton(item) {
      for (const btn of item.querySelectorAll('button')) {
        if ((btn.textContent || '').trim() === '收起') return btn;
      }
      return null;
    },

    /** 直达问题按钮（/question/x/answer/y → 直达 /question/x） */
    addDirectQuestionButtons(root = document) {
      root.querySelectorAll('a[href*="/answer/"]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const match = href.match(/\/question\/(\d+)\/answer\/\d+/);
        if (!match) return;
        if (!a.closest('h2, .ContentItem-title')) return;
        if (a.parentNode.querySelector('.zmp-direct-q')) return;

        const btn = document.createElement('a');
        btn.className = 'zmp-direct-q';
        btn.href = `https://www.zhihu.com/question/${match[1]}`;
        btn.textContent = '直达问题';
        btn.title = '跳过回答，直接打开问题页';
        a.parentNode.appendChild(btn);
      });
    },

    /** 显示提问者昵称（解析 #js-initialData） */
    showQuestionAuthor() {
      if (!window.location.pathname.includes('/question/')) return;
      if (document.querySelector('.zmp-question-author')) return;

      try {
        const dataEl = document.getElementById('js-initialData');
        if (!dataEl) return;
        const data = JSON.parse(dataEl.textContent);
        const questions = data && data.entities && data.entities.questions;
        if (!questions) return;

        const qid = window.location.pathname.match(/\/question\/(\d+)/);
        const q = (qid && questions[qid[1]]) || Object.values(questions)[0];
        const authorName = q && q.author && q.author.name;
        if (!authorName || authorName === '知乎用户') return;

        const header = document.querySelector('.QuestionHeader-side, .QuestionHeader-Comment');
        if (!header) return;

        const tag = document.createElement('span');
        tag.className = 'zmp-question-author';
        tag.textContent = '提问者：' + authorName;
        header.appendChild(tag);
      } catch (e) { /* 静默失败 */ }
    },

    /** 信息流标题链接新标签页打开 */
    applyOpenInNewTab(root = document) {
      root.querySelectorAll(
        '.TopstoryItem h2 a, .ContentItem-title a, .HotItem a, .SearchResult-Card a'
      ).forEach(a => {
        if (a.dataset.zmpNewTab) return;
        a.dataset.zmpNewTab = '1';
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
    },

    /** 图片悬停预览（正文大图 → 居中放大） */
    initImagePreview() {
      if (this._imgOverHandler) return;
      let overlay = null;

      const hide = () => {
        if (overlay) { overlay.remove(); overlay = null; }
      };
      this._imgOverHandler = (e) => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement)) return;
        if (!img.closest('.RichText, .RichContent-inner, .Post-RichTextContainer')) return;
        if (img.naturalWidth <= 300 || img.naturalHeight <= 200) return;

        hide();
        overlay = document.createElement('div');
        overlay.className = 'zmp-img-overlay';
        const big = document.createElement('img');
        big.src = img.src;
        const caption = document.createElement('span');
        caption.className = 'zmp-img-caption';
        caption.textContent = '点击任意处关闭';
        overlay.append(big, caption);
        overlay.addEventListener('click', hide);
        document.body.appendChild(overlay);
      };
      this._imgOutHandler = (e) => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement)) return;
        if (!overlay || overlay.querySelector('img').src !== img.src) return;
        setTimeout(() => {
          if (overlay && !overlay.matches(':hover')) hide();
        }, 120);
      };
      document.addEventListener('mouseover', this._imgOverHandler, true);
      document.addEventListener('mouseout', this._imgOutHandler, true);
    },

    destroy() {
      if (this.observer) { this.observer.disconnect(); this.observer = null; }
      if (this._collapseBtn) { this._collapseBtn.remove(); this._collapseBtn = null; }
      if (this._imgOverHandler) {
        document.removeEventListener('mouseover', this._imgOverHandler, true);
        this._imgOverHandler = null;
      }
      if (this._imgOutHandler) {
        document.removeEventListener('mouseout', this._imgOutHandler, true);
        this._imgOutHandler = null;
      }
    },
  };

  /* ==================== 模块：一句话提炼 Digest ==================== */

  const AD_PATTERNS = [/关注公众号/g, /添加微信/g, /优惠券/g, /折扣码/g, /下单/g, /直播间/g, /粉丝群/g, /私聊/g];
  const EMOTION_PATTERNS = [/真的[太超好]/g, /绝了/g, /崩溃/g, /泪目/g, /气死/g, /太(难受|心疼|离谱)/g, /救命/g, /破防/g];
  const KNOWLEDGE_PATTERNS = [/首先/g, /其次/g, /原理是/g, /结论是/g, /步骤/g, /方法[是如]/g, /定义/g, /综上/g];

  const Digest = {
    config: null,
    observer: null,

    init(config) {
      this.config = config.digest;
      if (this.config.enabled === false) return;
      this.process();
      let timer = null;
      this.observer = createBodyObserver((node, cls) => {
        if (cls.includes('ContentItem') || cls.includes('List-item')) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => this.process(), 600);
        }
      });
    },

    process() {
      const minWords = this.config.minWords || 500;
      document.querySelectorAll(SELECTORS.CARDS).forEach(item => {
        if (item.querySelector('.zmp-digest-bar')) return;
        const content = item.querySelector('.RichContent-inner, .RichContent');
        if (!content) return;

        const text = (content.innerText || '').replace(/\s+/g, ' ').trim();
        if (text.length < minWords) return;

        const oneLiner = this.extractOneLiner(content, text);
        if (!oneLiner) return;

        const bar = document.createElement('div');
        bar.className = 'zmp-digest-bar';
        let tagHtml = '';
        if (this.config.classify !== false) {
          const kind = this.classify(text);
          tagHtml = `<span class="zmp-digest-tag zmp-digest-${kind.key}">${kind.label}</span>`;
        }
        bar.innerHTML = `<span class="zmp-digest-label">一句话</span>${tagHtml}` +
          `<span class="zmp-digest-text">${escapeHtmlText(oneLiner)}</span>`;
        content.parentNode.insertBefore(bar, content);
      });
    },

    /** 提炼一句话：加粗句 > 结论句 > 首句（与扩展版一致） */
    extractOneLiner(content, fullText) {
      const strong = content.querySelector('strong, b');
      if (strong) {
        const t = strong.textContent.trim();
        if (t.length >= 10 && t.length <= 100) return t;
      }
      const conclusion = fullText.match(/(?:总之|综上|所以|因此|结论是)[^。！？]{10,80}/);
      if (conclusion) return conclusion[0];
      const first = fullText.match(/[^。！？]{15,80}[。！？]/);
      return first ? first[0] : null;
    },

    /** 内容分类（与扩展版 digest.classify 一致） */
    classify(text) {
      const count = (re) => (text.match(re) || []).length;
      const ad = count(/关注公众号|添加微信|优惠券|折扣码|下单|直播间|粉丝群|私聊/g);
      const emotion = count(/真的[太超好]|绝了|崩溃|泪目|气死|太(难受|心疼|离谱)|救命|破防/g) +
        (text.match(/！/g) || []).length / 5;
      const knowledge = count(/首先|其次|原理是|结论是|步骤|方法[是如]|定义|综上/g);

      if (ad >= 2) return { key: 'ad', label: '疑似软文' };
      if (emotion >= 3) return { key: 'emotion', label: '情绪表达' };
      if (knowledge >= 2) return { key: 'knowledge', label: '知识' };
      return { key: 'opinion', label: '观点' };
    },

    destroy() {
      if (this.observer) { this.observer.disconnect(); this.observer = null; }
    },
  };

  /* ==================== 模块：划词工具 Selection ==================== */

  const Selection = {
    config: null,
    _toolbar: null,
    _mouseupHandler: null,
    _mousedownHandler: null,
    _scrollHandler: null,

    init(config) {
      this.config = config.selection;
      if (this.config.blockWord === false) return;

      this._mouseupHandler = () => this._handleSelection();
      this._mousedownHandler = (e) => {
        if (this._toolbar && !this._toolbar.contains(e.target)) this._hide();
      };
      this._scrollHandler = () => this._hide();

      document.addEventListener('mouseup', this._mouseupHandler);
      document.addEventListener('mousedown', this._mousedownHandler, true);
      window.addEventListener('scroll', this._scrollHandler, { passive: true });
    },

    _handleSelection() {
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        if (!sel || !text || text.length < 2 || text.length > 120) return this._hide();

        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) return;

        this._show(text, rect);
      }, 10);
    },

    _show(text, rect) {
      if (!this._toolbar) {
        this._toolbar = document.createElement('div');
        this._toolbar.id = 'zmp-sel-toolbar';
        document.body.appendChild(this._toolbar);

        this._toolbar.addEventListener('mousedown', (e) => e.stopPropagation());
        this._toolbar.addEventListener('click', (e) => {
          if (e.target.dataset.act !== 'block') return;
          this._addBlockWord(e.target.closest('#zmp-sel-toolbar').dataset.text);
          this._hide();
        });
      }
      this._toolbar.innerHTML = '<button data-act="block">＋ 屏蔽</button>';
      this._toolbar.style.display = 'flex';
      this._toolbar.dataset.text = text;

      const tb = this._toolbar.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - tb.width / 2),
        window.innerWidth - tb.width - 8
      );
      const top = rect.top > 60 ? rect.top - tb.height - 8 : rect.bottom + 8;
      this._toolbar.style.left = left + 'px';
      this._toolbar.style.top = Math.max(8, top) + 'px';
    },

    async _addBlockWord(word) {
      const keywords = App.config.filter.blockKeywords || [];
      if (!keywords.includes(word)) {
        keywords.push(word);
        App.config.filter.blockKeywords = keywords;
        saveConfig(App.config);
        Filter.config.blockKeywords = keywords;
        Filter.filterFeed();
        showToast('已屏蔽关键词：' + word);
      }
    },

    _hide() {
      if (this._toolbar) this._toolbar.style.display = 'none';
    },

    destroy() {
      if (this._mouseupHandler) {
        document.removeEventListener('mouseup', this._mouseupHandler);
        this._mouseupHandler = null;
      }
      if (this._mousedownHandler) {
        document.removeEventListener('mousedown', this._mousedownHandler, true);
        this._mousedownHandler = null;
      }
      if (this._scrollHandler) {
        window.removeEventListener('scroll', this._scrollHandler);
        this._scrollHandler = null;
      }
      if (this._toolbar) { this._toolbar.remove(); this._toolbar = null; }
    },
  };

  /** 通用 toast（轻量版） */
  function showToast(message, duration = 2200) {
    const old = document.getElementById('zmp-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'zmp-toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  function escapeHtmlText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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
        { label: '屏蔽低评论内容', key: 'purify.hideLowComments', type: 'bool' },
        { label: '低评论阈值（条）', key: 'purify.lowCommentThreshold', type: 'number', min: 0, max: 20 },
        { label: '净化搜索页（隐藏侧边推荐）', key: 'purify.cleanSearchPage', type: 'bool' },
      ],
    },
    {
      group: '按页面分类屏蔽（首页/关注/热榜/搜索）',
      items: [
        { label: '首页屏蔽视频', key: 'purify.blockTypes.home.video', type: 'bool' },
        { label: '首页屏蔽文章', key: 'purify.blockTypes.home.article', type: 'bool' },
        { label: '首页屏蔽想法', key: 'purify.blockTypes.home.pin', type: 'bool' },
        { label: '首页屏蔽盐选内容', key: 'purify.blockTypes.home.salt', type: 'bool' },
        { label: '首页屏蔽关注动态', key: 'purify.blockTypes.home.followActivity', type: 'bool' },
        { label: '关注页屏蔽视频', key: 'purify.blockTypes.follow.video', type: 'bool' },
        { label: '关注页屏蔽文章', key: 'purify.blockTypes.follow.article', type: 'bool' },
        { label: '关注页屏蔽想法', key: 'purify.blockTypes.follow.pin', type: 'bool' },
        { label: '关注页屏蔽盐选内容', key: 'purify.blockTypes.follow.salt', type: 'bool' },
        { label: '关注页屏蔽关注动态', key: 'purify.blockTypes.follow.followActivity', type: 'bool' },
        { label: '热榜屏蔽视频', key: 'purify.blockTypes.hot.video', type: 'bool' },
        { label: '热榜屏蔽文章', key: 'purify.blockTypes.hot.article', type: 'bool' },
        { label: '热榜屏蔽想法', key: 'purify.blockTypes.hot.pin', type: 'bool' },
        { label: '热榜屏蔽盐选内容', key: 'purify.blockTypes.hot.salt', type: 'bool' },
        { label: '搜索屏蔽视频', key: 'purify.blockTypes.search.video', type: 'bool' },
        { label: '搜索屏蔽文章', key: 'purify.blockTypes.search.article', type: 'bool' },
        { label: '搜索屏蔽想法', key: 'purify.blockTypes.search.pin', type: 'bool' },
        { label: '搜索屏蔽盐选内容', key: 'purify.blockTypes.search.salt', type: 'bool' },
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
        { label: '默认收起长回答（保留前3个）', key: 'enhance.collapseByDefault', type: 'bool' },
        { label: '显示提问者昵称', key: 'enhance.showQuestionAuthor', type: 'bool' },
        { label: '回答链接旁"直达问题"按钮', key: 'enhance.directQuestionButton', type: 'bool' },
        { label: '信息流新标签页打开', key: 'enhance.openInNewTab', type: 'bool' },
        { label: '图片悬停放大预览', key: 'enhance.imageHoverPreview', type: 'bool' },
        { label: '夜间模式下调暗图片', key: 'enhance.nightImageDim', type: 'bool' },
      ],
    },
    {
      group: '一句话提炼',
      items: [
        { label: '显示一句话提炼条', key: 'digest.enabled', type: 'bool' },
        { label: '内容类型标签', key: 'digest.classify', type: 'bool' },
        { label: '最低字数', key: 'digest.minWords', type: 'number', min: 100, max: 2000, step: 100 },
      ],
    },
    {
      group: '划词工具',
      items: [
        { label: '划词添加屏蔽词', key: 'selection.blockWord', type: 'bool' },
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

  /* ==================== 首次启动引导 ==================== */

  /** 首次启动引导 toast（仅显示一次，点击或 8 秒后消失） */
  function showOnboardingToast(config) {
    if (config.general.onboarded) return;

    const toast = document.createElement('div');
    toast.id = 'zmp-onboard-toast';
    toast.innerHTML = `
      <div class="zmp-toast-title">✓ 知乎增强（轻量版）已激活</div>
      <div class="zmp-toast-desc">
        点击 Tampermonkey 图标可打开设置面板<br>
        快捷键：<kbd>Alt</kbd>+<kbd>N</kbd> 夜间模式 · <kbd>Alt</kbd>+<kbd>S</kbd> 设置面板
      </div>
    `;
    const dismiss = () => {
      toast.remove();
      config.general.onboarded = true;
      saveConfig(config);
    };
    toast.addEventListener('click', dismiss);
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.isConnected) dismiss(); }, 8000);
  }

  /* ==================== 主入口 ==================== */

  const App = {
    config: null,
    modules: [Purify, Filter, Enhance, Digest, Selection, Reader, Shortcuts],

    start() {
      if (this._started) return;
      this._started = true;

      this.config = loadConfig();
      this.modules.forEach(m => m.init(this.config));
      showOnboardingToast(this.config);
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
