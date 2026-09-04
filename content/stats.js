/**
 * ZMPStats - 阅读统计 + 时长提醒 (v2.0.0)
 * - 活动感知：scroll/click/keydown 更新 _lastActive
 * - 每 30s 采样：页面可见 && 最近 2 分钟内有活动 → 累计阅读秒数
 * - 字数/文章数：每个内容页 URL 只统计一次
 * - 时长提醒：连续阅读 streak 达到 reminderMinutes → toast 提醒并重置
 * - 保存节流 60s + pagehide 强制 flush；数据保留 90 天
 */
(function () {
  'use strict';

  const SAMPLE_INTERVAL = 30 * 1000;      // 采样周期
  const ACTIVE_WINDOW = 2 * 60 * 1000;    // 判定"活跃"的窗口
  const SAVE_THROTTLE = 60 * 1000;        // 保存节流
  const RETENTION_DAYS = 90;              // 数据保留天数
  const ACTIVITY_EVENTS = ['scroll', 'click', 'keydown'];

  window.ZMPStats = {
    config: null,
    _timer: null,
    _listeners: [],
    _pagehideHandler: null,
    _lastActive: 0,
    _streakStart: 0,        // 当前连续阅读段落起点（时间戳）
    _dirty: false,          // 内存数据已变更未落盘
    _countedUrl: '',        // 已统计过字数的 URL
    _lastSave: 0,

    init(config) {
      this.config = config.stats || {};
      if (!this.config.enabled) return;

      this._lastActive = Date.now();
      this._streakStart = 0;

      // 活动监听（passive，仅更新时间戳）
      ACTIVITY_EVENTS.forEach((evt) => {
        const handler = () => { this._lastActive = Date.now(); };
        window.addEventListener(evt, handler, { passive: true, capture: true });
        this._listeners.push([evt, handler]);
      });

      // 卸载前强制落盘
      this._pagehideHandler = () => this.flush();
      window.addEventListener('pagehide', this._pagehideHandler);

      // 采样定时器
      this._timer = setInterval(() => this._sample(), SAMPLE_INTERVAL);

      // 内容页字数统计（延迟到首屏渲染后）
      setTimeout(() => this._countReading(), 3000);
    },

    /** 30s 采样一次 */
    _sample() {
      const cfg = this.config;
      if (!cfg || !cfg.enabled) return;

      const now = Date.now();
      const visible = document.visibilityState === 'visible';
      const active = now - this._lastActive < ACTIVE_WINDOW;

      if (visible && active) {
        const daily = this._ensureToday(cfg);

        if (!this._streakStart) this._streakStart = now - SAMPLE_INTERVAL;
        daily.seconds = (daily.seconds || 0) + Math.round(SAMPLE_INTERVAL / 1000);

        this._dirty = true;

        // 时长提醒
        if (cfg.reminderEnabled && this._streakStart) {
          const streakMin = (now - this._streakStart) / 60000;
          if (streakMin >= cfg.reminderMinutes) {
            ZMPUtils.showToast('连续阅读已 ' + cfg.reminderMinutes + ' 分钟，记得休息一下眼睛 👀', 4000);
            this._streakStart = now; // 重置，下一段重新计时
          }
        }
      } else {
        // 不可见或无活动 → 中断连续阅读段
        this._streakStart = 0;
      }

      this._maybeSave(now);
    },

    /** 内容页字数/文章数统计（每 URL 一次） */
    _countReading() {
      const cfg = this.config;
      if (!cfg || !cfg.enabled) return;
      const url = location.pathname;
      if (this._countedUrl === url) return;

      const container = document.querySelector('.Post-RichTextContainer, .QuestionAnswer-content .RichContent-inner');
      if (!container) return;

      const text = container.innerText || '';
      const words = text.replace(/\s+/g, '').length;
      if (words < 100) return; // 太短不算一篇文章

      this._countedUrl = url;
      const daily = this._ensureToday(cfg);
      daily.articles = (daily.articles || 0) + 1;
      daily.words = (daily.words || 0) + words;
      this._dirty = true;
      this._maybeSave(Date.now());
    },

    /** 取当天记录（无则创建） */
    _ensureToday(cfg) {
      if (!cfg.daily) cfg.daily = {};
      const key = this._todayKey();
      if (!cfg.daily[key]) cfg.daily[key] = { seconds: 0, words: 0, articles: 0 };
      return cfg.daily[key];
    },

    _todayKey() {
      const d = new Date();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    },

    /** 节流保存 */
    _maybeSave(now) {
      if (!this._dirty) return;
      if (now - this._lastSave < SAVE_THROTTLE) return;
      this._save(now);
    },

    _save(now) {
      this._lastSave = now || Date.now();
      this._dirty = false;
      // 修剪 90 天前的数据
      this._prune();
      ZMPStorage.updateNested('stats', this.config);
    },

    /** 删除 90 天前的记录 */
    _prune() {
      const daily = this.config && this.config.daily;
      if (!daily) return;
      const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
      Object.keys(daily).forEach((key) => {
        const t = new Date(key + 'T00:00:00').getTime();
        if (!isNaN(t) && t < cutoff) delete daily[key];
      });
    },

    /** 强制落盘（pagehide 调用） */
    flush() {
      if (this._dirty) this._save(Date.now());
    },

    /** 获取今天统计（popup 用） */
    getToday() {
      const cfg = this.config;
      if (!cfg || !cfg.daily) return { seconds: 0, words: 0, articles: 0 };
      return cfg.daily[this._todayKey()] || { seconds: 0, words: 0, articles: 0 };
    },

    destroy() {
      this.flush();
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this._listeners.forEach(([evt, handler]) => window.removeEventListener(evt, handler, { capture: true }));
      this._listeners = [];
      if (this._pagehideHandler) {
        window.removeEventListener('pagehide', this._pagehideHandler);
        this._pagehideHandler = null;
      }
    }
  };
})();
