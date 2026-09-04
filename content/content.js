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
  { section: 'purify', key: 'cleanSearchPage',  cls: 'zmp-clean-search' },
  // member
  { section: 'member', key: 'noDisturbReading', cls: 'zmp-no-disturb' },
  { section: 'member', key: 'fullscreenReading', cls: 'zmp-fullscreen-reading' },
  { section: 'member', key: 'hideTrialCutoff',  cls: 'zmp-hide-trial-cutoff' },
  { section: 'member', key: 'hideUpgradePopup', cls: 'zmp-hide-upgrade' },
  // performance
  { section: 'performance', key: 'disableAnimations', cls: 'zmp-no-animations' },
  { section: 'performance', key: 'thumbnailMode',     cls: 'zmp-thumbnail' },
  // enhance
  { section: 'enhance', key: 'nightImageDim',  cls: 'zmp-night-img-dim' },
  // uiEnhance
  { section: 'uiEnhance', key: 'widescreen', cls: 'zmp-widescreen' },
];

/**
 * 各配置段对应的模块列表（一个 section 可对应多个模块，均需同步 config 引用）
 */
const MODULE_CONFIG_MAP = {
  reader:      () => [ZMPReader],
  purify:      () => [ZMPPurify, ZMPFilter],
  member:      () => [ZMPMember],
  performance: () => [ZMPPerformance],
  enhance:     () => [ZMPEnhance, ZMPImages],
  uiEnhance:   () => [ZMPUIEnhance],
  selection:   () => [ZMPSelection],
  digest:      () => [ZMPDigest],
  collection:  () => [ZMPCollection],
  aggregate:   () => [ZMPAggregate],
  tts:         () => [ZMPTTS],
  ai:          () => [ZMPAISummary],
  stats:       () => [ZMPStats],
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
            ZMPPerformance, ZMPTools, ZMPEnhance, ZMPImages, ZMPDigest,
            ZMPSelection, ZMPCollection, ZMPAggregate, ZMPTTS, ZMPAISummary,
            ZMPStats, ZMPUIEnhance];
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

    // 1. 同步各模块的 config 引用（一个 section 可对应多个模块）
    for (const [section, getModules] of Object.entries(MODULE_CONFIG_MAP)) {
      const modules = getModules();
      if (config[section] && Array.isArray(modules)) {
        modules.forEach(m => { if (m) m.config = config[section]; });
      }
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
   * 切换目录面板显隐（已存在则切换，否则生成）
   * @returns {boolean} 切换后目录是否可见
   */
  toggleTocPanel() {
    const toc = document.getElementById('zmp-toc-panel');
    if (toc) {
      toc.classList.toggle('zmp-toc-hidden');
      return !toc.classList.contains('zmp-toc-hidden');
    }
    ZMPTools.generateTOC();
    return true;
  },

  /**
   * 汇总当前页面生效的功能清单（popup 展示用）
   * @returns {{page: string, features: string[]}}
   */
  getActiveFeatures() {
    const config = this.config || {};
    const body = document.body;
    const features = [];

    // 页面环境
    const path = window.location.pathname;
    let page = '其他页面';
    if (path.includes('/question/')) page = '问题页';
    else if (path.includes('/p/')) page = '专栏文章';
    else if (path.includes('/salt/')) page = '盐选内容';
    else if (path.includes('/search')) page = '搜索页';
    else if (path.includes('/hot')) page = '热榜';
    else if (path.includes('/follow')) page = '关注页';
    else if (path === '/' || path.startsWith('/hot')) page = '首页';

    const check = (label, on) => { if (on) features.push(label); };

    // CSS 类开关类
    check('广告净化', body.classList.contains('zmp-hide-ads'));
    check('直播屏蔽', body.classList.contains('zmp-hide-live'));
    check('课程广告屏蔽', body.classList.contains('zmp-hide-course'));
    check('带货卡片屏蔽', body.classList.contains('zmp-hide-goods'));
    check('咨询卡片屏蔽', body.classList.contains('zmp-hide-consult'));
    check('会员推广屏蔽', body.classList.contains('zmp-hide-member-promo'));
    check('视频内容屏蔽', body.classList.contains('zmp-hide-video'));
    check('搜索页净化', body.classList.contains('zmp-clean-search'));
    check('禁用动画', body.classList.contains('zmp-no-animations'));
    check('缩略图模式', body.classList.contains('zmp-thumbnail'));
    check('宽屏显示', body.classList.contains('zmp-widescreen'));
    check('夜间图片调暗', body.classList.contains('zmp-night-img-dim'));
    check('夜间模式', body.classList.contains('zmp-night-mode'));
    check('沉浸阅读', body.classList.contains('zmp-immersive'));

    // 动作类功能（按配置 + 页面适用性）
    check('免打扰阅读', config.member && config.member.noDisturbReading);
    check('站外直链还原', config.enhance && config.enhance.directLinks);
    check('完整时间显示', config.enhance && config.enhance.showFullTime);
    check('代码块复制', config.enhance && config.enhance.codeCopyButton);
    check('默认收起回答', config.enhance && config.enhance.collapseByDefault);
    check('直达问题按钮', config.enhance && config.enhance.directQuestionButton);
    check('新标签页打开', config.enhance && config.enhance.openInNewTab);
    check('图片悬停预览', config.enhance && config.enhance.imageHoverPreview);
    check('划词工具', !!(config.selection && (config.selection.blockWord || config.selection.expressionBook)));
    check('一句话提炼', config.digest && config.digest.enabled !== false);
    check('本地收藏夹', config.collection && config.collection.enabled !== false);
    check('回答聚合侧栏', config.aggregate && config.aggregate.enabled !== false && path.includes('/question/'));
    check('AI 总结', config.ai && config.ai.enabled && config.ai.apiKey);
    check('阅读统计', config.stats && config.stats.enabled);
    check('时长提醒', config.stats && config.stats.enabled && config.stats.reminderEnabled);
    check('会员检测', ZMPMember.isMember);

    return { page, features };
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
        const active = this.toggleTocPanel();
        sendResponse({ success: true, active });
        return false;
      },
      /** popup 打开时同步页面端 UI 状态（快捷按钮 active 显示） */
      getUIState: (_msg, _sender, sendResponse) => {
        const toc = document.getElementById('zmp-toc-panel');
        sendResponse({
          immersive: document.body.classList.contains('zmp-immersive'),
          night: document.body.classList.contains('zmp-night-mode'),
          toc: !!toc && !toc.classList.contains('zmp-toc-hidden'),
          tts: !!document.getElementById('zmp-tts-bar'),
          aggregate: !!document.getElementById('zmp-aggregate-panel'),
        });
        return false;
      },
      /** 切换听书模式 */
      toggleTTS: (_msg, _sender, sendResponse) => {
        sendResponse({ active: ZMPTTS.toggle() });
        return false;
      },
      /** 切换回答聚合侧栏 */
      toggleAggregate: (_msg, _sender, sendResponse) => {
        sendResponse({ active: ZMPAggregate.toggle() });
        return false;
      },
      /** 切换自动滚动 */
      toggleAutoscroll: (_msg, _sender, sendResponse) => {
        sendResponse({ active: ZMPUIEnhance.toggleAutoscroll() });
        return false;
      },
      /** 导出本地收藏夹 */
      exportCollection: (_msg, _sender, sendResponse) => {
        ZMPCollection.exportMarkdown();
        sendResponse({ success: true });
        return false;
      },
      /** 获取当前页面生效的功能清单（popup「本页生效功能」面板） */
      getActiveFeatures: (_msg, _sender, sendResponse) => {
        sendResponse(this.getActiveFeatures());
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
