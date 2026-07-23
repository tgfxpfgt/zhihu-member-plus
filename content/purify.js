/**
 * 知乎盐选会员增强助手 - 页面净化模块
 * 移除广告、营销弹窗、推广内容
 */
const ZMPPurify = {
  config: null,
  observer: null,

  async init(config) {
    this.config = config.purify;
    this.applyPurifyClasses();
    this.removeExistingAds();
    this.observeNewAds();
    this.blockPopups();
  },

  /**
   * 根据配置添加净化CSS类
   */
  applyPurifyClasses() {
    if (this.config.hideAds) document.body.classList.add('zmp-hide-ads');
    if (this.config.hideLiveStream) document.body.classList.add('zmp-hide-live');
    if (this.config.hideCourseAds) document.body.classList.add('zmp-hide-course');
    if (this.config.hideGoodsCards) document.body.classList.add('zmp-hide-goods');
    if (this.config.hideConsultCards) document.body.classList.add('zmp-hide-consult');
    if (this.config.hideMemberPromo) document.body.classList.add('zmp-hide-member-promo');
  },

  /**
   * 移除页面已有的广告/推广元素
   */
  removeExistingAds() {
    const adSelectors = [
      // 首页推广
      '.Pc-card',
      '[class*="AdBelowMainColumn"]',
      '[class*="Pc-word"]',
      '.AdblockBanner',
      // 信息流广告
      '[data-za-detail-view-path-module*="Ad"]',
      '[class*="AdaptiveSlider"]',
      // 直播推送
      '.LiveWrapper',
      '[class*="live-card"]',
      '[class*="LiveCard"]',
      // 课程广告
      '[class*="Education"]',
      '.EBookCard',
      '[class*="course-card"]',
      // 商品带货
      '.GoodsCard',
      '.MCNLinkCard',
      '[class*="Goods-"]',
      // 会员推广
      '[class*="MemberButton"]',
      '[class*="vip-banner"]',
      '.MembershipGuide',
      '[class*="openMember"]',
      // 付费咨询
      '[class*="Consult"]',
      // 侧边推广
      '.Card[data-za-detail-view-path-module*="Sticky"]',
      '[class*="SideBar"] [class*="ad"]',
      // 底部营销
      '[class*="RelatedReadings"]',
      '[class*="Recommendations-Main"]',
      // 品牌软文标识
      '[class*="brand-card"]',
      '[class*="BrandCard"]'
    ];

    adSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          el.style.display = 'none';
        });
      } catch (e) {
        // 选择器可能无效，忽略
      }
    });

    // 问题页侧边清理
    this.cleanQuestionPage();
    // 个人主页清理
    this.cleanProfilePage();
  },

  /**
   * 问题页清理
   */
  cleanQuestionPage() {
    if (!window.location.pathname.startsWith('/question/')) return;

    const sideSelectors = [
      '.Question-sideColumn [class*="course"]',
      '.Question-sideColumn [class*="consult"]',
      '.Question-sideColumn [class*="goods"]',
      '.Question-sideColumn [class*="EBook"]',
      '.Question-sideColumn .Card:last-child'
    ];

    sideSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const text = el.textContent || '';
          if (text.includes('课程') || text.includes('咨询') || text.includes('商品') ||
              text.includes('电子书') || text.includes('推广')) {
            el.style.display = 'none';
          }
        });
      } catch (e) {}
    });
  },

  /**
   * 个人主页清理
   */
  cleanProfilePage() {
    if (!window.location.pathname.includes('/people/')) return;

    const profileSelectors = [
      '[class*="ProfileHeader"] [class*="consult"]',
      '[class*="ProfileHeader"] [class*="goods"]',
      '[class*="Profile-sideColumn"] [class*="ad"]',
      '[class*="Profile-sideColumn"] [class*="brand"]'
    ];

    profileSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          el.style.display = 'none';
        });
      } catch (e) {}
    });
  },

  /**
   * 监听新增广告元素 + 拦截弹窗（合并为单个observer，减少性能开销）
   */
  observeNewAds() {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const cls = (typeof node.className === 'string') ? node.className : '';

          // 1. 检查广告元素
          this.checkAndRemoveAd(node, cls);

          // 2. 拦截付费/推销弹窗
          if (cls.includes('Modal') || cls.includes('modal') || cls.includes('Dialog')) {
            const text = node.textContent || '';
            if (text.includes('开通') || text.includes('升级') || text.includes('课程') ||
                text.includes('直播') || text.includes('限时') || text.includes('优惠') ||
                text.includes('会员') || text.includes('付费') || text.includes('购买')) {
              node.style.display = 'none';
              const backdrop = document.querySelector('.Modal-backdrop');
              if (backdrop) backdrop.style.display = 'none';
            }
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  },

  /**
   * 检查并移除单个广告节点
   */
  checkAndRemoveAd(node, cls) {
    if (!cls) cls = (typeof node.className === 'string') ? node.className : '';
    if (!cls) return;

    const adPatterns = [
      'Pc-card', 'AdBelow', 'AdblockBanner', 'LiveWrapper',
      'live-card', 'LiveCard', 'Education', 'EBookCard',
      'course-card', 'GoodsCard', 'MCNLinkCard', 'Goods-',
      'MemberButton', 'vip-banner', 'MembershipGuide',
      'openMember', 'Consult', 'brand-card', 'BrandCard',
      'AdaptiveSlider'
    ];

    if (this.config.hideAds && adPatterns.some(p => cls.includes(p))) {
      node.style.display = 'none';
      return;
    }

    // 检查data属性
    const dataModule = node.getAttribute('data-za-detail-view-path-module') || '';
    if (dataModule.includes('Ad') || dataModule.includes('Sticky')) {
      node.style.display = 'none';
    }
  },

  /**
   * 拦截自动弹出弹窗（已合并到observeNewAds）
   */
  blockPopups() {
    // 已合并到 observeNewAds 中统一处理，不再创建单独的observer
  },

  /**
   * 销毁观察器（节流时调用）
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
};
