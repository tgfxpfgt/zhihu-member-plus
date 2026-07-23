/**
 * 知乎盐选会员增强助手 - Content Script 主入口
 * 调度所有子模块，监听配置变更
 */
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
      // 读取配置
      this.config = await ZMPStorage.getAll();

      // 按顺序初始化各模块
      await ZMPMember.init(this.config);
      await ZMPReader.init(this.config);
      await ZMPPurify.init(this.config);
      await ZMPComments.init(this.config);
      await ZMPFilter.init(this.config);
      await ZMPPerformance.init(this.config);
      await ZMPTools.init(this.config);

      // 监听配置实时变更
      this.listenConfigChanges();

      // 监听来自popup的消息
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
        JSON.parse(JSON.stringify(ZMPStorage.DEFAULTS)),
        newConfig
      );

      this.applyConfigChanges();
    });
  },

  /**
   * 应用配置变更
   */
  applyConfigChanges() {
    const config = this.config;

    // 阅读样式实时更新
    if (config.reader) {
      ZMPReader.config = config.reader;
      ZMPReader.applyReadingStyle();

      // 沉浸式模式
      if (config.reader.immersiveMode) {
        document.body.classList.add('zmp-immersive');
      } else {
        document.body.classList.remove('zmp-immersive');
      }

      // 夜间模式
      if (config.reader.nightMode) {
        document.body.classList.add('zmp-night-mode');
      } else {
        document.body.classList.remove('zmp-night-mode');
      }
    }

    // 净化设置
    if (config.purify) {
      ZMPPurify.config = config.purify;
      // 重新应用class
      document.body.classList.toggle('zmp-hide-ads', config.purify.hideAds);
      document.body.classList.toggle('zmp-hide-live', config.purify.hideLiveStream);
      document.body.classList.toggle('zmp-hide-course', config.purify.hideCourseAds);
      document.body.classList.toggle('zmp-hide-goods', config.purify.hideGoodsCards);
      document.body.classList.toggle('zmp-hide-consult', config.purify.hideConsultCards);
      document.body.classList.toggle('zmp-hide-member-promo', config.purify.hideMemberPromo);

      // 重新过滤
      ZMPFilter.config = config.purify;
      ZMPFilter.filterFeed();
    }

    // 会员设置
    if (config.member) {
      ZMPMember.config = config.member;
      document.body.classList.toggle('zmp-no-disturb', config.member.noDisturbReading);
      document.body.classList.toggle('zmp-fullscreen-reading', config.member.fullscreenReading);
      document.body.classList.toggle('zmp-hide-trial-cutoff', config.member.hideTrialCutoff);
      document.body.classList.toggle('zmp-hide-upgrade', config.member.hideUpgradePopup);
    }

    // 性能设置
    if (config.performance) {
      ZMPPerformance.config = config.performance;
      document.body.classList.toggle('zmp-no-animations', config.performance.disableAnimations);
      document.body.classList.toggle('zmp-thumbnail', config.performance.thumbnailMode);
    }
  },

  /**
   * 监听来自popup的消息
   */
  listenMessages() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'toggleImmersive': {
          const immersiveState = ZMPReader.toggleImmersive();
          sendResponse({ active: immersiveState });
          return false;
        }
        case 'toggleNightMode': {
          const nightState = ZMPReader.toggleNightMode();
          sendResponse({ active: nightState });
          return false;
        }
        case 'updateReaderStyle':
          ZMPReader.updateStyle(message.key, message.value);
          sendResponse({ success: true });
          return false;

        case 'getPageInfo':
          sendResponse({
            url: window.location.href,
            title: document.title,
            isMember: ZMPMember.isMember,
            hasContent: !!document.querySelector('.Post-RichTextContainer, .RichContent-inner')
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
          // 不处理的消息（如throttle），交给其他监听器
          return false;
      }
    });
  }
};

// 页面加载完成后启动
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(() => ZMPMain.start(), 500);
} else {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => ZMPMain.start(), 500);
  });
}
