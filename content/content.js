/**
 * 知乎盐选会员增强助手 - Content Script 主入口
 * 调度所有子模块，监听配置变更
 */

/**
 * 配置→CSS类 映射表
 * 每个条目：{ section, key, cls } 表示 config[section][key] → body.cls
 */
const CLASS_TOGGLES = [
  // purify
  { section: 'purify', key: 'hideAds',          cls: 'zmp-hide-ads' },
  { section: 'purify', key: 'hideLiveStream',   cls: 'zmp-hide-live' },
  { section: 'purify', key: 'hideCourseAds',    cls: 'zmp-hide-course' },
  { section: 'purify', key: 'hideGoodsCards',   cls: 'zmp-hide-goods' },
  { section: 'purify', key: 'hideConsultCards', cls: 'zmp-hide-consult' },
  { section: 'purify', key: 'hideMemberPromo',  cls: 'zmp-hide-member-promo' },
  // member
  { section: 'member', key: 'noDisturbReading', cls: 'zmp-no-disturb' },
  { section: 'member', key: 'fullscreenReading', cls: 'zmp-fullscreen-reading' },
  { section: 'member', key: 'hideTrialCutoff',  cls: 'zmp-hide-trial-cutoff' },
  { section: 'member', key: 'hideUpgradePopup', cls: 'zmp-hide-upgrade' },
  // performance
  { section: 'performance', key: 'disableAnimations', cls: 'zmp-no-animations' },
  { section: 'performance', key: 'thumbnailMode',     cls: 'zmp-thumbnail' },
  // uiEnhance
  { section: 'uiEnhance', key: 'widescreen', cls: 'zmp-widescreen' },
];

const ZMPMain = {
  config: null,
  initialized: false,

  /**
   * 启动入口
   */
  async start() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      this.config = await ZMPStorage.getAll();

      // 按顺序初始化各模块
      await ZMPMember.init(this.config);
      await ZMPReader.init(this.config);
      await ZMPPurify.init(this.config);
      await ZMPComments.init(this.config);
      await ZMPFilter.init(this.config);
      await ZMPPerformance.init(this.config);
      await ZMPTools.init(this.config);
      await ZMPUIEnhance.init(this.config);

      // 宽屏适配
      if (this.config.uiEnhance?.widescreen) {
        document.body.classList.add('zmp-widescreen');
      }

      this.listenConfigChanges();
      this.listenMessages();

      console.log('[ZMP] 知乎盐选会员增强助手已启动 ✓');
    } catch (e) {
      console.error('[ZMP] 初始化失败', e);
    }
  },

  /**
   * 监听配置变更（popup修改后实时生效）
   */
  listenConfigChanges() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.zmpConfig) return;
      const newConfig = changes.zmpConfig.newValue;
      if (!newConfig) return;

      this.config = ZMPStorage._deepMerge(
        ZMPUtils.deepClone(ZMPStorage.DEFAULTS),
        newConfig
      );
      this.applyConfigChanges();
    });
  },

  /**
   * 应用配置变更
   * 通过 CLASS_TOGGLES 映射表批量切换 CSS 类，避免手写重复逻辑
   */
  applyConfigChanges() {
    const config = this.config;

    // 1. 同步各模块的 config 引用
    const moduleConfigMap = {
      reader: ZMPReader,
      purify: ZMPPurify,
      member: ZMPMember,
      performance: ZMPPerformance,
      uiEnhance: ZMPUIEnhance,
    };
    for (const [section, module] of Object.entries(moduleConfigMap)) {
      if (config[section]) module.config = config[section];
    }

    // 2. 批量切换 CSS 类（数据驱动）
    for (const { section, key, cls } of CLASS_TOGGLES) {
      if (config[section]) {
        ZMPUtils.toggleBodyClass(cls, config[section][key]);
      }
    }

    // 3. 阅读器：沉浸式 + 夜间模式（需要 class 而非 toggle 值）
    if (config.reader) {
      ZMPReader.applyReadingStyle();
      ZMPUtils.toggleBodyClass('zmp-immersive', config.reader.immersiveMode);
      ZMPUtils.toggleBodyClass('zmp-night-mode', config.reader.nightMode);
    }

    // 4. 净化：重新过滤信息流
    if (config.purify) {
      ZMPFilter.config = config.purify;
      ZMPFilter.filterFeed();
    }

    // 5. UI 增强：自定义宽度 + 主题
    if (config.uiEnhance) {
      const width = config.uiEnhance.contentWidth || 1000;
      document.body.style.setProperty('--zmp-content-width', width + 'px');
      this.applyTheme(config.uiEnhance.theme);
    }
  },

  /**
   * 切换美化主题（先清除所有主题类，再添加目标主题）
   */
  applyTheme(theme) {
    ZMPUtils.THEMES.forEach(t => document.body.classList.remove('zmp-theme-' + t));
    document.body.classList.add('zmp-theme-' + (theme || 'default'));
  },

  /**
   * 监听来自popup的消息
   */
  listenMessages() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'toggleImmersive':
          sendResponse({ active: ZMPReader.toggleImmersive() });
          return false;

        case 'toggleNightMode':
          sendResponse({ active: ZMPReader.toggleNightMode() });
          return false;

        case 'updateReaderStyle':
          ZMPReader.updateStyle(message.key, message.value);
          sendResponse({ success: true });
          return false;

        case 'getPageInfo':
          sendResponse({
            url: window.location.href,
            title: document.title,
            isMember: ZMPMember.isMember,
            hasContent: !!document.querySelector(ZMPUtils.SELECTORS.RICH_CONTENT),
          });
          return false;

        case 'exportContent':
          ZMPTools.exportContent(message.type || 'markdown');
          sendResponse({ success: true });
          return false;

        case 'refreshModules':
          this.applyConfigChanges();
          sendResponse({ success: true });
          return false;

        default:
          return false;
      }
    });
  },
};

// 页面加载完成后启动
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(() => ZMPMain.start(), 500);
} else {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => ZMPMain.start(), 500);
  });
}
