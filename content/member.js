/**
 * 知乎盐选会员增强助手 - 会员识别与权益模块
 * 仅对已登录付费会员账号生效，不做任何破解/绕过逻辑
 *
 * 注意：CSS 类开关（zmp-no-disturb / zmp-hide-upgrade 等）由 content.js
 * 的 CLASS_TOGGLES 统一管理，本模块只负责动作类逻辑（移除遮挡、标记等）。
 */

/** 会员标识 DOM 选择器（命中任一即认为已登录会员） */
const MEMBER_INDICATOR_SELECTORS = [
  '[class*="AppHeader-userInfo"] [class*="vip"]',
  '[class*="AppHeader-userInfo"] [class*="member"]',
  '[class*="AppHeader-userInfo"] [class*="salt"]',
  '.AppHeader-profileEntry [class*="Vip"]',
  '.AppHeader-profileEntry [class*="Member"]',
  '[class*="ProfileHeader"] [class*="vip"]',
  '[class*="SaltChannel"]',
  'a[href*="salt.vip"]',
];

/** 会员功能入口选择器 */
const MEMBER_FEATURE_SELECTORS = [
  '[class*="MemberCenter"]',
  'a[href*="member"]',
  '[data-za-detail-view-element_name*="会员"]',
];

/** 付费遮挡选择器 */
const PAYWALL_SELECTORS = [
  '.ContentItem-expandButton',
  '.ContentItem-arrowIcon',
  '[class*="ContentItem-expand"]',
  '[class*="paywall"]',
  '.OpenInAppButton',
  '[class*="Modal-backdrop"]',
  '.Modal-wrapper',
];

/** 付费相关关键词（用于文本匹配） */
const PAYWALL_KEYWORDS = ['开通', '解锁', '盐选', '会员', '付费'];

const ZMPMember = {
  isMember: false,
  config: null,
  _observer: null,
  _labelObserver: null,
  _labelTimer: null,
  _markTimer: null,

  /**
   * 初始化会员模块
   */
  async init(config) {
    this.config = config.member;
    await this.detectMemberStatus();

    if (this.isMember) {
      this.applyMemberEnhancements();
    }

    this.addContentLabels();
    this.markPurchasedContent();
  },

  /**
   * 检测当前登录用户的会员状态
   * 原理：读取知乎页面已渲染的会员标识DOM + cookie（服务端验证后下发）
   */
  async detectMemberStatus() {
    try {
      const hasIndicator = MEMBER_INDICATOR_SELECTORS.some(sel => document.querySelector(sel));
      const hasFeature = MEMBER_FEATURE_SELECTORS.some(sel => document.querySelector(sel));

      // cookie 检测：匹配知乎特有的会员标识字段
      const cookies = document.cookie;
      const hasMemberCookie = /(?:^|;\s*)(?:z_c0|q_c1)/.test(cookies) &&
        (cookies.includes('salt_vip') || cookies.includes('member_status=1') || cookies.includes('is_vip=1'));

      // 额外检测：AppHeader 区域包含"盐选"/"会员"文字的元素
      const hasMemberText = Array.from(
        document.querySelectorAll('[class*="AppHeader"] span, [class*="AppHeader"] a')
      ).some(el => el.textContent.includes('盐选') || el.textContent.includes('会员'));

      this.isMember = hasIndicator || hasFeature || hasMemberCookie || hasMemberText;

      // 缓存会员状态到 background
      chrome.runtime.sendMessage({
        action: 'updateMemberStatus',
        data: { isMember: this.isMember, detected: true },
      }).catch(() => {});

      if (this.isMember) {
        document.body.classList.add('zmp-member');
      }

      console.log('[ZMP] 会员状态检测:', this.isMember ? '已识别为会员' : '未检测到会员标识');
    } catch (e) {
      console.warn('[ZMP] 会员检测异常', e);
      this.isMember = false;
    }
  },

  /**
   * 应用会员专属增强（仅会员生效，动作类逻辑）
   */
  applyMemberEnhancements() {
    if (this.config.autoRemovePaywall) this.removePaywallOverlay();
    if (this.config.hdImages) this.enableHDImages();
    if (this.config.hideUpgradePopup) this.observePaywall();
    if (this.config.hideTrialCutoff) this.removeTrialCutoffs();
  },

  /**
   * 移除付费遮挡浮层
   * 注意：仅移除前端UI遮挡，知乎服务端已向会员账号下发完整内容
   */
  removePaywallOverlay() {
    PAYWALL_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const text = el.textContent || '';
        // 只移除与付费解锁相关的弹窗
        if (text && PAYWALL_KEYWORDS.some(kw => text.includes(kw)) ||
            sel.includes('paywall') || sel.includes('expand')) {
          el.style.display = 'none';
        }
      });
    });

    // 展开被折叠的正文
    document.querySelectorAll('.RichContent.is-collapsed').forEach(el => {
      el.classList.remove('is-collapsed');
      const inner = el.querySelector('.RichContent-inner');
      if (inner) {
        inner.style.maxHeight = 'none';
        inner.style.webkitMaskImage = 'none';
        inner.style.maskImage = 'none';
      }
    });

    // 持续监听新增的遮挡元素
    this.observePaywall();
  },

  /**
   * 监听并移除动态出现的付费遮挡 + 升级弹窗（合并为单个 observer）
   */
  observePaywall() {
    if (this._observer) return; // 防止重复创建
    this._observer = ZMPUtils.createBodyObserver((node, cls) => {
      // 拦截升级弹窗
      if (cls.includes('UpgradeModal') || cls.includes('PaywallModal')) {
        node.style.display = 'none';
        return;
      }
      // 拦截付费遮挡浮层
      const text = node.textContent || '';
      if ((text.includes('开通盐选') || text.includes('解锁全文') || text.includes('付费阅读')) &&
          (cls.includes('Modal') || cls.includes('Button') || cls.includes('expand') || cls.includes('paywall'))) {
        node.style.display = 'none';
      }
    });
  },

  /**
   * 开启高清原图
   */
  enableHDImages() {
    document.querySelectorAll('img[data-actualsrc], img[data-original]').forEach(img => {
      const hdSrc = img.getAttribute('data-actualsrc') || img.getAttribute('data-original');
      if (hdSrc && hdSrc !== img.src) {
        img.src = hdSrc;
      }
    });
  },

  /**
   * 移除试读截断分割线
   */
  removeTrialCutoffs() {
    document.querySelectorAll('[class*="ContentItem-expandButton"]').forEach(el => {
      el.style.display = 'none';
    });
  },

  /**
   * 添加内容类型标签（性能优化：避免读取innerHTML）
   */
  addContentLabels() {
    if (!this.config.contentLabels) return;

    const processCards = () => {
      const cards = document.querySelectorAll(ZMPUtils.SELECTORS.CARDS);
      cards.forEach(card => {
        if (card.querySelector('.zmp-content-label')) return; // 已标记

        const cls = card.className || '';
        const text = card.textContent || '';

        const hasSaltMark = cls.includes('salt') || cls.includes('Salt') ||
          card.querySelector('[class*="salt"], [class*="Salt"], [data-type="salt"]') !== null;
        const hasPaidMark = cls.includes('paid') || cls.includes('EBook') ||
          card.querySelector('[class*="paid"], [class*="EBook"], [class*="ebook"]') !== null;

        let labelType, labelText;
        if (hasSaltMark || text.includes('盐选会员免费')) {
          labelType = 'member';
          labelText = '盐选免费';
        } else if (hasPaidMark || text.includes('付费专栏') || text.includes('¥')) {
          labelType = 'paid';
          labelText = '付费';
        } else {
          return; // 免费内容不添加标签
        }

        const label = document.createElement('span');
        label.className = `zmp-content-label zmp-label-${labelType}`;
        label.textContent = labelText;
        card.style.position = 'relative';
        card.appendChild(label);
      });
    };

    // 延迟执行等待页面渲染
    setTimeout(processCards, 1500);

    // 监听新增内容（防抖处理，避免频繁触发）
    this._labelObserver = ZMPUtils.createBodyObserver(() => {
      if (this._labelTimer) clearTimeout(this._labelTimer);
      this._labelTimer = setTimeout(processCards, 800);
    });
  },

  /**
   * 标记已购买内容
   */
  markPurchasedContent() {
    const purchased = this.config.purchasedColumns || [];
    if (purchased.length === 0) return;

    const markCards = () => {
      document.querySelectorAll('a[href*="column"], a[href*="ebook"]').forEach(link => {
        const href = link.getAttribute('href') || '';
        const matched = purchased.some(id => href.includes(id));
        if (matched && !link.querySelector('.zmp-purchased-badge')) {
          const badge = document.createElement('span');
          badge.className = 'zmp-purchased-badge';
          badge.textContent = '已购';
          link.style.position = 'relative';
          link.appendChild(badge);
        }
      });
    };

    this._markTimer = setTimeout(markCards, 2000);
  },

  /**
   * 销毁观察器与定时器
   */
  destroy() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    if (this._labelObserver) { this._labelObserver.disconnect(); this._labelObserver = null; }
    if (this._labelTimer) { clearTimeout(this._labelTimer); this._labelTimer = null; }
    if (this._markTimer) { clearTimeout(this._markTimer); this._markTimer = null; }
  },
};
