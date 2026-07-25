/**
 * 知乎盐选会员增强助手 - 评论区优化模块
 */

/** 广告评论关键词 */
const AD_COMMENT_KEYWORDS = [
  '优惠', '折扣', '领券', '下单', '购买链接', '点击购买',
  '限时', '秒杀', '特价', '券后', '复制', '淘口令',
  '京东', '拼多多', '点击这里', '扫码', '加群', '私聊',
];

/** 回答操作栏按钮配置 */
const ANSWER_TOOLBAR_BUTTONS = [
  {
    text: '复制全文',
    getText: (answer) => {
      const el = answer.querySelector('.RichContent-inner, .RichText');
      return el ? el.innerText : null;
    },
  },
  {
    text: '复制作者',
    getText: (answer) => {
      const el = answer.querySelector('.AuthorInfo-name, [class*="AuthorInfo"] a, .UserLink a');
      return el ? el.textContent.trim() : null;
    },
  },
  {
    text: '分享链接',
    getText: (answer) => {
      const answerId = answer.getAttribute('data-za-detail-view-element_id') || answer.id || '';
      let url = window.location.href.split('#')[0];
      if (answerId) url += `#answer-${answerId}`;
      return url;
    },
  },
];

const ZMPComments = {
  config: null,

  async init(config) {
    this.config = config.purify;
    // 延迟执行，等待评论区加载
    setTimeout(() => {
      this.processComments();
      this.foldDuplicateComments();
    }, 2000);
    this.addAnswerToolbars();
  },

  /**
   * 处理评论区
   */
  processComments() {
    const comments = document.querySelectorAll(ZMPUtils.SELECTORS.COMMENTS);
    if (comments.length === 0) return;

    comments.forEach(comment => {
      const text = comment.textContent || '';

      // 折叠低质短评
      if (this.config.foldShortComments) {
        const contentEl = comment.querySelector('.CommentContent, [class*="CommentContent"]');
        if (contentEl && contentEl.textContent.trim().length < this.config.minCommentLength) {
          this.foldComment(comment, '短评已折叠');
        }
      }

      // 折叠广告带货评论
      if (this.config.foldAdComments && this.isAdComment(text)) {
        this.foldComment(comment, '疑似广告已折叠');
      }

      // 关键词屏蔽
      const keywords = this.config.blockKeywords;
      if (keywords && keywords.length > 0 && keywords.some(kw => text.includes(kw))) {
        this.foldComment(comment, '关键词屏蔽');
      }
    });

    this.addSortControls();
  },

  /**
   * 判断是否为广告评论
   */
  isAdComment(text) {
    return AD_COMMENT_KEYWORDS.some(kw => text.includes(kw));
  },

  /**
   * 折叠评论
   */
  foldComment(comment, reason) {
    if (comment.classList.contains('zmp-comment-folded')) return;
    comment.classList.add('zmp-comment-folded');
    comment.title = reason;
    comment.addEventListener('click', () => {
      comment.classList.remove('zmp-comment-folded');
    }, { once: true });
  },

  /**
   * 添加评论区排序控件
   */
  addSortControls() {
    const commentHeader = document.querySelector(ZMPUtils.SELECTORS.COMMENT_HEADER);
    if (!commentHeader || commentHeader.querySelector('.zmp-sort-btns')) return;

    const sortBtns = document.createElement('div');
    sortBtns.className = 'zmp-sort-btns';
    sortBtns.style.cssText = 'display:inline-flex;gap:6px;margin-left:12px;';

    const btnStyle = 'font-size:12px;padding:2px 8px;border:1px solid #ddd;border-radius:3px;background:#f9f9f9;cursor:pointer;';
    sortBtns.append(
      ZMPUtils.createButton({ text: '按点赞', style: btnStyle, onClick: () => this.sortComments('likes') }),
      ZMPUtils.createButton({ text: '按时间', style: btnStyle, onClick: () => this.sortComments('time') }),
    );

    commentHeader.appendChild(sortBtns);
  },

  /**
   * 评论排序
   */
  sortComments(type) {
    const container = document.querySelector(ZMPUtils.SELECTORS.COMMENT_CONTAINER);
    if (!container) return;

    const comments = Array.from(container.querySelectorAll('.CommentItemV2, [class*="CommentItem"]'));
    if (comments.length === 0) return;

    if (type === 'likes') {
      comments.sort((a, b) => this.getLikeCount(b) - this.getLikeCount(a));
    }
    // 按时间排序 = 保持 DOM 顺序（无需操作）

    // 重新插入排序后的评论
    const parent = comments[0].parentNode;
    comments.forEach(c => parent.appendChild(c));
  },

  /**
   * 获取评论点赞数
   */
  getLikeCount(comment) {
    const likeBtn = comment.querySelector('[class*="like"] button, [class*="Like"] button, button[class*="vote"]');
    if (!likeBtn) return 0;
    const num = parseInt(likeBtn.textContent.trim().replace(/[^\d]/g, ''));
    return isNaN(num) ? 0 : num;
  },

  /**
   * 为回答添加快捷操作栏
   * 通过 ANSWER_TOOLBAR_BUTTONS 配置驱动，避免重复代码
   */
  addAnswerToolbars() {
    const answers = document.querySelectorAll(ZMPUtils.SELECTORS.ANSWERS);
    answers.forEach(answer => {
      if (answer.querySelector('.zmp-answer-toolbar')) return;

      const toolbar = document.createElement('div');
      toolbar.className = 'zmp-answer-toolbar';

      ANSWER_TOOLBAR_BUTTONS.forEach(({ text, getText }) => {
        const btn = ZMPUtils.createButton({ text });
        btn.onclick = () => {
          const content = getText(answer);
          if (content) {
            ZMPUtils.copyToClipboard(content, btn, text);
          }
        };
        toolbar.appendChild(btn);
      });

      const header = answer.querySelector(ZMPUtils.SELECTORS.ANSWER_HEADER);
      if (header) {
        header.after(toolbar);
      } else {
        answer.insertBefore(toolbar, answer.firstChild);
      }
    });
  },

  /**
   * 折叠重复水评论
   */
  foldDuplicateComments() {
    const comments = document.querySelectorAll('.CommentItemV2, [class*="CommentItem"]');
    const seen = new Set();

    comments.forEach(comment => {
      const content = comment.querySelector('.CommentContent, [class*="CommentContent"]');
      if (!content) return;

      const text = content.textContent.trim().substring(0, 50);
      if (text.length < 10) return;

      if (seen.has(text)) {
        this.foldComment(comment, '重复评论已折叠');
      } else {
        seen.add(text);
      }
    });
  },
};
