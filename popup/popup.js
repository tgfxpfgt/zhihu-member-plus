/**
 * 知乎盐选会员增强助手 - Popup弹窗交互逻辑 (v2.0.0)
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const config = await ZMPStorage.getAll();
    initTabs();
    initMemberStatus();
    initQuickActions();
    loadSettings(config);
    bindEvents(config);
    initLinkButtons();
    initSettingSearch();
    initBlockTypes(config);
    initCollectionPanel(config);
    initStatsPanel(config);
    initAISettings(config);
    initTTSSettings(config);
    initShortcutInputs(config);
    restoreLastTab();
    syncUIState();
    renderActiveFeatures();
  } catch (e) {
    console.error('[ZMP Popup] 初始化失败', e);
  }
});

/* ==================== 标签页 ==================== */

/**
 * 切换到指定标签页（统一入口，支持无按钮的隐藏面板如 performance）
 */
function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.add('active');
  chrome.storage.local.set({ zmpPopupTab: name });
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
}

/**
 * 恢复上次打开的标签页
 */
async function restoreLastTab() {
  try {
    const { zmpPopupTab } = await chrome.storage.local.get('zmpPopupTab');
    if (zmpPopupTab) showTab(zmpPopupTab);
  } catch (e) { /* 忽略 */ }
}

/* ==================== 状态同步 ==================== */

/**
 * 打开 popup 时从页面端同步快捷按钮的 active 状态
 */
async function syncUIState() {
  const state = await sendToTab({ action: 'getUIState' });
  if (!state) return;
  document.getElementById('btnImmersive').classList.toggle('active', !!state.immersive);
  document.getElementById('btnNight').classList.toggle('active', !!state.night);
  document.getElementById('btnToc').classList.toggle('active', !!state.toc);
  document.getElementById('btnTts').classList.toggle('active', !!state.tts);
}

/**
 * 「本页生效功能」面板（getActiveFeatures 消息）
 */
async function renderActiveFeatures() {
  const count = document.getElementById('afCount');
  const pageEl = document.getElementById('afPage');
  const chipsEl = document.getElementById('afChips');
  const data = await sendToTab({ action: 'getActiveFeatures' });
  if (!data || !Array.isArray(data.features)) return;
  count.textContent = data.features.length;
  pageEl.textContent = '页面：' + (data.page || '—');
  chipsEl.innerHTML = data.features
    .map(f => `<span class="af-chip">${f}</span>`)
    .join('');
}

/**
 * 检测并显示会员状态
 */
async function initMemberStatus() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('zhihu.com')) {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
      if (response && response.isMember) {
        statusDot.className = 'status-dot active';
        statusText.textContent = '已识别盐选会员 ✓ 全部功能已激活';
      } else {
        statusDot.className = 'status-dot inactive';
        statusText.textContent = '未检测到会员登录（请确认已登录知乎会员账号）';
      }
    } else {
      statusDot.className = 'status-dot';
      statusText.textContent = '请先打开知乎网站';
    }
  } catch (e) {
    statusDot.className = 'status-dot';
    statusText.textContent = '请刷新知乎页面后重试';
  }
}

/* ==================== 快捷操作 ==================== */

function initQuickActions() {
  const btnImmersive = document.getElementById('btnImmersive');
  const btnNight = document.getElementById('btnNight');
  const btnTts = document.getElementById('btnTts');
  const btnExportMd = document.getElementById('btnExportMd');
  const btnToc = document.getElementById('btnToc');

  btnImmersive.addEventListener('click', async () => {
    const result = await sendToTab({ action: 'toggleImmersive' });
    if (result) btnImmersive.classList.toggle('active', result.active);
  });

  btnNight.addEventListener('click', async () => {
    const result = await sendToTab({ action: 'toggleNightMode' });
    if (result) btnNight.classList.toggle('active', result.active);
  });

  btnToc.addEventListener('click', async () => {
    const result = await sendToTab({ action: 'toggleToc' });
    if (result) btnToc.classList.toggle('active', !!result.active);
  });

  btnTts.addEventListener('click', async () => {
    const result = await sendToTab({ action: 'toggleTTS' });
    if (result) btnTts.classList.toggle('active', !!result.active);
  });

  btnExportMd.addEventListener('click', async () => {
    await sendToTab({ action: 'exportContent', type: 'markdown' });
    btnExportMd.textContent = '✓ 已导出';
    setTimeout(() => { btnExportMd.textContent = '📄 导出'; }, 2000);
  });
}

/* ==================== 设置搜索 (A4) ==================== */

function initSettingSearch() {
  const input = document.getElementById('settingSearch');
  const box = document.createElement('div');
  box.className = 'search-results';
  input.parentNode.appendChild(box);

  // 收集可搜索项（含其所属面板）
  const index = [];
  document.querySelectorAll('.tab-panel .setting-item, .tab-panel .setting-row').forEach(el => {
    const panel = el.closest('.tab-panel');
    if (!panel) return;
    const label = el.querySelector('span');
    if (!label) return;
    index.push({ text: label.textContent.trim(), panel: panel.id.replace('panel-', ''), el });
  });

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const hits = index.filter(it => it.text.toLowerCase().includes(q)).slice(0, 8);
    if (hits.length === 0) {
      box.innerHTML = '<div class="sr-empty">未找到相关设置</div>';
      box.style.display = 'block';
      return;
    }
    const tabNames = { member: '会员', reader: '阅读', purify: '净化', enhance: '增强', smart: '智能', collection: '收藏', stats: '统计', performance: '性能' };
    box.innerHTML = hits.map((h, i) =>
      `<div class="sr-item" data-i="${i}"><span class="sr-tab">${tabNames[h.panel] || h.panel}</span>${h.text}</div>`
    ).join('');
    box.style.display = 'block';

    box.querySelectorAll('.sr-item').forEach(item => {
      item.addEventListener('click', () => {
        const hit = hits[parseInt(item.dataset.i)];
        showTab(hit.panel);
        input.value = '';
        box.style.display = 'none';
        // 高亮闪烁定位
        setTimeout(() => {
          hit.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          hit.el.classList.add('search-flash');
          setTimeout(() => hit.el.classList.remove('search-flash'), 1600);
        }, 60);
      });
    });
  });

  // 点击其他区域收起
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.setting-search')) box.style.display = 'none';
  });
}

/* ==================== 按页面分类屏蔽 (B2) ==================== */

const BLOCKTYPE_PAGES = ['home', 'follow', 'hot', 'search'];

function initBlockTypes(config) {
  const blockTypes = (config.purify && config.purify.blockTypes) || {};
  let current = 'home';

  const pills = document.querySelectorAll('#blocktypePages .page-pill');
  const checks = document.querySelectorAll('#blocktypeChecks input[data-bt]');
  const followRow = document.querySelector('.bt-follow-activity');

  const render = () => {
    const rules = blockTypes[current] || {};
    pills.forEach(p => p.classList.toggle('active', p.dataset.page === current));
    checks.forEach(cb => { cb.checked = !!rules[cb.dataset.bt]; });
    // 关注动态仅对首页/关注页有意义
    if (followRow) followRow.style.display = (current === 'home' || current === 'follow') ? '' : 'none';
  };

  pills.forEach(p => p.addEventListener('click', () => { current = p.dataset.page; render(); }));

  checks.forEach(cb => {
    cb.addEventListener('change', async () => {
      if (!blockTypes[current]) blockTypes[current] = {};
      blockTypes[current][cb.dataset.bt] = cb.checked;
      await ZMPStorage.updateNested('purify', 'blockTypes', blockTypes);
      sendToTab({ action: 'refreshModules' });
    });
  });

  render();
}

/* ==================== 本地收藏夹 (B4) ==================== */

function initCollectionPanel(config) {
  const listEl = document.getElementById('collectionList');
  const emptyEl = document.getElementById('collectionEmpty');
  const countEl = document.getElementById('collectionCount');

  const render = (items) => {
    countEl.textContent = items.length;
    if (items.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';
    listEl.innerHTML = items.map((it, i) => `
      <div class="col-item" data-i="${i}">
        <div class="col-main">
          <div class="col-title">${escapeHtmlText(it.title)}</div>
          <div class="col-meta">${escapeHtmlText(it.author)} · ${new Date(it.time).toLocaleDateString()}</div>
        </div>
        <button class="col-del" title="删除">✕</button>
      </div>
    `).join('');

    listEl.querySelectorAll('.col-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.closest('.col-item').dataset.i);
        const cur = (await ZMPStorage.getAll()).collection || {};
        const items = cur.items || [];
        items.splice(i, 1);
        await ZMPStorage.updateNested('collection', 'items', items);
        render(items);
      });
    });
  };

  render((config.collection && config.collection.items) || []);

  document.getElementById('btnExportCollection').addEventListener('click', async () => {
    await sendToTab({ action: 'exportCollection' });
    const btn = document.getElementById('btnExportCollection');
    btn.textContent = '✓ 已导出';
    setTimeout(() => { btn.textContent = '📦 导出 Markdown'; }, 1500);
  });

  document.getElementById('btnClearCollection').addEventListener('click', async () => {
    if (!confirm('确定清空全部本地收藏？此操作不可恢复。')) return;
    await ZMPStorage.updateNested('collection', 'items', []);
    render([]);
  });
}

function escapeHtmlText(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ==================== 阅读统计 (B5/B8) ==================== */

function initStatsPanel(config) {
  const daily = (config.stats && config.stats.daily) || {};

  const todayKey = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const keyToLabel = (key) => key.slice(5).replace('-', '/');

  // 今日摘要
  const today = daily[todayKey()] || {};
  document.getElementById('statMinutes').textContent = Math.round((today.seconds || 0) / 60);
  document.getElementById('statWords').textContent = today.words || 0;
  document.getElementById('statArticles').textContent = today.articles || 0;

  // 近 7 天柱状图（纯 CSS）
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    days.push({ key, label: keyToLabel(key), minutes: Math.round(((daily[key] || {}).seconds || 0) / 60) });
  }
  const max = Math.max(10, ...days.map(d => d.minutes));
  const barsEl = document.getElementById('statsBars');
  barsEl.innerHTML = days.map(d => `
    <div class="stat-bar-wrap" title="${d.label}：${d.minutes} 分钟">
      <div class="stat-bar" style="height:${Math.max(3, Math.round(d.minutes / max * 60))}px"></div>
      <span class="stat-bar-label">${d.label}</span>
    </div>
  `).join('');
}

/* ==================== AI 设置 (B1) ==================== */

const AI_PRESETS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
  openai: { baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  custom: {},
};

function initAISettings(config) {
  const ai = config.ai || {};
  setValue('aiProvider', ai.provider || 'deepseek');
  setValue('aiBaseUrl', ai.baseUrl || AI_PRESETS.deepseek.baseUrl);
  setValue('aiModel', ai.model || AI_PRESETS.deepseek.model);
  setValue('aiApiKey', ai.apiKey || '');
  setValue('aiPrompt', ai.prompt || '');

  document.getElementById('aiProvider').addEventListener('change', (e) => {
    const preset = AI_PRESETS[e.target.value];
    if (preset.baseUrl) setValue('aiBaseUrl', preset.baseUrl);
    if (preset.model) setValue('aiModel', preset.model);
  });

  const save = ZMPUtils.debounce(async () => {
    await ZMPStorage.updateSection('ai', {
      provider: document.getElementById('aiProvider').value,
      baseUrl: document.getElementById('aiBaseUrl').value.trim(),
      model: document.getElementById('aiModel').value.trim(),
      apiKey: document.getElementById('aiApiKey').value.trim(),
      prompt: document.getElementById('aiPrompt').value.trim(),
    });
    sendToTab({ action: 'refreshModules' });
  }, 400);

  ['aiProvider', 'aiBaseUrl', 'aiModel', 'aiApiKey', 'aiPrompt'].forEach(id => {
    document.getElementById(id).addEventListener('change', save);
  });
}

/* ==================== TTS 设置 (A2) ==================== */

function initTTSSettings(config) {
  const tts = config.tts || {};
  setValue('ttsRate', String(tts.rate || 1));

  document.getElementById('ttsRate').addEventListener('change', async (e) => {
    await ZMPStorage.updateNested('tts', 'rate', parseFloat(e.target.value));
    sendToTab({ action: 'refreshModules' });
  });

  // 音色列表（popup 自身的 speechSynthesis）
  const voiceSel = document.getElementById('ttsVoice');
  const loadVoices = () => {
    const voices = (window.speechSynthesis ? speechSynthesis.getVoices() : [])
      .filter(v => v.lang && v.lang.toLowerCase().startsWith('zh'));
    voiceSel.innerHTML = '<option value="">系统默认（中文）</option>' +
      voices.map(v => `<option value="${escapeHtmlText(v.name)}">${escapeHtmlText(v.name)}</option>`).join('');
    if (tts.voice) setValue('ttsVoice', tts.voice);
  };
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }
  voiceSel.addEventListener('change', async (e) => {
    await ZMPStorage.updateNested('tts', 'voice', e.target.value);
    sendToTab({ action: 'refreshModules' });
  });
}

/* ==================== 快捷键自定义 (C7) ==================== */

function initShortcutInputs(config) {
  const saved = (config.uiEnhance && config.uiEnhance.shortcutKeys) || {};
  const defaults = { menu: 'z', toc: 't', night: 'n', immersive: 'i' };
  const keys = Object.assign({}, defaults, saved);

  document.querySelectorAll('.sc-input').forEach(input => {
    const name = input.dataset.sckey;
    input.value = keys[name] || '';

    input.addEventListener('input', async () => {
      const val = input.value.trim().toLowerCase();
      if (!val) return;
      if (!/^[a-z]$/.test(val)) {
        input.classList.add('sc-invalid');
        setTimeout(() => { input.value = ''; input.classList.remove('sc-invalid'); }, 600);
        return;
      }
      keys[name] = val;
      await ZMPStorage.updateNested('uiEnhance', 'shortcutKeys', keys);
      sendToTab({ action: 'refreshModules' });
    });
  });
}

/* ==================== 设置加载与保存 ==================== */

/**
 * 加载设置到界面
 * checkbox 通过 data-section + data-key（缺省为 id）自动映射到配置段
 */
function loadSettings(config) {
  document.querySelectorAll('input[type="checkbox"][data-section]').forEach(cb => {
    const section = config[cb.dataset.section];
    if (section) cb.checked = !!section[cb.dataset.key || cb.id];
  });

  // select / range
  setValue('fontFamily', config.reader.fontFamily);
  setValue('fontSize', config.reader.fontSize);
  setValue('lineHeight', config.reader.lineHeight);
  setValue('bgColor', config.reader.bgColor);
  setValue('throttleDelay', config.performance.throttleDelay);
  setValue('contentWidth', config.uiEnhance.contentWidth || 1000);
  setValue('theme', config.uiEnhance.theme || 'default');
  setValue('lowLikeThreshold', config.purify.lowLikeThreshold || 10);
  setValue('lowCommentThreshold', (config.purify.lowCommentThreshold != null) ? config.purify.lowCommentThreshold : 3);
  setValue('autoscrollSpeed', (config.uiEnhance && config.uiEnhance.autoscrollSpeed) || 40);
  setValue('digestMinWords', (config.digest && config.digest.minWords) || 500);
  setValue('reminderMinutes', (config.stats && config.stats.reminderMinutes) || 30);

  // 滑块实时显示值
  document.getElementById('fontSizeVal').textContent = config.reader.fontSize;
  document.getElementById('lineHeightVal').textContent = config.reader.lineHeight;
  document.getElementById('throttleDelayVal').textContent = Math.round(config.performance.throttleDelay / 60);
  document.getElementById('contentWidthVal').textContent = config.uiEnhance.contentWidth || 1000;
  document.getElementById('lowLikeThresholdVal').textContent = config.purify.lowLikeThreshold || 10;
  document.getElementById('lowCommentThresholdVal').textContent =
    (config.purify.lowCommentThreshold != null) ? config.purify.lowCommentThreshold : 3;
  document.getElementById('autoscrollSpeedVal').textContent =
    (config.uiEnhance && config.uiEnhance.autoscrollSpeed) || 40;
  document.getElementById('digestMinWordsVal').textContent = (config.digest && config.digest.minWords) || 500;
  document.getElementById('reminderMinutesVal').textContent = (config.stats && config.stats.reminderMinutes) || 30;

  // 黑名单 textarea
  document.getElementById('blockKeywords').value = (config.purify.blockKeywords || []).join('\n');
  document.getElementById('blockAuthors').value = (config.purify.blockAuthors || []).join('\n');
}

/**
 * 绑定事件
 */
function bindEvents(config) {
  // checkbox：通过 data-section + data-key 自动保存
  document.querySelectorAll('input[type="checkbox"][data-section]').forEach(cb => {
    cb.addEventListener('change', () => saveCheckboxSetting(cb));
  });

  // 自动滚动（即时动作，非持久配置）
  document.getElementById('autoscrollToggle').addEventListener('change', async (e) => {
    const result = await sendToTab({ action: 'toggleAutoscroll' });
    if (!result || result.active !== e.target.checked) {
      // 页面不可用或状态不同步时恢复勾选状态
      e.target.checked = !!(result && result.active);
    }
  });

  // 字体选择
  document.getElementById('fontFamily').addEventListener('change', async (e) => {
    await ZMPStorage.updateNested('reader', 'fontFamily', e.target.value);
    sendToTab({ action: 'updateReaderStyle', key: 'fontFamily', value: e.target.value });
  });

  // 字号滑块（防抖保存）
  const saveFontSize = ZMPUtils.debounce(async (val) => {
    await ZMPStorage.updateNested('reader', 'fontSize', val);
    sendToTab({ action: 'updateReaderStyle', key: 'fontSize', value: val });
  }, 300);
  document.getElementById('fontSize').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('fontSizeVal').textContent = val;
    saveFontSize(val);
  });

  // 行距滑块（防抖保存）
  const saveLineHeight = ZMPUtils.debounce(async (val) => {
    await ZMPStorage.updateNested('reader', 'lineHeight', val);
    sendToTab({ action: 'updateReaderStyle', key: 'lineHeight', value: val });
  }, 300);
  document.getElementById('lineHeight').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('lineHeightVal').textContent = val.toFixed(1);
    saveLineHeight(val);
  });

  // 背景色
  document.getElementById('bgColor').addEventListener('change', async (e) => {
    await ZMPStorage.updateNested('reader', 'bgColor', e.target.value);
    sendToTab({ action: 'updateReaderStyle', key: 'bgColor', value: e.target.value });
  });

  // 节流延迟（防抖保存）
  const saveThrottleDelay = ZMPUtils.debounce(async (val) => {
    await ZMPStorage.updateNested('performance', 'throttleDelay', val);
  }, 400);
  document.getElementById('throttleDelay').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('throttleDelayVal').textContent = Math.round(val / 60);
    saveThrottleDelay(val);
  });

  // 内容宽度（防抖保存）
  const saveWidth = ZMPUtils.debounce(async (val) => {
    await ZMPStorage.updateNested('uiEnhance', 'contentWidth', val);
    sendToTab({ action: 'refreshModules' });
  }, 300);
  document.getElementById('contentWidth').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('contentWidthVal').textContent = val;
    saveWidth(val);
  });

  // 低赞阈值（防抖保存）
  const saveLowLike = ZMPUtils.debounce(async (val) => {
    await ZMPStorage.updateNested('purify', 'lowLikeThreshold', val);
    sendToTab({ action: 'refreshModules' });
  }, 300);
  document.getElementById('lowLikeThreshold').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('lowLikeThresholdVal').textContent = val;
    saveLowLike(val);
  });

  // 低评论阈值（防抖保存）
  const saveLowComment = ZMPUtils.debounce(async (val) => {
    await ZMPStorage.updateNested('purify', 'lowCommentThreshold', val);
    sendToTab({ action: 'refreshModules' });
  }, 300);
  document.getElementById('lowCommentThreshold').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('lowCommentThresholdVal').textContent = val;
    saveLowComment(val);
  });

  // 自动滚动速度（防抖保存）
  const saveScrollSpeed = ZMPUtils.debounce(async (val) => {
    await ZMPStorage.updateNested('uiEnhance', 'autoscrollSpeed', val);
  }, 300);
  document.getElementById('autoscrollSpeed').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('autoscrollSpeedVal').textContent = val;
    saveScrollSpeed(val);
  });

  // 一句话提炼最低字数（防抖保存）
  const saveMinWords = ZMPUtils.debounce(async (val) => {
    await ZMPStorage.updateNested('digest', 'minWords', val);
    sendToTab({ action: 'refreshModules' });
  }, 300);
  document.getElementById('digestMinWords').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('digestMinWordsVal').textContent = val;
    saveMinWords(val);
  });

  // 时长提醒间隔（防抖保存）
  const saveReminder = ZMPUtils.debounce(async (val) => {
    await ZMPStorage.updateNested('stats', 'reminderMinutes', val);
  }, 300);
  document.getElementById('reminderMinutes').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('reminderMinutesVal').textContent = val;
    saveReminder(val);
  });

  // 美化主题
  document.getElementById('theme').addEventListener('change', async (e) => {
    await ZMPStorage.updateNested('uiEnhance', 'theme', e.target.value);
    sendToTab({ action: 'refreshModules' });
  });

  // 保存黑名单
  document.getElementById('btnSaveBlocklist').addEventListener('click', saveBlocklist);

  // 导出/导入配置
  document.getElementById('btnExportConfig').addEventListener('click', exportConfig);
  document.getElementById('btnImportConfig').addEventListener('click', importConfig);
}

/**
 * 保存 checkbox 设置（通过 data-section + data-key 映射配置段）
 */
async function saveCheckboxSetting(cb) {
  const section = cb.dataset.section;
  if (!section) return;
  const key = cb.dataset.key || cb.id;
  await ZMPStorage.updateNested(section, key, cb.checked);
  sendToTab({ action: 'refreshModules' });
}

/**
 * 保存黑名单
 */
async function saveBlocklist() {
  const keywords = document.getElementById('blockKeywords').value
    .split('\n').map(s => s.trim()).filter(Boolean);
  const authors = document.getElementById('blockAuthors').value
    .split('\n').map(s => s.trim()).filter(Boolean);

  await ZMPStorage.updateSection('purify', { blockKeywords: keywords, blockAuthors: authors });
  sendToTab({ action: 'refreshModules' });

  const btn = document.getElementById('btnSaveBlocklist');
  btn.textContent = '✓ 已保存';
  setTimeout(() => { btn.textContent = '保存黑名单'; }, 1500);
}

/**
 * 导出配置
 */
async function exportConfig() {
  const json = await ZMPStorage.exportConfig();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'zhihu-member-plus-config.json';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导入配置
 */
async function importConfig() {
  const btn = document.getElementById('btnImportConfig');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const success = await ZMPStorage.importConfig(text);
    if (success) {
      const config = await ZMPStorage.getAll();
      loadSettings(config);
      initBlockTypes(config);
      initCollectionPanel(config);
      initStatsPanel(config);
      sendToTab({ action: 'refreshModules' });
      btn.textContent = '✓ 导入成功';
      setTimeout(() => { btn.textContent = '导入配置'; }, 1500);
    } else {
      alert('导入失败，请检查文件格式');
    }
  };
  input.click();
}

/**
 * 初始化快捷链接
 */
function initLinkButtons() {
  document.querySelectorAll('.link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: btn.dataset.url });
    });
  });
}

/* ==================== 工具函数 ==================== */

/**
 * 向当前知乎标签页发送消息
 */
async function sendToTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('zhihu.com')) {
      return await chrome.tabs.sendMessage(tab.id, message);
    }
  } catch (e) {
    console.warn('[ZMP Popup] 发送消息失败', e);
  }
  return null;
}

/**
 * 设置 input/select 值
 */
function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}
