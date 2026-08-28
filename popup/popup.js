/**
 * 知乎盐选会员增强助手 - Popup弹窗交互逻辑
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const config = await ZMPStorage.getAll();
    initTabs();
    initMemberStatus();
    initQuickActions();
    loadSettings(config);
    bindEvents();
    initLinkButtons();
  } catch (e) {
    console.error('[ZMP Popup] 初始化失败', e);
  }
});

/**
 * 标签页切换
 */
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    });
  });
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

/**
 * 快捷操作按钮
 */
function initQuickActions() {
  const btnImmersive = document.getElementById('btnImmersive');
  const btnNight = document.getElementById('btnNight');
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

  btnExportMd.addEventListener('click', async () => {
    await sendToTab({ action: 'exportContent', type: 'markdown' });
    btnExportMd.textContent = '✓ 已导出';
    setTimeout(() => { btnExportMd.textContent = '📄 导出'; }, 2000);
  });

  btnToc.addEventListener('click', async () => {
    await sendToTab({ action: 'toggleToc' });
  });
}

/**
 * 加载设置到界面
 * checkbox 通过 data-section 属性自动映射到配置段
 * select / range / textarea 显式设置
 */
function loadSettings(config) {
  // checkbox：通过 data-section 属性自动加载
  document.querySelectorAll('input[type="checkbox"][data-section]').forEach(cb => {
    const section = config[cb.dataset.section];
    if (section) cb.checked = !!section[cb.id];
  });

  // select / range
  setValue('fontFamily', config.reader.fontFamily);
  setValue('fontSize', config.reader.fontSize);
  setValue('lineHeight', config.reader.lineHeight);
  setValue('bgColor', config.reader.bgColor);
  setValue('throttleDelay', config.performance.throttleDelay);
  setValue('contentWidth', config.uiEnhance.contentWidth || 1000);
  setValue('theme', config.uiEnhance.theme || 'default');

  // 滑块实时显示值
  document.getElementById('fontSizeVal').textContent = config.reader.fontSize;
  document.getElementById('lineHeightVal').textContent = config.reader.lineHeight;
  document.getElementById('throttleDelayVal').textContent = Math.round(config.performance.throttleDelay / 60);
  document.getElementById('contentWidthVal').textContent = config.uiEnhance.contentWidth || 1000;

  // 黑名单 textarea
  document.getElementById('blockKeywords').value = (config.purify.blockKeywords || []).join('\n');
  document.getElementById('blockAuthors').value = (config.purify.blockAuthors || []).join('\n');
}

/**
 * 绑定事件
 */
function bindEvents() {
  // checkbox：通过 data-section 自动保存
  document.querySelectorAll('input[type="checkbox"][data-section]').forEach(cb => {
    cb.addEventListener('change', () => saveCheckboxSetting(cb));
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
 * 保存 checkbox 设置（通过 data-section 属性映射配置段）
 */
async function saveCheckboxSetting(cb) {
  const section = cb.dataset.section;
  if (!section) return;
  await ZMPStorage.updateNested(section, cb.id, cb.checked);
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
      sendToTab({ action: 'refreshModules' });
      alert('配置导入成功！');
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
