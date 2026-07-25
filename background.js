/**
 * 知乎盐选会员增强助手 - Service Worker 后台脚本
 * 职责：标签页闲置检测与节流调度、消息中转、定时器管理
 */

// 记录每个知乎标签页的最后活跃时间
const tabActivityMap = new Map();

// 节流定时器
let throttleTimer = null;

/** 知乎 URL 匹配 */
function isZhihuUrl(url) {
  return url && url.includes('zhihu.com');
}

/** 节流检查间隔（毫秒） */
const THROTTLE_CHECK_INTERVAL = 30000;

// ========== 生命周期 ==========

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ZMP] 知乎盐选会员增强助手已安装');
  startThrottleMonitor();
});

chrome.runtime.onStartup.addListener(() => {
  startThrottleMonitor();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  tabActivityMap.set(activeInfo.tabId, Date.now());
  checkIdleTabs(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isZhihuUrl(tab.url)) {
    tabActivityMap.set(tabId, Date.now());
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabActivityMap.delete(tabId);
});

// ========== 节流监控 ==========

/**
 * 启动节流监控定时器
 */
function startThrottleMonitor() {
  if (throttleTimer) clearInterval(throttleTimer);
  throttleTimer = setInterval(() => checkIdleTabs(null), THROTTLE_CHECK_INTERVAL);
}

/**
 * 检查闲置标签并发送节流指令
 */
async function checkIdleTabs(activeTabId) {
  try {
    const { zmpConfig = {} } = await chrome.storage.local.get('zmpConfig');
    const perfConfig = zmpConfig.performance || {};

    if (!perfConfig.throttleIdle) return;

    const delay = (perfConfig.throttleDelay || 120) * 1000;
    const now = Date.now();

    const tabs = await chrome.tabs.query({
      url: ['https://www.zhihu.com/*', 'https://zhuanlan.zhihu.com/*'],
    });

    for (const tab of tabs) {
      if (tab.id === activeTabId) continue;

      const lastActive = tabActivityMap.get(tab.id) || now;
      if (now - lastActive > delay) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'throttle', idle: true });
        } catch (e) {
          // 标签页可能未加载 content script，忽略
        }
      }
    }
  } catch (e) {
    console.warn('[ZMP] 节流检查失败', e);
  }
}

// ========== 消息处理 ==========

/**
 * 消息处理映射表
 * 每个处理函数接收 (message, sender, sendResponse)
 * 返回 true 表示异步响应（保持 sendResponse 有效）
 */
const MESSAGE_HANDLERS = {
  getMemberStatus(_msg, _sender, sendResponse) {
    handleGetMemberStatus(sendResponse);
    return true; // 异步
  },

  updateMemberStatus(msg) {
    handleUpdateMemberStatus(msg.data);
    return false; // 同步，已处理
  },

  downloadFile(msg, _sender, sendResponse) {
    handleDownload(msg.data, sendResponse);
    return true; // 异步
  },

  getTabInfo(_msg, sender, sendResponse) {
    if (sender.tab) {
      sendResponse({ tabId: sender.tab.id, url: sender.tab.url });
    }
    return false;
  },

  throttleStateChange(_msg, sender) {
    if (sender.tab) {
      tabActivityMap.set(sender.tab.id, Date.now());
    }
    return false;
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[message.action];
  if (handler) {
    return handler(message, sender, sendResponse);
  }
  return false;
});

// ========== 处理函数 ==========

/**
 * 获取会员状态
 */
async function handleGetMemberStatus(sendResponse) {
  try {
    const { zmpConfig = {} } = await chrome.storage.local.get('zmpConfig');
    sendResponse({
      memberStatus: zmpConfig.memberStatus || { isMember: false, detected: false },
    });
  } catch (e) {
    sendResponse({ memberStatus: { isMember: false, detected: false } });
  }
}

/**
 * 更新会员状态缓存
 */
async function handleUpdateMemberStatus(statusData) {
  try {
    const { zmpConfig = {} } = await chrome.storage.local.get('zmpConfig');
    zmpConfig.memberStatus = { ...statusData, lastCheck: Date.now() };
    await chrome.storage.local.set({ zmpConfig });
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
      saveAs: true,
    });

    sendResponse({ success: true, downloadId });
  } catch (e) {
    console.warn('[ZMP] 下载失败', e);
    sendResponse({ success: false, error: e.message });
  }
}
