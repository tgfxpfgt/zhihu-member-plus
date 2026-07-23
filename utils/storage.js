/**
 * 知乎盐选会员增强助手 - 本地存储工具模块
 * 封装 chrome.storage.local 读写操作
 */
const ZMPStorage = {
  // 默认配置
  DEFAULTS: {
    // 盐选会员专属
    member: {
      autoRemovePaywall: true,
      hdImages: true,
      hideUpgradePopup: true,
      immersiveDefault: false,
      hideMemberBanner: true,
      contentLabels: true,
      noDisturbReading: true,
      fullscreenReading: false,
      hideTrialCutoff: true,
      purchasedColumns: []
    },
    // 阅读设置
    reader: {
      fontFamily: 'system',
      fontSize: 16,
      lineHeight: 1.8,
      bgColor: 'white',
      immersiveMode: false,
      pagination: false,
      nightMode: false
    },
    // 屏蔽净化
    purify: {
      hideAds: true,
      hideLiveStream: true,
      hideCourseAds: true,
      hideGoodsCards: true,
      hideMemberPromo: true,
      hideConsultCards: true,
      blockKeywords: [],
      blockAuthors: [],
      foldShortComments: true,
      foldAdComments: true,
      minCommentLength: 15,
      searchFilter: true
    },
    // 性能节流
    performance: {
      throttleIdle: true,
      throttleDelay: 120,
      lazyLoadImages: true,
      disableAutoplay: true,
      disablePrefetch: true,
      cleanDOM: true,
      disableAnimations: false,
      thumbnailMode: false
    },
    // 效率工具
    tools: {
      readingProgress: true,
      tocEnabled: true,
      localTags: {}
    },
    // UI增强
    uiEnhance: {
      widescreen: true,
      floatingButton: true,
      debugPanel: false,
      wordCount: true
    },
    // 阅读进度
    progress: {},
    // 会员状态缓存
    memberStatus: {
      isMember: false,
      detected: false,
      lastCheck: 0
    }
  },

  /**
   * 获取完整配置（合并默认值）
   */
  async getAll() {
    try {
      const data = await chrome.storage.local.get('zmpConfig');
      if (data.zmpConfig) {
        return this._deepMerge(JSON.parse(JSON.stringify(this.DEFAULTS)), data.zmpConfig);
      }
      return JSON.parse(JSON.stringify(this.DEFAULTS));
    } catch (e) {
      console.warn('[ZMP] 读取配置失败，使用默认值', e);
      return JSON.parse(JSON.stringify(this.DEFAULTS));
    }
  },

  /**
   * 获取某个分类配置
   */
  async getSection(section) {
    const config = await this.getAll();
    return config[section] || this.DEFAULTS[section];
  },

  /**
   * 保存完整配置
   */
  async saveAll(config) {
    try {
      await chrome.storage.local.set({ zmpConfig: config });
      return true;
    } catch (e) {
      console.warn('[ZMP] 保存配置失败', e);
      return false;
    }
  },

  /**
   * 更新某个分类配置
   */
  async updateSection(section, values) {
    const config = await this.getAll();
    config[section] = { ...config[section], ...values };
    await this.saveAll(config);
    return config;
  },

  /**
   * 更新嵌套字段
   */
  async updateNested(section, key, value) {
    const config = await this.getAll();
    if (config[section]) {
      config[section][key] = value;
    }
    await this.saveAll(config);
    return config;
  },

  /**
   * 深度合并对象
   */
  _deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this._deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  },

  /**
   * 导出配置为JSON字符串
   */
  async exportConfig() {
    const config = await this.getAll();
    return JSON.stringify(config, null, 2);
  },

  /**
   * 从JSON字符串导入配置
   */
  async importConfig(jsonStr) {
    try {
      const imported = JSON.parse(jsonStr);
      const merged = this._deepMerge(JSON.parse(JSON.stringify(this.DEFAULTS)), imported);
      await this.saveAll(merged);
      return true;
    } catch (e) {
      console.warn('[ZMP] 导入配置失败', e);
      return false;
    }
  }
};
