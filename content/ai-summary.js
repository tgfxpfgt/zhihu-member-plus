/**
 * 知乎盐选会员增强助手 - AI 总结模块
 * 回答/文章下方添加「✨ AI 总结」按钮：
 * OpenAI 兼容接口（DeepSeek/通义/OpenAI/自定义），自带 Key，
 * 流式输出 + Markdown 渲染 + 最近 5 条缓存，总结前确认防误触
 */
const ZMPAISummary = {
  config: null,
  _observer: null,
  _cache: new Map(),   // key: contentId → { text, time }
  _CACHE_MAX: 5,

  /** 默认总结提示词 */
  DEFAULT_PROMPT: '请用简体中文总结以下知乎内容，输出：1）一句话核心观点；2）3-5 条要点列表；3）如内容偏推广/软文，请明确指出。保持简洁客观。',

  async init(config) {
    this.config = config.ai || {};
    if (!this.config.enabled || !this.config.apiKey) return;

    this.injectButtons();
    let timer = null;
    this._observer = ZMPUtils.createBodyObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => this.injectButtons(), 600);
    });
  },

  /**
   * 为每个回答/文章的操作栏注入总结按钮
   */
  injectButtons() {
    if (!this.config.enabled) return;
    document.querySelectorAll('.ContentItem-actions, .AnswerItem .ContentItem-actions')
      .forEach(actions => {
        if (actions.querySelector('.zmp-ai-btn')) return;
        const item = actions.closest('.ContentItem, .AnswerItem, .List-item');
        if (!item) return;

        const btn = ZMPUtils.createButton({ text: '✨ AI 总结', className: 'zmp-ai-btn' });
        btn.onclick = (e) => {
          e.stopPropagation();
          this.handleSummaryClick(item, btn);
        };
        actions.insertBefore(btn, actions.firstChild);
      });
  },

  /**
   * 点击入口：有缓存直接展示，否则弹确认层
   */
  handleSummaryClick(item, btn) {
    const contentEl = item.querySelector('.RichContent-inner, .RichContent');
    const text = contentEl ? contentEl.innerText.trim() : '';
    if (!text) {
      ZMPUtils.showToast('未找到可总结的内容');
      return;
    }

    const cacheKey = this._cacheKey(item, text);
    const cached = this._cache.get(cacheKey);

    if (cached) {
      if (confirm(`该内容已有总结缓存（${new Date(cached.time).toLocaleTimeString()}）\n确定 = 查看缓存，取消 = 重新生成`)) {
        this.renderResult(item, cached.text, true);
        return;
      }
    }
    this.showConfirmPopover(item, text, cacheKey);
  },

  /**
   * 缓存键：条目 id + 内容长度
   */
  _cacheKey(item, text) {
    return (item.getAttribute('data-zop') || location.pathname) + '#' + text.length;
  },

  /**
   * 总结前确认浮层（显示字数，防误触）
   */
  showConfirmPopover(item, text, cacheKey) {
    const old = document.getElementById('zmp-ai-confirm');
    if (old) old.remove();

    const popover = document.createElement('div');
    popover.id = 'zmp-ai-confirm';
    popover.className = 'zmp-ai-confirm';
    popover.innerHTML = `
      <div class="zmp-ai-confirm-title">✨ AI 总结</div>
      <div class="zmp-ai-confirm-meta">本文约 <b>${(text.length / 1000).toFixed(1)}k</b> 字，将发送到你自己配置的模型接口</div>
      <div class="zmp-ai-confirm-btns">
        <button data-act="cancel">取消</button>
        <button data-act="go" class="primary">开始总结</button>
      </div>
    `;
    document.body.appendChild(popover);

    // 定位到按钮附近（居屏幕中下部，避免遮挡）
    popover.style.left = Math.max(16, window.innerWidth / 2 - 160) + 'px';
    popover.style.top = Math.max(80, window.innerHeight / 2 - 80) + 'px';

    popover.querySelector('[data-act="cancel"]').onclick = () => popover.remove();
    popover.querySelector('[data-act="go"]').onclick = () => {
      popover.remove();
      this.summarize(item, text, cacheKey);
    };
    setTimeout(() => popover.remove(), 15000);
  },

  /**
   * 调用 OpenAI 兼容接口（流式输出，失败回退非流式）
   */
  async summarize(item, text, cacheKey) {
    const { baseUrl, apiKey, model } = this.config;
    if (!apiKey) { ZMPUtils.showToast('请先在扩展设置中配置 API Key'); return; }

    const card = this.renderResult(item, '⏳ 正在生成总结…');

    const body = {
      model: model || 'deepseek-chat',
      stream: true,
      messages: [
        { role: 'system', content: this.config.prompt || this.DEFAULT_PROMPT },
        { role: 'user', content: text.slice(0, 12000) },
      ],
    };

    try {
      const resp = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}：${(await resp.text()).slice(0, 200)}`);
      }

      let full = '';
      if (resp.body && resp.body.getReader) {
        // 流式读取 SSE
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              full += (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) || '';
              this.renderResult(item, full || '⏳ …');
            } catch (e) { /* 忽略半包 */ }
          }
        }
      } else {
        const json = await resp.json();
        full = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '(空响应)';
      }

      if (!full.trim()) throw new Error('模型返回为空');
      this.renderResult(item, full);

      // 写入缓存（最多保留 _CACHE_MAX 条）
      this._cache.set(cacheKey, { text: full, time: Date.now() });
      while (this._cache.size > this._CACHE_MAX) {
        this._cache.delete(this._cache.keys().next().value);
      }
    } catch (e) {
      const msg = '❌ 总结失败：' + e.message +
        '\n\n常见原因：接口地址或 Key 无效；所用接口未开启 CORS（跨域）支持。';
      this.renderResult(item, msg);
      console.warn('[ZMP] AI 总结失败', e);
    }
  },

  /**
   * 渲染结果卡片（复用同一卡片，Markdown lite）
   */
  renderResult(item, text, isCached = false) {
    let card = item.querySelector('.zmp-ai-card');
    if (!card) {
      card = document.createElement('div');
      card.className = 'zmp-ai-card';
      const actions = item.querySelector('.ContentItem-actions');
      (actions || item).parentNode.insertBefore(card, (actions || item).nextSibling);
    }
    card.innerHTML = this.renderMarkdown(text) +
      (isCached ? '<div class="zmp-ai-cached">— 来自缓存 —</div>' : '');
    card.style.display = 'block';
    return card;
  },

  /**
   * 轻量 Markdown 渲染（先转义再替换）
   */
  renderMarkdown(text) {
    const esc = ZMPUtils.escapeHtml(text);
    return esc
      .replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="zmp-ai-md-code">${code.trim()}</pre>`)
      .replace(/^#{1,3}\s*(.+)$/gm, '<b class="zmp-ai-md-h">$1</b>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^[-*]\s+(.+)$/gm, '<div class="zmp-ai-md-li">• $1</div>')
      .replace(/^\d+[.)]\s+(.+)$/gm, '<div class="zmp-ai-md-li">$1</div>')
      .replace(/\n/g, '<br>');
  },

  /**
   * 销毁
   */
  destroy() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    document.querySelectorAll('.zmp-ai-btn').forEach(b => b.remove());
    document.querySelectorAll('.zmp-ai-card').forEach(c => c.remove());
    const popover = document.getElementById('zmp-ai-confirm');
    if (popover) popover.remove();
    this._cache.clear();
  },
};
