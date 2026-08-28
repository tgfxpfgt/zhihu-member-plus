/**
 * 知乎盐选会员增强助手 - 页面净化模块
 * 移除广告、营销弹窗、推广内容
 */

/**
 * 广告/推广选择器配置
 * selectors: CSS 选择器列表（用于批量移除已有元素）
 * patterns:  className 匹配模式（用于 MutationObserver 拦截新增元素）
 */
const AD_CONFIG = {
  selectors: [
    // 首页推广
    '.Pc-card', '[class*="AdBelowMainColumn"]', '[class*="Pc-word"]', '.AdblockBanner',
    // 信息流广告
    '[data-za-detail-view-path-module*="Ad"]', '[class*="AdaptiveSlider"]',
    // 直播推送
    '.LiveWrapper', '[class*="live-card"]', '[class*="LiveCard"]',
    // 课程广告
    '[class*="Education"]', '.EBookCard', '[class*="course-card"]',
    // 商品带货
    '.GoodsCard', '.MCNLinkCard', '[class*="Goods-"]',
    // 会员推广
    '[class*="MemberButton"]', '[class*="vip-banner"]', '.MembershipGuide', '[class*="openMember"]',
    // 付费咨询
    '[class*="Consult"]',
    // 侧边推广
    '.Card[data-za-detail-view-path-module*="Sticky"]', '[class*="SideBar"] [class*="ad"]',
    // 底部营销
    '[class*="RelatedReadings"]', '[class*="Recommendations-Main"]',
    // 品牌软文
    '[class*="brand-card"]', '[class*="BrandCard"]',
  ],
  patterns: [
    'Pc-card', 'AdBelow', 'AdblockBanner', 'LiveWrapper',
    'live-card', 'LiveCard', 'Education', 'EBookCard',
    'course-card', 'GoodsCard', 'MCNLinkCard', 'Goods-',
    'MemberButton', 'vip-banner', 'MembershipGuide',
    'openMember', 'Consult', 'brand-card', 'BrandCard',
    'AdaptiveSlider',
  ],
};

/** 弹窗拦截关键词 */
const POPUP_KEYWORDS = ['开通', '升级', '课程', '直播', '限时', '优惠', '会员', '付费', '购买'];

/** 视频/视频回答卡片选择器（配合 body.zmp-hide-video 类使用） */
const VIDEO_SELECTORS = [
  '.ZVideoItem', '[class*="ZVideo"]', '[class*="VideoCard"]',
  '.ContentItem[data-zop-type="zvideo"]', '[class*="video-card"]',
  '.SearchResult-Card[class*="Video"]',
];

/**
 * 按页面路径清理侧边栏推广内容
 * { path: 路径片段, selectors: 选择器列表, textFilter: 需要文本匹配的关键词（可选） }
 */
const PAGE_CLEANUP_RULES = [
  {
    path: '/question/',
    selectors: [
      '.Question-sideColumn [class*="course"]', '.Question-sideColumn [class*="consult"]',
      '.Question-sideColumn [class*="goods"]', '.Question-sideColumn [class*="EBook"]',
      '.Question-sideColumn .Card:last-child',
    ],
    textFilter: ['课程', '咨询', '商品', '电子书', '推广'],
  },
  {
    path: '/people/',
    selectors: [
      '[class*="ProfileHeader"] [class*="consult"]', '[class*="ProfileHeader"] [class*="goods"]',
      '[class*="Profile-sideColumn"] [class*="ad"]', '[class*="Profile-sideColumn"] [class*="brand"]',
    ],
    textFilter: null,
  },
];

const ZMPPurify = {
  config: null,
  observer: null,

  async init(config) {
    this.config = config.purify;
    this.applyPurifyClasses();
    this.removeExistingAds();
    if (this.config.hideVideo) this.hideVideoCards();
    this.observeNewAds();
  },

  /**
   * 隐藏视频/视频回答卡片（配合 zmp-hide-video CSS 类兜底）
   */
  hideVideoCards() {
    VIDEO_SELECTORS.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
      } catch (e) { /* 忽略无效选择器 */ }
    });
  },

  /**
   * 根据配置添加净化CSS类
   */
  applyPurifyClasses() {
    const classMap = {
      hideAds:          'zmp-hide-ads',
      hideLiveStream:   'zmp-hide-live',
      hideCourseAds:    'zmp-hide-course',
      hideGoodsCards:   'zmp-hide-goods',
      hideConsultCards: 'zmp-hide-consult',
      hideMemberPromo:  'zmp-hide-member-promo',
    };
    ZMPUtils.applyClassToggles(
      Object.entries(classMap).map(([key, cls]) => ({ key, cls })),
      this.config
    );
  },

  /**
   * 移除页面已有的广告/推广元素
   */
  removeExistingAds() {
    AD_CONFIG.selectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => { el.style.display = 'none'; });
      } catch (e) { /* 选择器可能无效，忽略 */ }
    });

    // 按页面路径清理
    PAGE_CLEANUP_RULES.forEach(rule => this.cleanPageByRule(rule));
  },

  /**
   * 按规则清理特定页面的推广元素
   */
  cleanPageByRule({ path, selectors, textFilter }) {
    if (!window.location.pathname.includes(path)) return;

    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!textFilter) {
            el.style.display = 'none';
            return;
          }
          // 需要文本匹配才隐藏
          const text = el.textContent || '';
          if (textFilter.some(kw => text.includes(kw))) {
            el.style.display = 'none';
          }
        });
      } catch (e) { /* 忽略无效选择器 */ }
    });
  },

  /**
   * 监听新增广告元素 + 拦截弹窗（合并为单个 observer，减少性能开销）
   */
  observeNewAds() {
    this.observer = ZMPUtils.createBodyObserver((node, cls) => {
      // 1. 检查广告元素
      if (this.config.hideAds && AD_CONFIG.patterns.some(p => cls.includes(p))) {
        node.style.display = 'none';
        return;
      }

      // 检查 data 属性标记的广告
      const dataModule = node.getAttribute('data-za-detail-view-path-module') || '';
      if (dataModule.includes('Ad') || dataModule.includes('Sticky')) {
        node.style.display = 'none';
        return;
      }

      // 2. 拦截付费/推销弹窗
      if (cls.includes('Modal') || cls.includes('modal') || cls.includes('Dialog')) {
        const text = node.textContent || '';
        if (POPUP_KEYWORDS.some(kw => text.includes(kw))) {
          node.style.display = 'none';
          const backdrop = document.querySelector('.Modal-backdrop');
          if (backdrop) backdrop.style.display = 'none';
        }
      }
    });
  },

  /**
   * 销毁观察器（节流时调用）
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  },
};
