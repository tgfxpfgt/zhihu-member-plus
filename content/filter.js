/**
 * 知乎盐选会员增强助手 - 内容分类过滤模块
 * 关键词/作者黑名单、带货屏蔽、搜索过滤
 */
const ZMPFilter = {
  config: null,

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
    const cards = document.querySelectorAll('.ContentItem, .Card, [class*="ContentItem"], .List-item');

    cards.forEach(card => {
      // 屏蔽带货内容
      if (this.config.hideGoodsCards) {
        if (this.hasGoodsContent(card)) {
          card.style.display = 'none';
          return;
        }
      }

      // 作者黑名单
      if (this.config.blockAuthors && this.config.blockAuthors.length > 0) {
        const author = this.getAuthorName(card);
        if (author && this.config.blockAuthors.some(a => author.includes(a))) {
          card.style.display = 'none';
          return;
        }
      }

      // 关键词黑名单
      if (this.config.blockKeywords && this.config.blockKeywords.length > 0) {
        const text = card.textContent || '';
        const titleEl = card.querySelector('h2, .ContentItem-title, [class*="ContentItem-title"]');
        const title = titleEl ? titleEl.textContent : '';

        const blocked = this.config.blockKeywords.some(kw =>
          title.includes(kw) || (text.length < 500 && text.includes(kw))
        );
        if (blocked) {
          card.style.display = 'none';
          return;
        }
      }
    });
  },

  /**
   * 检测是否包含带货内容
   */
  hasGoodsContent(card) {
    const goodsSelectors = [
      '.GoodsCard', '.MCNLinkCard', '[class*="Goods-"]',
      '[class*="goods-card"]', 'a[href*="item.jd.com"]',
      'a[href*="taobao"]', 'a[href*="tmall"]',
      '[class*="ProductCard"]', '[class*="product-card"]'
    ];

    for (const sel of goodsSelectors) {
      if (card.querySelector(sel)) return true;
    }

    // 文字特征检测
    const text = card.textContent || '';
    const goodsKeywords = ['好物推荐', '种草', '测评', '入手', '回购', '安利'];
    const hasGoodsText = goodsKeywords.filter(kw => text.includes(kw)).length >= 2;

    return hasGoodsText;
  },

  /**
   * 获取作者名
   */
  getAuthorName(card) {
    const authorEl = card.querySelector(
      '.AuthorInfo-name, [class*="AuthorInfo"] a, .UserLink a, [class*="ContentItem-meta"] a'
    );
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
        const text = result.textContent || '';

        // 过滤带货/软文
        if (this.hasGoodsContent(result)) {
          result.style.display = 'none';
          return;
        }

        // 关键词过滤
        if (this.config.blockKeywords && this.config.blockKeywords.length > 0) {
          const blocked = this.config.blockKeywords.some(kw => text.includes(kw));
          if (blocked) {
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
    const observer = new MutationObserver((mutations) => {
      let shouldFilter = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const cls = node.className || '';
          if (typeof cls === 'string' && (cls.includes('ContentItem') || cls.includes('List-item') || cls.includes('Card'))) {
            shouldFilter = true;
            break;
          }
        }
        if (shouldFilter) break;
      }
      if (shouldFilter) {
        clearTimeout(this._filterTimer);
        this._filterTimer = setTimeout(() => this.filterFeed(), 300);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
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
  }
};
