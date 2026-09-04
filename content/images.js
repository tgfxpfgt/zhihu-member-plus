/**
 * ZMPImages - 图片增强 (v2.0.0)
 * - C5 图片悬停预览：鼠标移入正文大图 → 居中放大预览
 * - 夜间图片调暗：由 content.js 的 CLASS_TOGGLES（zmp-night-img-dim）驱动，本模块只管预览
 */
(function () {
  'use strict';

  window.ZMPImages = {
    config: null,
    _overlay: null,
    _hoverHandler: null,
    _outHandler: null,
    _clickHandler: null,

    init(config) {
      this.config = config.enhance || {};
      if (this._hoverHandler) {
        document.removeEventListener('mouseover', this._hoverHandler, true);
        document.removeEventListener('mouseout', this._outHandler, true);
        this._hoverHandler = null;
        this._outHandler = null;
      }
      if (!this.config.imageHoverPreview) return;

      this._hoverHandler = (e) => this._onOver(e);
      this._outHandler = (e) => this._onOut(e);
      document.addEventListener('mouseover', this._hoverHandler, true);
      document.addEventListener('mouseout', this._outHandler, true);
    },

    /** 悬停进入图片 */
    _onOver(e) {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      // 仅正文区域内的图片
      if (!img.closest('.RichText, .RichContent-inner, .Post-RichTextContainer')) return;
      // 跳过小图（图标/头像等）
      if (img.naturalWidth <= 300 || img.naturalHeight <= 200) return;
      if (img.closest('.zmp-img-overlay')) return;
      this._show(img);
    },

    /** 悬停离开图片 */
    _onOut(e) {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (!img.closest('.RichText, .RichContent-inner, .Post-RichTextContainer')) return;
      // 离开的图片不是当前展示的图片则忽略
      if (!this._overlay || this._overlay.dataset.src !== img.src) return;
      // 短暂延迟，给鼠标移入预览层留时间
      setTimeout(() => {
        if (this._overlay && this._overlay.dataset.src === img.src && !this._overlay.matches(':hover')) {
          this._hide();
        }
      }, 120);
    },

    /** 展示预览层 */
    _show(img) {
      this._hide();
      const overlay = document.createElement('div');
      overlay.className = 'zmp-img-overlay';
      overlay.dataset.src = img.src;

      const inner = document.createElement('img');
      inner.src = img.src;
      inner.alt = img.alt || '';
      // 原图可能更大，优先取 origin 质量参数
      if (/(zhimg\.com)/.test(img.src) && !/[?&]source=/.test(img.src)) {
        inner.src = img.src + (img.src.includes('?') ? '&' : '?') + 'source=zs';
      }

      const caption = document.createElement('span');
      caption.className = 'zmp-img-caption';
      caption.textContent = '点击任意处关闭';

      overlay.appendChild(inner);
      overlay.appendChild(caption);

      this._clickHandler = () => this._hide();
      overlay.addEventListener('click', this._clickHandler);

      document.body.appendChild(overlay);
      this._overlay = overlay;
    },

    _hide() {
      if (this._overlay) {
        if (this._clickHandler) {
          this._overlay.removeEventListener('click', this._clickHandler);
          this._clickHandler = null;
        }
        this._overlay.remove();
        this._overlay = null;
      }
    },

    destroy() {
      this._hide();
      if (this._hoverHandler) {
        document.removeEventListener('mouseover', this._hoverHandler, true);
        document.removeEventListener('mouseout', this._outHandler, true);
        this._hoverHandler = null;
        this._outHandler = null;
      }
    }
  };
})();
