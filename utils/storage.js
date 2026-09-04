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
      hideVideo: false,
      blockKeywords: [],
      blockAuthors: [],
      foldShortComments: true,
      foldAdComments: true,
      minCommentLength: 15,
      searchFilter: true,
      hideLowLike: false,
      lowLikeThreshold: 10,
      hideLowComments: false,
      lowCommentThreshold: 3,
      cleanSearchPage: true,
      // 分类屏蔽（按页面独立开关）：video=视频回答 article=文章 pin=想法 salt=盐选卡片 followActivity=关注动态
      blockTypes: {
        home:   { video: false, article: false, pin: false, salt: false, followActivity: true },
        follow: { video: false, article: false, pin: false, salt: false, followActivity: true },
        hot:    { video: false, article: false, pin: false, salt: false },
        search: { video: false, article: false, pin: false, salt: false },
      },
    },
    // 效率增强（参考成熟知乎增强项目）
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
    // 划词工具（选中文字浮动工具条）
    selection: {
      blockWord: true,
      expressionBook: true,
      expressions: [],   // { text, url, time }
    },
    // 一句话提炼 + 内容性质判别
    digest: {
      enabled: true,
      classify: true,
      minWords: 500,
    },
    // 本地收藏夹
    collection: {
      enabled: true,
      items: [],         // { id, type, title, author, url, excerpt, time }
    },
    // AI 总结（OpenAI 兼容接口，自带 Key）
    ai: {
      enabled: false,
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: '',
      model: 'deepseek-chat',
      prompt: '',
    },
    // 听书模式（TTS）
    tts: {
      rate: 1,
      voice: '',
    },
    // 回答聚合侧栏（问题页）
    aggregate: {
      enabled: true,
      sortBy: 'vote',
    },
    // 阅读统计与提醒
    stats: {
      enabled: true,
      reminderEnabled: false,
      reminderMinutes: 30,
      daily: {},         // { 'YYYY-MM-DD': { seconds, words, articles } }
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
      contentWidth: 1000,
      theme: 'default',
      floatingButton: true,
      debugPanel: false,
      wordCount: true,
      shortcuts: true,
      onboarded: false,
      autoscrollSpeed: 40,
      shortcutKeys: { menu: 'z', toc: 't', night: 'n', immersive: 'i' },
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
        return this._deepMerge(ZMPUtils.deepClone(this.DEFAULTS), data.zmpConfig);
      }
      return ZMPUtils.deepClone(this.DEFAULTS);
    } catch (e) {
      console.warn('[ZMP] 读取配置失败，使用默认值', e);
      return ZMPUtils.deepClone(this.DEFAULTS);
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
      const merged = this._deepMerge(ZMPUtils.deepClone(this.DEFAULTS), imported);
      await this.saveAll(merged);
      return true;
    } catch (e) {
      console.warn('[ZMP] 导入配置失败', e);
      return false;
    }
  }
};
