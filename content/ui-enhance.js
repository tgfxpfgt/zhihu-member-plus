/**
 * 知乎盐选会员增强助手 - UI增强模块
 * 悬浮按钮、调试浮窗、回答字数统计、热门问题一键打开
 */
const ZMPUIEnhance = {
  config: null,
  debugPanel: null,
  debugLogs: [],
  _debugInterval: null,

  async init(config) {
    this.config = config.uiEnhance || {};

    if (this.config.floatingButton !== false) this.createFloatingButton();
    if (this.config.debugPanel) this.createDebugPanel();
    if (this.config.wordCount !== false) this.addWordCount();
  },

  /**
   * 创建悬浮按钮（便于打开扩展菜单）
   */
  createFloatingButton() {
    if (document.getElementById('zmp-float-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'zmp-float-btn';
    btn.innerHTML = 'Z';
    btn.title = '知乎会员增强 - 快捷菜单';

    const menu = document.createElement('div');
    menu.id = 'zmp-float-menu';
    menu.className = 'zmp-float-menu-hidden';
    menu.innerHTML = `
      <div class="zmp-fm-title">快捷操作</div>
      <button class="zmp-fm-btn" data-action="immersive">📖 沉浸阅读</button>
      <button class="zmp-fm-btn" data-action="night">🌙 夜间模式</button>
      <button class="zmp-fm-btn" data-action="toc">📑 文章目录</button>
      <button class="zmp-fm-btn" data-action="top">⬆ 回到顶部</button>
      <button class="zmp-fm-btn" data-action="bottom">⬇ 跳到底部</button>
      <button class="zmp-fm-btn" data-action="hot">🔥 打开热门30问</button>
      <button class="zmp-fm-btn" data-action="debug">🔧 调试面板</button>
      <button class="zmp-fm-btn" data-action="popup">⚙ 完整设置</button>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('zmp-float-menu-hidden');
    });

    document.addEventListener('click', () => {
      menu.classList.add('zmp-float-menu-hidden');
    });

    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = e.target.dataset.action;
      if (!action) return;
      this.handleMenuAction(action);
    });

    document.body.append(btn, menu);
  },

  /**
   * 处理悬浮菜单操作
   */
  handleMenuAction(action) {
    switch (action) {
      case 'immersive':
        ZMPReader.toggleImmersive();
        break;
      case 'night':
        ZMPReader.toggleNightMode();
        break;
      case 'toc': {
        const toc = document.getElementById('zmp-toc-panel');
        if (toc) toc.classList.toggle('zmp-toc-hidden');
        else ZMPTools.generateTOC();
        break;
      }
      case 'top':
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'bottom':
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        break;
      case 'hot':
        this.openHotQuestions();
        break;
      case 'debug':
        this.toggleDebugPanel();
        break;
      case 'popup':
        window.open(chrome.runtime.getURL('popup/popup.html'), '_blank', 'width=420,height=600');
        break;
    }
    document.getElementById('zmp-float-menu').classList.add('zmp-float-menu-hidden');
  },

  /**
   * 创建调试浮窗
   */
  createDebugPanel() {
    if (document.getElementById('zmp-debug-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'zmp-debug-panel';
    panel.innerHTML = `
      <div class="zmp-debug-header">
        <span>🔧 ZMP 调试面板</span>
        <button id="zmp-debug-close">✕</button>
      </div>
      <div class="zmp-debug-body">
        <div class="zmp-debug-info">
          <div>会员状态: <span id="zmp-dbg-member">检测中...</span></div>
          <div>页面URL: <span id="zmp-dbg-url"></span></div>
          <div>DOM节点: <span id="zmp-dbg-dom">0</span></div>
          <div>隐藏广告: <span id="zmp-dbg-ads">0</span></div>
          <div>内存估算: <span id="zmp-dbg-mem">N/A</span></div>
          <div>运行时间: <span id="zmp-dbg-time">0s</span></div>
        </div>
        <div class="zmp-debug-log" id="zmp-debug-log"></div>
      </div>
    `;

    document.body.appendChild(panel);
    this.debugPanel = panel;

    document.getElementById('zmp-debug-close').onclick = () => {
      panel.style.display = 'none';
      ZMPStorage.updateNested('uiEnhance', 'debugPanel', false);
    };

    this.startDebugRefresh();
    this.log('调试面板已启动');
  },

  /**
   * 切换调试面板
   */
  toggleDebugPanel() {
    const panel = document.getElementById('zmp-debug-panel');
    if (!panel) {
      this.createDebugPanel();
      ZMPStorage.updateNested('uiEnhance', 'debugPanel', true);
    } else {
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : 'block';
      ZMPStorage.updateNested('uiEnhance', 'debugPanel', !visible);
    }
  },

  /**
   * 定时刷新调试信息
   */
  startDebugRefresh() {
    const startTime = Date.now();
    this._debugInterval = setInterval(() => {
      const panel = document.getElementById('zmp-debug-panel');
      if (!panel || panel.style.display === 'none') return;

      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      set('zmp-dbg-member', ZMPMember.isMember ? '✓ 已识别' : '✗ 未检测到');
      set('zmp-dbg-url', location.pathname.substring(0, 40));
      set('zmp-dbg-dom', document.querySelectorAll('*').length.toLocaleString());
      set('zmp-dbg-ads', document.querySelectorAll('[style*="display: none"], [style*="display:none"]').length);
      set('zmp-dbg-time', Math.round((Date.now() - startTime) / 1000) + 's');

      if (performance.memory) {
        set('zmp-dbg-mem', (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB');
      }
    }, 2000);
  },

  /**
   * 添加调试日志
   */
  log(msg) {
    this.debugLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (this.debugLogs.length > 50) this.debugLogs.shift();
    const logEl = document.getElementById('zmp-debug-log');
    if (logEl) {
      logEl.textContent = this.debugLogs.join('\n');
      logEl.scrollTop = logEl.scrollHeight;
    }
  },

  /**
   * 回答字数统计 + 一键跳转尾部
   */
  addWordCount() {
    const answers = document.querySelectorAll(ZMPUtils.SELECTORS.RICH_CONTENT);
    answers.forEach((answer, idx) => {
      if (answer.querySelector('.zmp-word-count')) return;

      const text = answer.innerText || '';
      const charCount = text.replace(/\s/g, '').length;
      const readTime = Math.max(1, Math.ceil(charCount / 500));

      const bar = document.createElement('div');
      bar.className = 'zmp-word-count';
      bar.innerHTML = `
        <span>📝 ${charCount.toLocaleString()} 字 · 约 ${readTime} 分钟</span>
        <button class="zmp-jump-end-btn" data-idx="${idx}">⬇ 跳转尾部</button>
      `;

      answer.parentNode.insertBefore(bar, answer);
    });

    // 绑定跳转事件
    document.querySelectorAll('.zmp-jump-end-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const targets = document.querySelectorAll(ZMPUtils.SELECTORS.RICH_CONTENT);
        if (targets[idx]) {
          const rect = targets[idx].getBoundingClientRect();
          window.scrollBy({ top: rect.bottom - window.innerHeight + 50, behavior: 'smooth' });
        }
      });
    });
  },

  /**
   * 一键打开热门所有30个问题
   */
  async openHotQuestions() {
    this.log('开始获取热门问题列表...');

    try {
      const response = await fetch('https://www.zhihu.com/hot', { credentials: 'include' });
      const html = await response.text();

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const links = doc.querySelectorAll('a[href*="/question/"]');

      const urls = [];
      const seen = new Set();
      links.forEach(a => {
        const match = a.getAttribute('href')?.match(/\/question\/(\d+)/);
        if (match && !seen.has(match[1])) {
          seen.add(match[1]);
          urls.push(`https://www.zhihu.com/question/${match[1]}`);
        }
      });

      // 备用方案：从当前页面侧边热榜获取
      if (urls.length === 0) {
        document.querySelectorAll('.HotList-item a, [class*="HotItem"] a[href*="/question/"]')
          .forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/question/') && !seen.has(href)) {
              seen.add(href);
              urls.push(href.startsWith('http') ? href : `https://www.zhihu.com${href}`);
            }
          });
      }

      const toOpen = urls.slice(0, 30);
      if (toOpen.length === 0) {
        alert('未找到热门问题，请先访问知乎热榜页面 (zhihu.com/hot)');
        this.log('错误：未找到热门问题链接');
        return;
      }

      this.log(`找到 ${toOpen.length} 个热门问题，正在打开...`);

      // 逐个打开（间隔100ms避免被浏览器拦截）
      for (const url of toOpen) {
        window.open(url, '_blank');
        await new Promise(r => setTimeout(r, 100));
      }

      this.log(`已打开 ${toOpen.length} 个热门问题`);
    } catch (e) {
      this.log('获取热门失败: ' + e.message);
      window.open('https://www.zhihu.com/hot', '_blank');
    }
  },

  /**
   * 销毁（清除定时器）
   */
  destroy() {
    if (this._debugInterval) {
      clearInterval(this._debugInterval);
      this._debugInterval = null;
    }
  },
};
