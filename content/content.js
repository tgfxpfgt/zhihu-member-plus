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
  { section: 'purify', key: 'hideVideo',        cls: 'zmp-hide-video' },
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

/** 各模块与其配置段的对应关系（同步 config 引用用） */
const MODULE_CONFIG_MAP = {
  reader:      () => ZMPReader,
  purify:      () => ZMPPurify,
  member:      () => ZMPMember,
  performance: () => ZMPPerformance,
  uiEnhance:   () => ZMPUIEnhance,
};

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
      for (const module of this.MODULES) {
        await module.init(this.config);
      }

      // 统一应用配置（CSS 类 / 阅读样式 / 主题 / 宽度 / 过滤）
      this.applyConfigChanges();

      this.listenConfigChanges();
      this.listenMessages();

      console.log('[ZMP] 知乎盐选会员增强助手已启动 ✓');
    } catch (e) {
      console.error('[ZMP] 初始化失败', e);
    }
  },

  /** 按初始化顺序排列的模块列表 */
  get MODULES() {
    return [ZMPMember, ZMPReader, ZMPPurify, ZMPComments, ZMPFilter,
            ZMPPerformance, ZMPTools, ZMPEnhance, ZMPUIEnhance];
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
   * 应用配置变更（初始化和配置变更共用同一入口）
   * 1. 同步各模块 config 引用
   * 2. 按 CLASS_TOGGLES 映射表批量切换 CSS 类
   * 3. 阅读器样式 / 信息流过滤 / 主题 / 内容宽度
   */
  applyConfigChanges() {
    const config = this.config;

    // 1. 同步各模块的 config 引用
    for (const [section, getModule] of Object.entries(MODULE_CONFIG_MAP)) {
      const module = getModule();
      if (config[section] && module) module.config = config[section];
    }

    // 2. 批量切换 CSS 类（数据驱动）
    for (const { section, key, cls } of CLASS_TOGGLES) {
      if (config[section]) {
        ZMPUtils.toggleBodyClass(cls, config[section][key]);
      }
    }

    // 3. 阅读器：刷新样式 + 沉浸式/夜间模式类
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
   * 监听来自popup的消息（映射表驱动）
   * handler 返回 true 表示异步响应
   */
  listenMessages() {
    const handlers = {
      toggleImmersive: (_msg, _sender, sendResponse) => {
        sendResponse({ active: ZMPReader.toggleImmersive() });
        return false;
      },
      toggleNightMode: (_msg, _sender, sendResponse) => {
        sendResponse({ active: ZMPReader.toggleNightMode() });
        return false;
      },
      toggleToc: (_msg, _sender, sendResponse) => {
        const toc = document.getElementById('zmp-toc-panel');
        if (toc) {
          toc.classList.toggle('zmp-toc-hidden');
        } else {
          ZMPTools.generateTOC();
        }
        sendResponse({ success: true });
        return false;
      },
      updateReaderStyle: (msg, _sender, sendResponse) => {
        ZMPReader.updateStyle(msg.key, msg.value);
        sendResponse({ success: true });
        return false;
      },
      getPageInfo: (_msg, _sender, sendResponse) => {
        sendResponse({
          url: window.location.href,
          title: document.title,
          isMember: ZMPMember.isMember,
          hasContent: !!document.querySelector(ZMPUtils.SELECTORS.RICH_CONTENT),
        });
        return false;
      },
      exportContent: (msg, _sender, sendResponse) => {
        ZMPTools.exportContent(msg.type || 'markdown');
        sendResponse({ success: true });
        return false;
      },
      refreshModules: (_msg, _sender, sendResponse) => {
        this.applyConfigChanges();
        sendResponse({ success: true });
        return false;
      },
    };

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const handler = handlers[message.action];
      return handler ? handler(message, sender, sendResponse) : false;
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
