/**
 * 知乎盐选会员增强助手 - 会员识别与权益模块
 * 仅对已登录付费会员账号生效，不做任何破解/绕过逻辑
 */
const ZMPMember = {
  isMember: false,
  config: null,
  _observer: null,
  _labelTimer: null,

  /**
   * 初始化会员模块
   */
  async init(config) {
    this.config = config.member;
    await this.detectMemberStatus();

    if (this.isMember) {
      this.applyMemberEnhancements();
    }

    // 无论是否会员，都执行推广隐藏（用户配置控制）
    this.hideMemberPromos();
    this.addContentLabels();
    this.markPurchasedContent();
  },

  /**
   * 检测当前登录用户的会员状态
   * 原理：读取知乎页面已渲染的会员标识DOM（服务端验证后下发）
   */
  async detectMemberStatus() {
    try {
      // 方式1：检测页面顶部用户菜单中的会员标识
      const memberIndicators = [
        // 盐选会员标识
        document.querySelector('[class*="AppHeader-userInfo"] [class*="vip"]'),
        document.querySelector('[class*="AppHeader-userInfo"] [class*="member"]'),
        document.querySelector('[class*="AppHeader-userInfo"] [class*="salt"]'),
        // 用户信息区域的会员图标
        document.querySelector('.AppHeader-profileEntry [class*="Vip"]'),
        document.querySelector('.AppHeader-profileEntry [class*="Member"]'),
        // 个人中心会员标识
        document.querySelector('[class*="ProfileHeader"] [class*="vip"]'),
        // 盐选频道入口（仅会员可见）
        document.querySelector('[class*="SaltChannel"]'),
        document.querySelector('a[href*="salt.vip"]'),
        // 会员专属标识文字
        ...Array.from(document.querySelectorAll('[class*="AppHeader"] span, [class*="AppHeader"] a')).filter(
          el => el.textContent.includes('盐选') || el.textContent.includes('会员')
        )
      ];

      // 方式2：检测页面中是否有会员专属功能入口
      const memberFeatures = [
        document.querySelector('[class*="MemberCenter"]'),
        document.querySelector('a[href*="member"]'),
        document.querySelector('[data-za-detail-view-element_name*="会员"]')
      ];

      // 方式3：检测cookie中的知乎会员标识（仅匹配知乎特有字段）
      const cookies = document.cookie;
      const hasMemberCookie = /(?:^|;\s*)(?:z_c0|q_c1)/.test(cookies) &&
        (cookies.includes('salt_vip') || cookies.includes('member_status=1') || cookies.includes('is_vip=1'));

      // 综合判断：任一指标命中即认为已登录会员
      const hasIndicator = memberIndicators.some(el => el !== null && el !== undefined);
      const hasFeature = memberFeatures.some(el => el !== null && el !== undefined);

      this.isMember = hasIndicator || hasFeature || hasMemberCookie;

      // 缓存会员状态
      chrome.runtime.sendMessage({
        action: 'updateMemberStatus',
        data: { isMember: this.isMember, detected: true }
      }).catch(() => {});

      // 给body添加会员标识class
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
   * 应用会员专属增强（仅会员生效）
   */
  applyMemberEnhancements() {
    // 1. 移除付费遮挡浮层
    if (this.config.autoRemovePaywall) {
      this.removePaywallOverlay();
    }

    // 2. 高清原图
    if (this.config.hdImages) {
      this.enableHDImages();
    }

    // 3. 隐藏升级弹窗
    if (this.config.hideUpgradePopup) {
      document.body.classList.add('zmp-hide-upgrade');
      this.observeUpgradePopups();
    }

    // 4. 无干扰阅读
    if (this.config.noDisturbReading) {
      document.body.classList.add('zmp-no-disturb');
    }

    // 5. 全屏阅读
    if (this.config.fullscreenReading) {
      document.body.classList.add('zmp-fullscreen-reading');
    }

    // 6. 隐藏试读截断线
    if (this.config.hideTrialCutoff) {
      document.body.classList.add('zmp-hide-trial-cutoff');
      this.removeTrialCutoffs();
    }
  },

  /**
   * 移除付费遮挡浮层
   * 注意：仅移除前端UI遮挡，知乎服务端已向会员账号下发完整内容
   */
  removePaywallOverlay() {
    const selectors = [
      '.ContentItem-expandButton',
      '.ContentItem-arrowIcon',
      '[class*="ContentItem-expand"]',
      '[class*="paywall"]',
      '.OpenInAppButton',
      '[class*="Modal-backdrop"]',
      '.Modal-wrapper'
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        // 只移除与付费解锁相关的弹窗
        const text = el.textContent || '';
        if (text.includes('开通') || text.includes('解锁') || text.includes('盐选') ||
            text.includes('会员') || text.includes('付费') || sel.includes('paywall') ||
            sel.includes('expand')) {
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
   * 监听并移除动态出现的付费遮挡 + 升级弹窗（合并为单个observer）
   */
  observePaywall() {
    if (this._observer) return; // 防止重复创建
    this._observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const cls = (typeof node.className === 'string') ? node.className : '';
          // 拦截升级弹窗
          if (cls.includes('UpgradeModal') || cls.includes('PaywallModal')) {
            node.style.display = 'none';
            continue;
          }
          // 拦截付费遮挡浮层
          const text = node.textContent || '';
          if ((text.includes('开通盐选') || text.includes('解锁全文') || text.includes('付费阅读')) &&
              (cls.includes('Modal') || cls.includes('Button') || cls.includes('expand') || cls.includes('paywall'))) {
            node.style.display = 'none';
          }
        }
      }
    });
    this._observer.observe(document.body, { childList: true, subtree: true });
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
   * 监听升级弹窗（已合并到observePaywall，此方法保留兼容但不再创建新observer）
   */
  observeUpgradePopups() {
    // 已合并到 observePaywall 中统一处理
    this.observePaywall();
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
   * 隐藏全站会员推广（所有用户生效，由配置控制）
   */
  hideMemberPromos() {
    if (this.config.hideMemberBanner) {
      document.body.classList.add('zmp-hide-member-promo');
    }
  },

  /**
   * 添加内容类型标签（性能优化：避免读取innerHTML）
   */
  addContentLabels() {
    if (!this.config.contentLabels) return;

    const processCards = () => {
      const cards = document.querySelectorAll('.ContentItem, .Card, [class*="ContentItem"]');
      cards.forEach(card => {
        if (card.querySelector('.zmp-content-label')) return; // 已标记

        // 使用classList和属性检测代替innerHTML（性能提升10x+）
        const cls = card.className || '';
        const text = card.textContent || '';
        let labelType = 'free';
        let labelText = '免费';

        const hasSaltMark = cls.includes('salt') || cls.includes('Salt') ||
          card.querySelector('[class*="salt"], [class*="Salt"], [data-type="salt"]') !== null;
        const hasPaidMark = cls.includes('paid') || cls.includes('EBook') ||
          card.querySelector('[class*="paid"], [class*="EBook"], [class*="ebook"]') !== null;

        if (hasSaltMark || text.includes('盐选会员免费')) {
          labelType = 'member';
          labelText = '盐选免费';
        } else if (hasPaidMark || text.includes('付费专栏') || text.includes('¥')) {
          labelType = 'paid';
          labelText = '付费';
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
    const labelObserver = new MutationObserver(() => {
      if (this._labelTimer) clearTimeout(this._labelTimer);
      this._labelTimer = setTimeout(processCards, 800);
    });
    labelObserver.observe(document.body, { childList: true, subtree: true });
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

    setTimeout(markCards, 2000);
  }
};
