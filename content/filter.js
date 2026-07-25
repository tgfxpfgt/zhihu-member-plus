/**
 * 知乎盐选会员增强助手 - 内容分类过滤模块
 * 关键词/作者黑名单、带货屏蔽、搜索过滤
 */

/** 带货内容选择器 */
const GOODS_SELECTORS = [
  '.GoodsCard', '.MCNLinkCard', '[class*="Goods-"]',
  '[class*="goods-card"]', 'a[href*="item.jd.com"]',
  'a[href*="taobao"]', 'a[href*="tmall"]',
  '[class*="ProductCard"]', '[class*="product-card"]',
];

/** 带货文字关键词（命中≥2个才判定为带货） */
const GOODS_KEYWORDS = ['好物推荐', '种草', '测评', '入手', '回购', '安利'];

const ZMPFilter = {
  config: null,
  _observer: null,
  _filterTimer: null,

  async init(config) {
    this.config = config.purify;
    this.filterFeed();
    this.filterSearchResults();
    this.observeNewContent();
  },

  /**
   * 过滤信息流内容
   */
  filterFeed() {
    const cards = document.querySelectorAll(ZMPUtils.SELECTORS.CARDS);

    cards.forEach(card => {
      // 屏蔽带货内容
      if (this.config.hideGoodsCards && this.hasGoodsContent(card)) {
        card.style.display = 'none';
        return;
      }

      // 作者黑名单
      if (this._isBlockedAuthor(card)) {
        card.style.display = 'none';
        return;
      }

      // 关键词黑名单
      if (this._isBlockedKeyword(card)) {
        card.style.display = 'none';
        return;
      }
    });
  },

  /**
   * 检测是否包含带货内容
   */
  hasGoodsContent(card) {
    for (const sel of GOODS_SELECTORS) {
      if (card.querySelector(sel)) return true;
    }
    // 文字特征检测（需命中≥2个关键词）
    const text = card.textContent || '';
    return GOODS_KEYWORDS.filter(kw => text.includes(kw)).length >= 2;
  },

  /**
   * 检查作者是否在黑名单中
   */
  _isBlockedAuthor(card) {
    const authors = this.config.blockAuthors;
    if (!authors || authors.length === 0) return false;
    const author = this.getAuthorName(card);
    return author && authors.some(a => author.includes(a));
  },

  /**
   * 检查关键词是否命中黑名单
   */
  _isBlockedKeyword(card) {
    const keywords = this.config.blockKeywords;
    if (!keywords || keywords.length === 0) return false;

    const text = card.textContent || '';
    const titleEl = card.querySelector(ZMPUtils.SELECTORS.CARD_TITLE);
    const title = titleEl ? titleEl.textContent : '';

    return keywords.some(kw => title.includes(kw) || (text.length < 500 && text.includes(kw)));
  },

  /**
   * 获取作者名
   */
  getAuthorName(card) {
    const authorEl = card.querySelector(ZMPUtils.SELECTORS.AUTHOR);
    return authorEl ? authorEl.textContent.trim() : '';
  },

  /**
   * 搜索结果过滤
   */
  filterSearchResults() {
    if (!this.config.searchFilter) return;
    if (!window.location.pathname.includes('/search')) return;

    const filterResults = () => {
      const results = document.querySelectorAll('.SearchResult-Card, [class*="SearchResult"]');
      results.forEach(result => {
        if (this.hasGoodsContent(result)) {
          result.style.display = 'none';
          return;
        }
        const keywords = this.config.blockKeywords;
        if (keywords && keywords.length > 0) {
          const text = result.textContent || '';
          if (keywords.some(kw => text.includes(kw))) {
            result.style.display = 'none';
          }
        }
      });
    };

    setTimeout(filterResults, 1500);
  },

  /**
   * 监听新增内容并过滤
   */
  observeNewContent() {
    this._observer = ZMPUtils.createBodyObserver((node, cls) => {
      if (cls.includes('ContentItem') || cls.includes('List-item') || cls.includes('Card')) {
        if (this._filterTimer) clearTimeout(this._filterTimer);
        this._filterTimer = setTimeout(() => this.filterFeed(), 300);
      }
    });
  },

  /**
   * 添加作者到黑名单
   */
  async addAuthorToBlocklist(authorName) {
    if (!authorName) return;
    const authors = this.config.blockAuthors || [];
    if (!authors.includes(authorName)) {
      authors.push(authorName);
      await ZMPStorage.updateNested('purify', 'blockAuthors', authors);
      this.config.blockAuthors = authors;
      this.filterFeed();
    }
  },

  /**
   * 添加关键词到黑名单
   */
  async addKeywordToBlocklist(keyword) {
    if (!keyword) return;
    const keywords = this.config.blockKeywords || [];
    if (!keywords.includes(keyword)) {
      keywords.push(keyword);
      await ZMPStorage.updateNested('purify', 'blockKeywords', keywords);
      this.config.blockKeywords = keywords;
      this.filterFeed();
    }
  },

  /**
   * 销毁观察器
   */
  destroy() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    if (this._filterTimer) { clearTimeout(this._filterTimer); this._filterTimer = null; }
  },
};
