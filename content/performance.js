/**
 * 知乎盐选会员增强助手 - 性能节流模块
 * 图片懒加载、视频暂停、动画限制、DOM清理、闲置节流
 */
const ZMPPerformance = {
  config: null,
  isThrottled: false,
  imageObserver: null,
  domCleanTimer: null,
  scrollListeners: [],
  _throttleHideTimer: null,
  _videoObserver: null,
  _headObserver: null,

  async init(config) {
    this.config = config.performance;

    if (this.config.disableAutoplay) this.disableAllAutoplay();
    if (this.config.disablePrefetch) this.removePrefetch();
    if (this.config.lazyLoadImages) this.setupLazyLoad();
    if (this.config.disableAnimations) this.disableAnimations();
    if (this.config.thumbnailMode) this.enableThumbnailMode();
    if (this.config.cleanDOM) this.startDOMCleanup();

    this.listenThrottleMessage();
  },

  /**
   * 禁用全站视频自动播放
   */
  disableAllAutoplay() {
    const pauseVideos = () => {
      document.querySelectorAll('video').forEach(video => {
        video.autoplay = false;
        video.pause();
        video.removeAttribute('autoplay');
      });
    };

    pauseVideos();

    // 监听新增video
    const videoObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'VIDEO') {
            node.autoplay = false;
            node.pause();
          }
          const videos = node.querySelectorAll ? node.querySelectorAll('video') : [];
          videos.forEach(v => { v.autoplay = false; v.pause(); });
        }
      }
    });
    videoObserver.observe(document.body, { childList: true, subtree: true });
  },

  /**
   * 移除预加载标签
   */
  removePrefetch() {
    // 移除已有的prefetch/preload
    document.querySelectorAll('link[rel="prefetch"], link[rel="preload"], link[rel="prerender"]').forEach(link => {
      link.remove();
    });

    // 监听新增的预加载标签
    const headObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'LINK') {
            const rel = node.getAttribute('rel');
            if (rel === 'prefetch' || rel === 'preload' || rel === 'prerender') {
              node.remove();
            }
          }
        }
      }
    });
    headObserver.observe(document.head, { childList: true });
  },

  /**
   * 图片智能懒加载
   */
  setupLazyLoad() {
    const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    // 复用已有observer，避免重复创建导致泄漏
    if (!this.imageObserver) {
      this.imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const realSrc = img.getAttribute('data-zmp-src');
            if (realSrc) {
              img.src = realSrc;
              img.removeAttribute('data-zmp-src');
            }
            this.imageObserver.unobserve(img);
          }
        });
      }, {
        rootMargin: '200px 0px'
      });
    }

    const processImages = () => {
      if (this.isThrottled) return;

      document.querySelectorAll('img:not([data-zmp-src])').forEach(img => {
        // 跳过小图标、头像
        if (img.width <= 50 && img.height <= 50) return;
        if (img.closest('.Avatar, .AuthorInfo, [class*="avatar"]')) return;

        const rect = img.getBoundingClientRect();
        // 首屏图片不延迟
        if (rect.top < window.innerHeight + 200) return;

        // 保存原始src，替换为占位图
        const originalSrc = img.src || img.getAttribute('data-actualsrc') || img.getAttribute('data-original');
        if (originalSrc && !originalSrc.startsWith('data:')) {
          img.setAttribute('data-zmp-src', originalSrc);
          img.src = PLACEHOLDER;
          this.imageObserver.observe(img);
        }
      });
    };

    setTimeout(processImages, 1000);
  },

  /**
   * 禁用动画
   */
  disableAnimations() {
    document.body.classList.add('zmp-no-animations');
  },

  /**
   * 缩略图模式
   */
  enableThumbnailMode() {
    document.body.classList.add('zmp-thumbnail');

    // 点击缩略图加载原图
    document.addEventListener('click', (e) => {
      const img = e.target;
      if (img.tagName === 'IMG' && img.closest('.zmp-thumbnail')) {
        const originalSrc = img.getAttribute('data-actualsrc') || img.getAttribute('data-original');
        if (originalSrc) {
          img.style.maxWidth = 'none';
          img.style.maxHeight = 'none';
          img.src = originalSrc;
        }
      }
    });
  },

  /**
   * 定时DOM清理（每5分钟）
   */
  startDOMCleanup() {
    this.domCleanTimer = setInterval(() => {
      if (this.isThrottled) return;
      this.cleanIdleDOM();
    }, 5 * 60 * 1000);
  },

  /**
   * 清理闲置DOM节点
   */
  cleanIdleDOM() {
    try {
      const viewportBottom = window.scrollY + window.innerHeight * 3;

      // 移除已隐藏且远离视口的节点
      document.querySelectorAll('[style*="display: none"], [style*="display:none"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top > window.innerHeight * 3 || rect.bottom < -window.innerHeight * 3) {
          // 仅移除广告类隐藏节点，不移除用户内容
          const cls = el.className || '';
          if (typeof cls === 'string' && (cls.includes('zmp-') || cls.includes('Ad') || cls.includes('ad'))) {
            el.remove();
          }
        }
      });

      // 清理空的容器
      document.querySelectorAll('.Card:empty, [class*="ContentItem"]:empty').forEach(el => {
        if (el.children.length === 0 && el.textContent.trim() === '') {
          el.remove();
        }
      });
    } catch (e) {
      console.warn('[ZMP] DOM清理异常', e);
    }
  },

  /**
   * 监听来自background的节流消息
   */
  listenThrottleMessage() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'throttle') {
        if (message.idle) {
          this.enterThrottleMode();
        } else {
          this.exitThrottleMode();
        }
        sendResponse({ success: true });
      }
    });

    // 页面重新获得焦点时退出节流
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // 清除待执行的节流定时器
        if (this._throttleHideTimer) {
          clearTimeout(this._throttleHideTimer);
          this._throttleHideTimer = null;
        }
        if (this.isThrottled) this.exitThrottleMode();
      } else if (this.config.throttleIdle) {
        // 页面隐藏时延迟进入节流（清除旧定时器防堆叠）
        if (this._throttleHideTimer) clearTimeout(this._throttleHideTimer);
        this._throttleHideTimer = setTimeout(() => {
          if (document.hidden) this.enterThrottleMode();
          this._throttleHideTimer = null;
        }, (this.config.throttleDelay || 120) * 1000);
      }
    });
  },

  /**
   * 进入节流模式
   */
  enterThrottleMode() {
    if (this.isThrottled) return;
    this.isThrottled = true;

    // 暂停所有视频
    document.querySelectorAll('video').forEach(v => v.pause());

    // 停止图片懒加载观察
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }

    // 暂停动画
    document.body.style.setProperty('animation-play-state', 'paused', 'important');

    console.log('[ZMP] 进入节流模式');
  },

  /**
   * 退出节流模式
   */
  exitThrottleMode() {
    if (!this.isThrottled) return;
    this.isThrottled = false;

    // 恢复图片懒加载（复用已有observer，仅重新处理图片）
    if (this.config.lazyLoadImages) {
      this.setupLazyLoad();
    }

    // 恢复动画
    document.body.style.removeProperty('animation-play-state');

    // 通知background恢复活跃
    chrome.runtime.sendMessage({ action: 'throttleStateChange' }).catch(() => {});

    console.log('[ZMP] 退出节流模式');
  },

  /**
   * 销毁（页面卸载时）
   */
  destroy() {
    if (this.imageObserver) {
      this.imageObserver.disconnect();
    }
    if (this.domCleanTimer) {
      clearInterval(this.domCleanTimer);
    }
  }
};
