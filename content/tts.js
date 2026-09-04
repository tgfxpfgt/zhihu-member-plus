/**
 * 知乎盐选会员增强助手 - 听书模式模块（TTS）
 * 浏览器本地 speechSynthesis 朗读正文：
 * 按段落分块朗读，进度跟随滚动，底部控制条（暂停/停止/语速/音色）
 */
const ZMPTTS = {
  config: null,
  _playing: false,
  _paused: false,
  _elements: [],
  _idx: -1,
  _bar: null,
  _currentEl: null,

  init(config) {
    this.config = config.tts || {};
  },

  /**
   * 切换听书（开始/停止）
   */
  toggle() {
    this._playing ? this.stop() : this.start();
  },

  /**
   * 开始朗读当前页面正文
   */
  start() {
    const main = document.querySelector('.Post-RichTextContainer, .RichContent-inner');
    if (!main) {
      ZMPUtils.showToast('当前页面未找到可朗读的正文');
      return;
    }
    if (typeof speechSynthesis === 'undefined') {
      ZMPUtils.showToast('当前浏览器不支持语音合成');
      return;
    }

    this._elements = Array.from(
      main.querySelectorAll('p, li, h1, h2, h3, blockquote')
    ).filter(el => (el.innerText || '').trim().length > 1);

    if (this._elements.length === 0) {
      ZMPUtils.showToast('未找到可朗读的段落');
      return;
    }

    this._playing = true;
    this._paused = false;
    this._idx = -1;
    this.buildControlBar();
    speechSynthesis.cancel();
    this._next();
  },

  /**
   * 朗读下一段
   */
  _next() {
    if (!this._playing) return;
    this._idx++;

    if (this._idx >= this._elements.length) {
      this.stop();
      ZMPUtils.showToast('朗读完毕');
      return;
    }

    const el = this._elements[this._idx];
    this._highlight(el);

    const utterance = new SpeechSynthesisUtterance(el.innerText.trim());
    utterance.lang = 'zh-CN';
    utterance.rate = this.config.rate || 1;
    const voice = this._pickVoice();
    if (voice) utterance.voice = voice;

    utterance.onend = () => { if (this._playing) this._next(); };
    utterance.onerror = () => this.stop();

    speechSynthesis.speak(utterance);
    this._updateProgress();
  },

  /**
   * 按配置选择中文音色
   */
  _pickVoice() {
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    const wanted = this.config.voice;
    if (wanted) {
      const matched = voices.find(v => v.name === wanted);
      if (matched) return matched;
    }
    return voices.find(v => v.lang === 'zh-CN') || null;
  },

  /**
   * 高亮当前朗读段落并滚动跟随
   */
  _highlight(el) {
    if (this._currentEl) this._currentEl.classList.remove('zmp-tts-active');
    this._currentEl = el;
    el.classList.add('zmp-tts-active');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },

  /**
   * 构建底部控制条
   */
  buildControlBar() {
    if (this._bar) this._bar.remove();

    this._bar = document.createElement('div');
    this._bar.id = 'zmp-tts-bar';
    this._bar.innerHTML = `
      <button data-act="prev" title="上一段">⏮</button>
      <button data-act="play" title="暂停/继续">⏸</button>
      <button data-act="stop" title="停止">⏹</button>
      <button data-act="next" title="下一段">⏭</button>
      <select class="zmp-tts-rate" title="语速">
        <option value="0.5">0.5x</option>
        <option value="0.75">0.75x</option>
        <option value="1">1x</option>
        <option value="1.25">1.25x</option>
        <option value="1.5">1.5x</option>
        <option value="2">2x</option>
      </select>
      <span class="zmp-tts-progress"></span>
    `;

    const rateSelect = this._bar.querySelector('.zmp-tts-rate');
    rateSelect.value = String(this.config.rate || 1);

    this._bar.addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (act === 'stop') this.stop();
      else if (act === 'play') this._togglePause();
      else if (act === 'prev') { this._idx = Math.max(-1, this._idx - 2); speechSynthesis.cancel(); this._next(); }
      else if (act === 'next') { speechSynthesis.cancel(); this._next(); }
    });
    rateSelect.addEventListener('change', () => {
      this.config.rate = parseFloat(rateSelect.value);
      ZMPStorage.updateNested('tts', 'rate', this.config.rate);
      // 立即以新语速重读当前段
      speechSynthesis.cancel();
      this._idx--;
      this._next();
    });

    document.body.appendChild(this._bar);
    this._updateProgress();
  },

  /**
   * 暂停/继续
   */
  _togglePause() {
    if (!this._playing) return;
    this._paused = !this._paused;
    if (this._paused) speechSynthesis.pause();
    else speechSynthesis.resume();
    const btn = this._bar && this._bar.querySelector('[data-act="play"]');
    if (btn) btn.textContent = this._paused ? '▶' : '⏸';
  },

  /**
   * 更新进度显示
   */
  _updateProgress() {
    if (!this._bar) return;
    const label = this._bar.querySelector('.zmp-tts-progress');
    if (label) label.textContent = `${this._idx + 1}/${this._elements.length} 段`;
  },

  /**
   * 停止朗读并清理
   */
  stop() {
    this._playing = false;
    this._paused = false;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    if (this._currentEl) this._currentEl.classList.remove('zmp-tts-active');
    this._currentEl = null;
    if (this._bar) { this._bar.remove(); this._bar = null; }
  },

  /**
   * 销毁
   */
  destroy() {
    this.stop();
  },
};
