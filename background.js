/**
 * 知乎盐选会员增强助手 - Service Worker 后台脚本
 * 职责：标签页闲置检测与节流调度、消息中转、定时器管理
 */

// 记录每个知乎标签页的最后活跃时间
const tabActivityMap = new Map();

// 节流定时器
let throttleTimer = null;

/**
 * 初始化：设置标签页监控
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[ZMP] 知乎盐选会员增强助手已安装');
  startThrottleMonitor();
});

chrome.runtime.onStartup.addListener(() => {
  startThrottleMonitor();
});

/**
 * 监听标签页切换
 */
chrome.tabs.onActivated.addListener((activeInfo) => {
  // 记录新激活标签的时间
  tabActivityMap.set(activeInfo.tabId, Date.now());

  // 检查其他知乎标签是否进入闲置
  checkIdleTabs(activeInfo.tabId);
});

/**
 * 监听标签页更新（导航）
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && isZhihuUrl(tab.url)) {
    tabActivityMap.set(tabId, Date.now());
  }
});

/**
 * 标签页关闭时清理
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabActivityMap.delete(tabId);
});

/**
 * 判断是否为知乎URL
 */
function isZhihuUrl(url) {
  return url && (url.includes('zhihu.com') || url.includes('zhuanlan.zhihu.com'));
}

/**
 * 启动节流监控定时器（每30秒检查一次）
 */
function startThrottleMonitor() {
  if (throttleTimer) clearInterval(throttleTimer);
  throttleTimer = setInterval(() => {
    checkIdleTabs(null);
  }, 30000);
}

/**
 * 检查闲置标签并发送节流指令
 */
async function checkIdleTabs(activeTabId) {
  try {
    const data = await chrome.storage.local.get('zmpConfig');
    const config = data.zmpConfig || {};
    const perfConfig = config.performance || {};

    if (!perfConfig.throttleIdle) return;

    const delay = (perfConfig.throttleDelay || 120) * 1000; // 转为毫秒
    const now = Date.now();

    const tabs = await chrome.tabs.query({ url: ['https://www.zhihu.com/*', 'https://zhuanlan.zhihu.com/*'] });

    for (const tab of tabs) {
      if (tab.id === activeTabId) continue;

      const lastActive = tabActivityMap.get(tab.id) || now;
      if (now - lastActive > delay) {
        // 发送节流指令
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'throttle', idle: true });
        } catch (e) {
          // 标签页可能未加载content script，忽略
        }
      }
    }
  } catch (e) {
    console.warn('[ZMP] 节流检查失败', e);
  }
}

/**
 * 消息监听：处理来自content script和popup的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getMemberStatus':
      handleGetMemberStatus(sendResponse);
      return true;

    case 'updateMemberStatus':
      handleUpdateMemberStatus(message.data);
      sendResponse({ success: true });
      break;

    case 'downloadFile':
      handleDownload(message.data, sendResponse);
      return true;

    case 'getTabInfo':
      if (sender.tab) {
        sendResponse({ tabId: sender.tab.id, url: sender.tab.url });
      }
      break;

    case 'throttleStateChange':
      // 标签页报告自己的节流状态
      if (sender.tab) {
        tabActivityMap.set(sender.tab.id, Date.now());
      }
      break;

    default:
      break;
  }
  return false;
});

/**
 * 获取会员状态
 */
async function handleGetMemberStatus(sendResponse) {
  try {
    const data = await chrome.storage.local.get('zmpConfig');
    const config = data.zmpConfig || {};
    sendResponse({ memberStatus: config.memberStatus || { isMember: false, detected: false } });
  } catch (e) {
    sendResponse({ memberStatus: { isMember: false, detected: false } });
  }
}

/**
 * 更新会员状态缓存
 */
async function handleUpdateMemberStatus(statusData) {
  try {
    const data = await chrome.storage.local.get('zmpConfig');
    const config = data.zmpConfig || {};
    config.memberStatus = {
      ...statusData,
      lastCheck: Date.now()
    };
    await chrome.storage.local.set({ zmpConfig: config });
  } catch (e) {
    console.warn('[ZMP] 更新会员状态失败', e);
  }
}

/**
 * 处理文件下载
 */
async function handleDownload(downloadData, sendResponse) {
  try {
    const { filename, content, type } = downloadData;
    const mimeType = type === 'markdown' ? 'text/markdown' : 'text/plain';
    const ext = type === 'markdown' ? '.md' : '.txt';
    const blob = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;

    const downloadId = await chrome.downloads.download({
      url: blob,
      filename: filename + ext,
      saveAs: true
    });

    sendResponse({ success: true, downloadId });
  } catch (e) {
    console.warn('[ZMP] 下载失败', e);
    sendResponse({ success: false, error: e.message });
  }
}
