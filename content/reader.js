/**
 * 知乎盐选会员增强助手 - 沉浸式阅读模式模块
 */
const ZMPReader = {
  config: null,

  /** 背景色 → CSS 类 映射 */
  BG_CLASS_MAP: {
    green: 'zmp-bg-green',
    dark:  'zmp-bg-dark',
  },

  async init(config) {
    this.config = config.reader;
    this.applyReadingStyle();
    this.applyImmersiveMode();
    this.applyNightMode();
    if (this.config.pagination) {
      this.setupPagination();
    }
  },

  /**
   * 应用阅读样式（字体、字号、行距、背景色）
   */
  applyReadingStyle() {
    document.body.classList.add('zmp-reader-styled');

    const fontFamily = this.resolveFont(this.config.fontFamily);
    document.body.style.setProperty('--zmp-font-family', fontFamily);
    document.body.style.setProperty('--zmp-font-size', this.config.fontSize + 'px');
    document.body.style.setProperty('--zmp-line-height', String(this.config.lineHeight));

    this.applyBgColor(this.config.bgColor);
  },

  /**
   * 解析字体配置为 CSS 字体栈
   */
  resolveFont(fontFamily) {
    return ZMPUtils.FONT_MAP[fontFamily] || ZMPUtils.FONT_MAP['system'];
  },

  /**
   * 应用背景色（先清除旧类再添加，防止叠加）
   */
  applyBgColor(bgColor) {
    Object.values(this.BG_CLASS_MAP).forEach(cls => document.body.classList.remove(cls));
    const cls = this.BG_CLASS_MAP[bgColor];
    if (cls) document.body.classList.add(cls);
  },

  /**
   * 切换某个阅读模式类并持久化到配置
   * @returns {boolean} 切换后是否激活
   */
  _togglePersist(cls, key) {
    document.body.classList.toggle(cls);
    const isActive = document.body.classList.contains(cls);
    ZMPStorage.updateNested('reader', key, isActive);
    return isActive;
  },

  /**
   * 应用沉浸式阅读模式
   */
  applyImmersiveMode() {
    ZMPUtils.toggleBodyClass('zmp-immersive', this.config.immersiveMode);
  },

  /**
   * 切换沉浸式模式
   */
  toggleImmersive() {
    return this._togglePersist('zmp-immersive', 'immersiveMode');
  },

  /**
   * 应用夜间模式
   */
  applyNightMode() {
    ZMPUtils.toggleBodyClass('zmp-night-mode', this.config.nightMode);
  },

  /**
   * 切换夜间模式
   */
  toggleNightMode() {
    return this._togglePersist('zmp-night-mode', 'nightMode');
  },

  /**
   * 长文章分页
   */
  setupPagination() {
    const content = document.querySelector(ZMPUtils.SELECTORS.CONTENT);
    if (!content) return;

    const contentHeight = content.scrollHeight;
    const viewportHeight = window.innerHeight;

    // 仅当内容超过2屏时启用分页
    if (contentHeight < viewportHeight * 2) return;

    const paragraphs = Array.from(content.children);
    if (paragraphs.length < 10) return;

    // 计算每页段落数
    const pagesCount = Math.ceil(contentHeight / (viewportHeight * 1.5));
    const perPage = Math.ceil(paragraphs.length / pagesCount);
    const totalPages = Math.ceil(paragraphs.length / perPage);
    let currentPage = 0;

    // 创建分页控件
    const pagination = document.createElement('div');
    pagination.className = 'zmp-pagination';

    const info = document.createElement('span');
    info.style.cssText = 'padding: 6px 12px; font-size: 13px; color: #666;';

    const updateButtons = () => {
      info.textContent = `${currentPage + 1} / ${totalPages}`;
      prevBtn.disabled = currentPage === 0;
      nextBtn.disabled = currentPage === totalPages - 1;
    };

    const showPage = (page) => {
      currentPage = page;
      const start = page * perPage;
      const end = start + perPage;
      paragraphs.forEach((p, i) => {
        p.style.display = (i >= start && i < end) ? '' : 'none';
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      updateButtons();
    };

    const prevBtn = ZMPUtils.createButton({
      text: '上一页',
      onClick: () => { if (currentPage > 0) showPage(currentPage - 1); },
    });
    const nextBtn = ZMPUtils.createButton({
      text: '下一页',
      onClick: () => { if (currentPage < totalPages - 1) showPage(currentPage + 1); },
    });

    pagination.append(prevBtn, info, nextBtn);
    content.parentNode.insertBefore(pagination, content.nextSibling);

    showPage(0);
  },

  /**
   * 动态更新阅读样式（供popup实时调节）
   */
  updateStyle(key, value) {
    switch (key) {
      case 'fontSize':
        document.body.style.setProperty('--zmp-font-size', value + 'px');
        break;
      case 'lineHeight':
        document.body.style.setProperty('--zmp-line-height', String(value));
        break;
      case 'fontFamily':
        document.body.style.setProperty('--zmp-font-family', this.resolveFont(value));
        break;
      case 'bgColor':
        this.applyBgColor(value);
        break;
    }
  },
};
