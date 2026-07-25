/**
 * 知乎盐选会员增强助手 - 效率辅助工具模块
 * 文章导出、阅读进度记忆、目录生成、本地收藏标签
 */

/** Markdown 导出：标签→格式映射表 */
const MD_TAG_FORMATTERS = {
  h1:          (c) => `\n# ${c.trim()}\n\n`,
  h2:          (c) => `\n## ${c.trim()}\n\n`,
  h3:          (c) => `\n### ${c.trim()}\n\n`,
  h4:          (c) => `\n#### ${c.trim()}\n\n`,
  p:           (c) => `\n${c}\n\n`,
  br:          () => '\n',
  strong:      (c) => `**${c}**`,
  b:           (c) => `**${c}**`,
  em:          (c) => `*${c}*`,
  i:           (c) => `*${c}*`,
  blockquote:  (c) => `\n> ${c.trim()}\n\n`,
  li:          (c) => `- ${c.trim()}\n`,
  ul:          (c) => `\n${c}\n`,
  ol:          (c) => `\n${c}\n`,
  code:        (c) => `\`${c}\``,
  pre:         (_c, node) => `\n\`\`\`\n${node.textContent}\n\`\`\`\n\n`,
  a:           (c, node) => {
    const href = node.getAttribute('href');
    return href ? `[${c}](${href})` : c;
  },
  img:         (_c, node) => {
    const src = node.getAttribute('data-actualsrc') || node.getAttribute('data-original') || node.src;
    return src ? `\n![图片](${src})\n\n` : '';
  },
};

const ZMPTools = {
  config: null,
  scrollHandler: null,

  async init(config) {
    this.config = config.tools;

    if (this.config.readingProgress) this.setupReadingProgress();
    if (this.config.tocEnabled) this.generateTOC();
    this.addExportButtons();
    this.addLocalTagButtons();
  },

  /**
   * 阅读进度记忆
   */
  setupReadingProgress() {
    const url = this.getPageKey();
    if (!url) return;

    // 恢复上次阅读位置
    this.restoreProgress(url);

    // 监听滚动保存进度（节流）
    let saveTimer = null;
    this.scrollHandler = () => {
      if (saveTimer) return;
      saveTimer = setTimeout(() => {
        saveTimer = null;
        this.saveProgress(url);
      }, 2000);
    };
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  },

  /**
   * 获取页面唯一标识
   */
  getPageKey() {
    const path = window.location.pathname;
    if (path.includes('/question/') || path.includes('/p/') ||
        path.includes('/answer/') || path.includes('zhuanlan')) {
      return window.location.href.split('#')[0].split('?')[0];
    }
    return null;
  },

  /**
   * 保存阅读进度
   */
  async saveProgress(url) {
    const totalScroll = document.body.scrollHeight - window.innerHeight;
    if (totalScroll <= 0) return;

    const progress = {
      percent: Math.min(Math.max(window.scrollY / totalScroll, 0), 1),
      scrollY: window.scrollY,
      timestamp: Date.now(),
    };

    try {
      const data = await chrome.storage.local.get('zmpConfig');
      const config = data.zmpConfig || {};
      if (!config.progress) config.progress = {};
      config.progress[url] = progress;

      // 只保留最近100条进度
      const keys = Object.keys(config.progress);
      if (keys.length > 100) {
        keys.sort((a, b) =>
          (config.progress[a].timestamp || 0) - (config.progress[b].timestamp || 0)
        );
        keys.slice(0, keys.length - 100).forEach(k => delete config.progress[k]);
      }

      await chrome.storage.local.set({ zmpConfig: config });
    } catch (e) {
      console.warn('[ZMP] 保存进度失败', e);
    }
  },

  /**
   * 恢复阅读进度
   */
  async restoreProgress(url) {
    try {
      const data = await chrome.storage.local.get('zmpConfig');
      const config = data.zmpConfig || {};
      const progress = (config.progress || {})[url];

      if (progress && progress.scrollY > 100) {
        setTimeout(() => {
          window.scrollTo({ top: progress.scrollY, behavior: 'smooth' });
          console.log('[ZMP] 已恢复阅读进度:', Math.round(progress.percent * 100) + '%');
        }, 1500);
      }
    } catch (e) {
      console.warn('[ZMP] 恢复进度失败', e);
    }
  },

  /**
   * 生成目录
   */
  generateTOC() {
    const content = document.querySelector(ZMPUtils.SELECTORS.CONTENT);
    if (!content) return;

    const headings = content.querySelectorAll('h1, h2, h3, h4');
    if (headings.length < 3) return;

    const panel = document.createElement('div');
    panel.className = 'zmp-toc-panel';
    panel.id = 'zmp-toc-panel';

    const title = document.createElement('div');
    title.className = 'zmp-toc-title';
    title.textContent = '📑 目录';
    panel.appendChild(title);

    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName[1]);
      const item = document.createElement('div');
      item.className = 'zmp-toc-item';
      item.setAttribute('data-level', level);
      item.textContent = heading.textContent.trim();
      item.onclick = () => heading.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (!heading.id) heading.id = `zmp-heading-${index}`;
      panel.appendChild(item);
    });

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕ 关闭';
    closeBtn.style.cssText = 'text-align:right;cursor:pointer;font-size:12px;color:#999;margin-top:8px;';
    closeBtn.onclick = () => panel.classList.add('zmp-toc-hidden');
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);
  },

  /**
   * 添加导出按钮
   */
  addExportButtons() {
    const content = document.querySelector(ZMPUtils.SELECTORS.RICH_CONTENT);
    if (!content) return;

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:8px;padding:8px 0;border-top:1px solid #f0f0f0;margin-top:12px;';

    const btnStyle = 'padding:4px 12px;font-size:12px;border:1px solid #d0d0d0;border-radius:4px;background:#fafafa;cursor:pointer;';
    toolbar.append(
      ZMPUtils.createButton({ text: '📄 导出Markdown', style: btnStyle, onClick: () => this.exportContent('markdown') }),
      ZMPUtils.createButton({ text: '📝 导出纯文本', style: btnStyle, onClick: () => this.exportContent('text') }),
    );

    content.parentNode.insertBefore(toolbar, content.nextSibling);
  },

  /**
   * 导出内容（单篇，仅个人自用）
   */
  exportContent(type) {
    const content = document.querySelector(ZMPUtils.SELECTORS.CONTENT);
    if (!content) {
      alert('未找到可导出的文章内容');
      return;
    }

    const titleEl = document.querySelector(ZMPUtils.SELECTORS.TITLE);
    const title = titleEl ? titleEl.textContent.trim() : '知乎文章';

    const output = type === 'markdown'
      ? this.convertToMarkdown(content, title)
      : this.convertToText(content, title);

    const filename = title.substring(0, 50).replace(/[\\/:*?"<>|]/g, '_');
    chrome.runtime.sendMessage({
      action: 'downloadFile',
      data: { filename, content: output, type },
    }).catch(e => {
      console.warn('[ZMP] 导出失败', e);
      alert('导出失败，请重试');
    });
  },

  /**
   * 转换为 Markdown
   * 递归遍历 DOM 树，对每个元素节点应用对应标签的 Markdown 格式
   */
  convertToMarkdown(container, title) {
    let md = `# ${title}\n\n`;
    md += `> 导出时间：${new Date().toLocaleString()} | 仅供个人阅读\n\n`;

    const walkNode = (node) => {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1) return '';

      const tag = node.tagName.toLowerCase();
      // 递归获取子节点内容
      const childContent = Array.from(node.childNodes).map(walkNode).join('');

      // 查找格式化器
      const formatter = MD_TAG_FORMATTERS[tag];
      if (formatter) return formatter(childContent, node);

      // 容器类元素（div/section/article 等）：直接返回子内容
      return childContent;
    };

    md += walkNode(container);
    return md;
  },

  /**
   * 转换为纯文本
   */
  convertToText(container, title) {
    let text = `${title}\n${'='.repeat(title.length * 2)}\n\n`;
    text += `导出时间：${new Date().toLocaleString()} | 仅供个人阅读\n\n`;
    text += container.innerText;
    return text;
  },

  /**
   * 添加本地收藏标签按钮
   */
  async addLocalTagButtons() {
    const items = document.querySelectorAll('.ContentItem, .AnswerItem');
    if (items.length === 0) return;

    // 一次性读取配置，避免每个 item 都调用 getAll
    const config = await ZMPStorage.getAll();
    const localTags = config.tools.localTags || {};

    items.forEach(item => {
      if (item.querySelector('.zmp-tag-btn')) return;

      const btn = ZMPUtils.createButton({ text: '+ 标签', className: 'zmp-tag-btn' });
      btn.onclick = async (e) => {
        e.stopPropagation();
        const tag = prompt('输入标签名称（如：技术、生活、待读）：');
        if (!tag || !tag.trim()) return;

        const itemId = item.getAttribute('data-za-detail-view-element_id') || item.id ||
                       window.location.href.split('#')[0];

        const freshConfig = await ZMPStorage.getAll();
        if (!freshConfig.tools.localTags) freshConfig.tools.localTags = {};
        if (!freshConfig.tools.localTags[itemId]) freshConfig.tools.localTags[itemId] = [];

        if (!freshConfig.tools.localTags[itemId].includes(tag.trim())) {
          freshConfig.tools.localTags[itemId].push(tag.trim());
          await ZMPStorage.saveAll(freshConfig);
        }

        this.renderTags(item, itemId);
      };

      const footer = item.querySelector(ZMPUtils.SELECTORS.ANSWER_FOOTER);
      if (footer) footer.appendChild(btn);

      // 渲染已有标签（使用缓存的配置）
      const itemId = item.getAttribute('data-za-detail-view-element_id') || item.id ||
                     window.location.href.split('#')[0];
      (localTags[itemId] || []).forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'zmp-local-tag';
        tagEl.textContent = tag;
        item.insertBefore(tagEl, item.firstChild);
      });
    });
  },

  /**
   * 渲染标签
   */
  async renderTags(item, itemId) {
    item.querySelectorAll('.zmp-local-tag').forEach(t => t.remove());

    const config = await ZMPStorage.getAll();
    const tags = (config.tools.localTags || {})[itemId] || [];
    tags.forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = 'zmp-local-tag';
      tagEl.textContent = tag;
      item.insertBefore(tagEl, item.firstChild);
    });
  },
};
