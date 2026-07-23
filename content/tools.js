/**
 * 知乎盐选会员增强助手 - 效率辅助工具模块
 * 文章导出、阅读进度记忆、目录生成、本地收藏标签
 */
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
    // 仅对文章/回答/专栏页面记录进度
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
    if (totalScroll <= 0) return; // 页面未超出一屏，无需记录

    const scrollPercent = window.scrollY / totalScroll;
    const progress = {
      percent: Math.min(Math.max(scrollPercent, 0), 1),
      scrollY: window.scrollY,
      timestamp: Date.now()
    };

    try {
      const data = await chrome.storage.local.get('zmpConfig');
      const config = data.zmpConfig || {};
      if (!config.progress) config.progress = {};
      config.progress[url] = progress;

      // 只保留最近100条进度
      const keys = Object.keys(config.progress);
      if (keys.length > 100) {
        const sorted = keys.sort((a, b) =>
          (config.progress[a].timestamp || 0) - (config.progress[b].timestamp || 0)
        );
        sorted.slice(0, keys.length - 100).forEach(k => delete config.progress[k]);
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
        // 延迟恢复，等待页面渲染完成
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
    const content = document.querySelector('.Post-RichTextContainer, .RichContent-inner, .RichText');
    if (!content) return;

    const headings = content.querySelectorAll('h1, h2, h3, h4');
    if (headings.length < 3) return; // 标题太少不生成目录

    // 创建目录面板
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
      item.onclick = () => {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      // 给标题添加ID便于定位
      if (!heading.id) {
        heading.id = `zmp-heading-${index}`;
      }

      panel.appendChild(item);
    });

    // 添加关闭按钮
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
    // 仅在文章/回答页添加
    const content = document.querySelector('.Post-RichTextContainer, .RichContent-inner');
    if (!content) return;

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;gap:8px;padding:8px 0;border-top:1px solid #f0f0f0;margin-top:12px;';

    const exportMd = document.createElement('button');
    exportMd.textContent = '📄 导出Markdown';
    exportMd.style.cssText = 'padding:4px 12px;font-size:12px;border:1px solid #d0d0d0;border-radius:4px;background:#fafafa;cursor:pointer;';
    exportMd.onclick = () => this.exportContent('markdown');

    const exportTxt = document.createElement('button');
    exportTxt.textContent = '📝 导出纯文本';
    exportTxt.style.cssText = 'padding:4px 12px;font-size:12px;border:1px solid #d0d0d0;border-radius:4px;background:#fafafa;cursor:pointer;';
    exportTxt.onclick = () => this.exportContent('text');

    toolbar.appendChild(exportMd);
    toolbar.appendChild(exportTxt);
    content.parentNode.insertBefore(toolbar, content.nextSibling);
  },

  /**
   * 导出内容（单篇，仅个人自用）
   */
  exportContent(type) {
    const content = document.querySelector('.Post-RichTextContainer, .RichContent-inner, .RichText');
    if (!content) {
      alert('未找到可导出的文章内容');
      return;
    }

    // 获取标题
    const titleEl = document.querySelector('h1.QuestionHeader-title, h1.Post-Title, h1');
    const title = titleEl ? titleEl.textContent.trim() : '知乎文章';

    let output = '';
    if (type === 'markdown') {
      output = this.convertToMarkdown(content, title);
    } else {
      output = this.convertToText(content, title);
    }

    // 通过background下载
    const filename = title.substring(0, 50).replace(/[\\/:*?"<>|]/g, '_');
    chrome.runtime.sendMessage({
      action: 'downloadFile',
      data: { filename, content: output, type }
    }).catch(e => {
      console.warn('[ZMP] 导出失败', e);
      alert('导出失败，请重试');
    });
  },

  /**
   * 转换为Markdown
   */
  convertToMarkdown(container, title) {
    let md = `# ${title}\n\n`;
    md += `> 导出时间：${new Date().toLocaleString()} | 仅供个人阅读\n\n`;

    const walk = (node) => {
      if (node.nodeType === 3) {
        return node.textContent;
      }
      if (node.nodeType !== 1) return '';

      const tag = node.tagName.toLowerCase();
      let result = '';

      switch (tag) {
        case 'h1': result = `\n# ${node.textContent.trim()}\n\n`; break;
        case 'h2': result = `\n## ${node.textContent.trim()}\n\n`; break;
        case 'h3': result = `\n### ${node.textContent.trim()}\n\n`; break;
        case 'h4': result = `\n#### ${node.textContent.trim()}\n\n`; break;
        case 'p': result = `\n${this.getChildText(node)}\n\n`; break;
        case 'br': result = '\n'; break;
        case 'strong': case 'b': result = `**${this.getChildText(node)}**`; break;
        case 'em': case 'i': result = `*${this.getChildText(node)}*`; break;
        case 'img':
          const src = node.getAttribute('data-actualsrc') || node.getAttribute('data-original') || node.src;
          result = src ? `\n![图片](${src})\n\n` : '';
          break;
        case 'blockquote': result = `\n> ${this.getChildText(node)}\n\n`; break;
        case 'li': result = `- ${this.getChildText(node)}\n`; break;
        case 'ul': case 'ol': result = '\n' + this.getChildText(node) + '\n'; break;
        case 'code': result = `\`${node.textContent}\``; break;
        case 'pre': result = `\n\`\`\`\n${node.textContent}\n\`\`\`\n\n`; break;
        case 'a':
          const href = node.getAttribute('href');
          result = href ? `[${node.textContent}](${href})` : node.textContent;
          break;
        default:
          result = this.getChildText(node);
      }
      return result;
    };

    md += walk(container);
    return md;
  },

  /**
   * 获取子节点文本
   */
  getChildText(node) {
    let text = '';
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) text += child.textContent;
      else if (child.nodeType === 1) text += child.textContent;
    });
    return text;
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
   * 添加本地收藏标签按钮（优化：批量读取storage避免重复IO）
   */
  async addLocalTagButtons() {
    const items = document.querySelectorAll('.ContentItem, .AnswerItem');
    if (items.length === 0) return;

    // 一次性读取配置，避免每个item都调用getAll
    const config = await ZMPStorage.getAll();
    const localTags = config.tools.localTags || {};

    items.forEach(item => {
      if (item.querySelector('.zmp-tag-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'zmp-tag-btn';
      btn.textContent = '+ 标签';
      btn.onclick = async (e) => {
        e.stopPropagation();
        const tag = prompt('输入标签名称（如：技术、生活、待读）：');
        if (!tag || !tag.trim()) return;

        const url = window.location.href.split('#')[0];
        const itemId = item.getAttribute('data-za-detail-view-element_id') || item.id || url;

        const freshConfig = await ZMPStorage.getAll();
        if (!freshConfig.tools.localTags) freshConfig.tools.localTags = {};
        if (!freshConfig.tools.localTags[itemId]) freshConfig.tools.localTags[itemId] = [];

        if (!freshConfig.tools.localTags[itemId].includes(tag.trim())) {
          freshConfig.tools.localTags[itemId].push(tag.trim());
          await ZMPStorage.saveAll(freshConfig);
        }

        this.renderTags(item, itemId);
      };

      const footer = item.querySelector('.ContentItem-footer, [class*="ContentItem-actions"]');
      if (footer) {
        footer.appendChild(btn);
      }

      // 渲染已有标签（使用缓存的配置）
      const itemId = item.getAttribute('data-za-detail-view-element_id') || item.id ||
                     window.location.href.split('#')[0];
      const tags = localTags[itemId] || [];
      tags.forEach(tag => {
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
    // 移除旧标签
    item.querySelectorAll('.zmp-local-tag').forEach(t => t.remove());

    const config = await ZMPStorage.getAll();
    const tags = (config.tools.localTags || {})[itemId] || [];
    tags.forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = 'zmp-local-tag';
      tagEl.textContent = tag;
      item.insertBefore(tagEl, item.firstChild);
    });
  }
};
