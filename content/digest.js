/**
 * 知乎盐选会员增强助手 - 一句话提炼模块
 * 本地启发式（零 API 成本）：
 *  1. 长回答顶部插入「一句话」提炼条（首段/加粗句/结论句启发）
 *  2. 内容性质判别：知识/观点/软文/情绪 彩色标签
 */
const ZMPDigest = {
  config: null,
  _observer: null,

  /** 软文关键词 */
  AD_PATTERNS: /(优惠券|优惠|购买|下单|入手|链接在|粉丝|福利|公众号|扫码|私聊|客服|直播间|冲一冲|抄底)/g,
  /** 情绪表达特征 */
  EMOTION_PATTERNS: /(绝了|救命|真的会谢|yyds|emo了|破防|泪目|太离谱|受不了|给我整)/g,
  /** 知识性特征 */
  KNOWLEDGE_PATTERNS: /(研究|实验|数据|原理|机制|来源|参考文献|期刊|论文|据统计|实验表明)/g,

  async init(config) {
    this.config = config.digest || {};
    if (this.config.enabled === false) return;

    this.process();
    let timer = null;
    this._observer = ZMPUtils.createBodyObserver((node, cls) => {
      if (!cls.includes('ContentItem') && !cls.includes('List-item') && !cls.includes('AnswerItem')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => this.process(), 600);
    });
  },

  /**
   * 扫描全部回答，为长内容插入提炼条
   */
  process() {
    if (this.config.enabled === false) return;
    const minWords = this.config.minWords || 500;

    document.querySelectorAll('.ContentItem, .AnswerItem, .List-item').forEach(item => {
      if (item.querySelector('.zmp-digest-bar')) return;
      const content = item.querySelector('.RichContent-inner, .RichContent');
      if (!content) return;

      const text = (content.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length < minWords) return;

      const oneLiner = this.extractOneLiner(content, text);
      if (!oneLiner) return;

      // 渲染提炼条
      const bar = document.createElement('div');
      bar.className = 'zmp-digest-bar';
      let tagHtml = '';
      if (this.config.classify !== false) {
        const kind = this.classify(text);
        tagHtml = `<span class="zmp-digest-tag zmp-digest-${kind.key}">${kind.label}</span>`;
      }
      bar.innerHTML = `<span class="zmp-digest-label">一句话</span>${tagHtml}` +
        `<span class="zmp-digest-text">${ZMPUtils.escapeHtml(oneLiner)}</span>`;
      content.parentNode.insertBefore(bar, content);
    });
  },

  /**
   * 提炼一句话：加粗句 > 首个结论句 > 首段
   */
  extractOneLiner(content, fullText) {
    // 1) 首个加粗片段（作者自己强调的核心）
    const strong = content.querySelector('strong, b');
    if (strong) {
      const t = strong.textContent.trim();
      if (t.length >= 10 && t.length <= 100) return t;
    }
    // 2) 首个结论句
    const conclusion = fullText.match(/(?:总之|综上|所以|因此|结论是)[^。！？]{10,80}[。！？]/);
    if (conclusion) return conclusion[0].slice(0, 100);
    // 3) 首个足够长的段落首句
    const firstSentence = fullText.match(/[^。！？]{15,80}[。！？]/);
    return firstSentence ? firstSentence[0] : null;
  },

  /**
   * 内容性质判别（启发式打分）
   */
  classify(text) {
    const count = (re) => (text.match(re) || []).length;
    const ad = count(this.AD_PATTERNS);
    const emotion = count(this.EMOTION_PATTERNS) + (text.match(/！/g) || []).length / 5;
    const knowledge = count(this.KNOWLEDGE_PATTERNS);

    if (ad >= 2) return { key: 'ad', label: '疑似软文' };
    if (emotion >= 3) return { key: 'emotion', label: '情绪表达' };
    if (knowledge >= 2) return { key: 'knowledge', label: '知识' };
    return { key: 'opinion', label: '观点' };
  },

  /**
   * 销毁
   */
  destroy() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
  },
};
