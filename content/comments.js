/**
 * 知乎盐选会员增强助手 - 评论区优化模块
 */
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
    const comments = document.querySelectorAll('.CommentItemV2, .CommentContent, [class*="CommentItem"]');
    if (comments.length === 0) return;

    comments.forEach(comment => {
      const text = comment.textContent || '';

      // 折叠低质短评
      if (this.config.foldShortComments) {
        const contentEl = comment.querySelector('.CommentContent, [class*="CommentContent"]');
        if (contentEl) {
          const contentText = contentEl.textContent.trim();
          if (contentText.length < this.config.minCommentLength) {
            this.foldComment(comment, '短评已折叠');
          }
        }
      }

      // 折叠广告带货评论
      if (this.config.foldAdComments) {
        if (this.isAdComment(text)) {
          this.foldComment(comment, '疑似广告已折叠');
        }
      }

      // 关键词屏蔽
      if (this.config.blockKeywords && this.config.blockKeywords.length > 0) {
        const blocked = this.config.blockKeywords.some(kw => text.includes(kw));
        if (blocked) {
          this.foldComment(comment, '关键词屏蔽');
        }
      }
    });

    // 添加排序控件
    this.addSortControls();
  },

  /**
   * 判断是否为广告评论
   */
  isAdComment(text) {
    const adKeywords = [
      '优惠', '折扣', '领券', '下单', '购买链接', '点击购买',
      '限时', '秒杀', '特价', '券后', '复制', '淘口令',
      '京东', '拼多多', '点击这里', '扫码', '加群', '私聊'
    ];
    return adKeywords.some(kw => text.includes(kw));
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
    const commentHeader = document.querySelector('.Comments-container .Card-header, [class*="Comment"] .Card-header');
    if (!commentHeader || commentHeader.querySelector('.zmp-sort-btns')) return;

    const sortBtns = document.createElement('div');
    sortBtns.className = 'zmp-sort-btns';
    sortBtns.style.cssText = 'display:inline-flex;gap:6px;margin-left:12px;';

    const byLikes = document.createElement('button');
    byLikes.textContent = '按点赞';
    byLikes.style.cssText = 'font-size:12px;padding:2px 8px;border:1px solid #ddd;border-radius:3px;background:#f9f9f9;cursor:pointer;';
    byLikes.onclick = () => this.sortComments('likes');

    const byTime = document.createElement('button');
    byTime.textContent = '按时间';
    byTime.style.cssText = 'font-size:12px;padding:2px 8px;border:1px solid #ddd;border-radius:3px;background:#f9f9f9;cursor:pointer;';
    byTime.onclick = () => this.sortComments('time');

    sortBtns.appendChild(byLikes);
    sortBtns.appendChild(byTime);
    commentHeader.appendChild(sortBtns);
  },

  /**
   * 评论排序
   */
  sortComments(type) {
    const container = document.querySelector('.Comments-container, [class*="CommentList"]');
    if (!container) return;

    const comments = Array.from(container.querySelectorAll('.CommentItemV2, [class*="CommentItem"]'));
    if (comments.length === 0) return;

    comments.sort((a, b) => {
      if (type === 'likes') {
        const likesA = this.getLikeCount(a);
        const likesB = this.getLikeCount(b);
        return likesB - likesA;
      } else {
        // 按DOM顺序（时间）
        return 0;
      }
    });

    // 重新插入排序后的评论
    const parent = comments[0].parentNode;
    comments.forEach(c => parent.appendChild(c));
  },

  /**
   * 获取评论点赞数
   */
  getLikeCount(comment) {
    const likeBtn = comment.querySelector('[class*="like"] button, [class*="Like"] button, button[class*="vote"]');
    if (likeBtn) {
      const text = likeBtn.textContent.trim();
      const num = parseInt(text.replace(/[^\d]/g, ''));
      return isNaN(num) ? 0 : num;
    }
    return 0;
  },

  /**
   * 为回答添加快捷操作栏
   */
  addAnswerToolbars() {
    const answers = document.querySelectorAll('.AnswerItem, .List-item [class*="ContentItem"]');
    answers.forEach(answer => {
      if (answer.querySelector('.zmp-answer-toolbar')) return;

      const toolbar = document.createElement('div');
      toolbar.className = 'zmp-answer-toolbar';

      // 复制全文
      const copyBtn = document.createElement('button');
      copyBtn.textContent = '复制全文';
      copyBtn.onclick = () => {
        const content = answer.querySelector('.RichContent-inner, .RichText');
        if (content) {
          navigator.clipboard.writeText(content.innerText).then(() => {
            copyBtn.textContent = '已复制!';
            setTimeout(() => { copyBtn.textContent = '复制全文'; }, 1500);
          }).catch(() => {
            copyBtn.textContent = '复制失败';
            setTimeout(() => { copyBtn.textContent = '复制全文'; }, 1500);
          });
        }
      };

      // 复制作者ID
      const authorBtn = document.createElement('button');
      authorBtn.textContent = '复制作者';
      authorBtn.onclick = () => {
        const authorEl = answer.querySelector('.AuthorInfo-name, [class*="AuthorInfo"] a, .UserLink a');
        if (authorEl) {
          navigator.clipboard.writeText(authorEl.textContent.trim()).then(() => {
            authorBtn.textContent = '已复制!';
            setTimeout(() => { authorBtn.textContent = '复制作者'; }, 1500);
          }).catch(() => {
            authorBtn.textContent = '复制失败';
            setTimeout(() => { authorBtn.textContent = '复制作者'; }, 1500);
          });
        }
      };

      // 生成分享链接
      const shareBtn = document.createElement('button');
      shareBtn.textContent = '分享链接';
      shareBtn.onclick = () => {
        const answerId = answer.getAttribute('data-za-detail-view-element_id') ||
                         answer.id || '';
        let shareUrl = window.location.href.split('#')[0];
        if (answerId) {
          shareUrl += `#answer-${answerId}`;
        }
        navigator.clipboard.writeText(shareUrl).then(() => {
          shareBtn.textContent = '已复制!';
          setTimeout(() => { shareBtn.textContent = '分享链接'; }, 1500);
        }).catch(() => {
          shareBtn.textContent = '复制失败';
          setTimeout(() => { shareBtn.textContent = '分享链接'; }, 1500);
        });
      };

      toolbar.appendChild(copyBtn);
      toolbar.appendChild(authorBtn);
      toolbar.appendChild(shareBtn);

      const header = answer.querySelector('.ContentItem-head, .AnswerItem-header, [class*="ContentItem-meta"]');
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
    const seen = new Map();

    comments.forEach(comment => {
      const content = comment.querySelector('.CommentContent, [class*="CommentContent"]');
      if (!content) return;

      const text = content.textContent.trim().substring(0, 50);
      if (text.length < 10) return;

      if (seen.has(text)) {
        this.foldComment(comment, '重复评论已折叠');
      } else {
        seen.set(text, true);
      }
    });
  }
};
