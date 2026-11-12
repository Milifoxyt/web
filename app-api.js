/**
 * milifo 博客（EdgeOne Pages Functions 版）前端
 * 负责：会话、顶栏、文章列表、文章页、留言、投稿、后台
 */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var HUES = [24, 6, 38, 330, 15, 44];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(ts) {
    var d = new Date(Number(ts) || Date.now());
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }

  function md(src) {
    var lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var list = null;
    var quote = [];

    function inline(s) {
      return esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
    }

    function flushList() {
      if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; }
    }
    function flushQuote() {
      if (quote.length) { out.push('<blockquote>' + quote.join('') + '</blockquote>'); quote = []; }
    }

    lines.forEach(function (line) {
      var t = line.trim();
      if (/^###\s+/.test(t)) { flushList(); flushQuote(); out.push('<h3>' + inline(t.slice(4)) + '</h3>'); return; }
      if (/^##\s+/.test(t)) { flushList(); flushQuote(); out.push('<h2>' + inline(t.slice(3)) + '</h2>'); return; }
      if (/^#\s+/.test(t)) { flushList(); flushQuote(); out.push('<h2>' + inline(t.slice(2)) + '</h2>'); return; }
      if (/^>\s?/.test(t)) { flushList(); quote.push('<p>' + inline(t.replace(/^>\s?/, '')) + '</p>'); return; }
      if (/^[-*]\s+/.test(t)) { flushQuote(); (list = list || []).push('<li>' + inline(t.replace(/^[-*]\s+/, '')) + '</li>'); return; }
      if (t === '---') { flushList(); flushQuote(); out.push('<hr>'); return; }
      if (!t) { flushList(); flushQuote(); return; }
      flushList(); flushQuote();
      out.push('<p>' + inline(t) + '</p>');
    });
    flushList(); flushQuote();
    return out.join('\n');
  }

  async function getJSON(path) {
    try {
      var r = await fetch(path, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
      var j = null;
      try { j = await r.json(); } catch (e) { j = {}; }
      j.status = r.status;
      return j;
    } catch (e) {
      return { ok: false, status: 0, error: '网络不通，稍后再试' };
    }
  }

  async function postJSON(path, data) {
    try {
      var r = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data || {})
      });
      var j = null;
      try { j = await r.json(); } catch (e) { j = {}; }
      j.status = r.status;
      return j;
    } catch (e) {
      return { ok: false, status: 0, error: '网络不通，稍后再试' };
    }
  }

  /* ------------------------------ 会话 ------------------------------ */

  var ME = null;

  function paintHeader() {
    var box = $('.topbar__account');
    if (!box) return;
    if (!ME) {
      box.innerHTML = '<a class="topbar__link" href="login.html">登录</a>' +
        '<a class="topbar__cta" href="register.html">注册</a>';
      return;
    }
    box.innerHTML =
      '<a class="topbar__link" href="submit.html">投稿</a>' +
      (ME.role === 'admin' ? '<a class="topbar__link" href="admin.html">管理</a>' : '') +
      '<span class="topbar__link" style="cursor:default">' + esc(ME.name) + '</span>' +
      '<button class="topbar__cta" type="button" data-logout>退出</button>';
    var btn = $('[data-logout]', box);
    if (btn) {
      btn.addEventListener('click', async function () {
        await postJSON('/api/logout', {});
        location.href = 'index.html';
      });
    }
  }

  async function boot() {
    var s = await getJSON('/api/session');
    ME = s && s.user ? s.user : null;
    paintHeader();
    return ME;
  }

  function flash(el, text, kind) {
    if (!el) return;
    el.className = 'flash' + (kind === 'err' ? ' flash--err' : ' flash--js');
    el.textContent = text;
    el.hidden = false;
  }

  /* ------------------------------ 首页 ------------------------------ */

  function recentItem(p) {
    return '<li><a href="post.html?id=' + p.id + '">' +
      '<span class="recent__title">' + esc(p.title) + '</span>' +
      '<span class="recent__place">' + fmt(p.createdAt) + ' · ' + (p.kind === 'original' ? '原创' : '社区') + '</span>' +
      '</a></li>';
  }

  function writingRow(p) {
    return '<a class="writing__row" href="post.html?id=' + p.id + '">' +
      '<span class="writing__date">' + fmt(p.createdAt) + '</span>' +
      '<span class="writing__title">' + esc(p.title) + '</span>' +
      '<span class="writing__tag">' + (p.kind === 'original' ? '原创' : '社区') + '</span>' +
      '</a>';
  }

  async function pageIndex() {
    var r = await getJSON('/api/posts?kind=all');
    var posts = (r && r.posts) || [];
    var recent = $('[data-recent]');
    if (recent) {
      recent.innerHTML = posts.slice(0, 3).map(recentItem).join('') ||
        '<li><a href="works.html"><span class="recent__title">还没有文章</span>' +
        '<span class="recent__place">去后台写第一篇</span></a></li>';
    }
    var writing = $('[data-writing]');
    if (writing) {
      writing.innerHTML = posts.slice(0, 4).map(writingRow).join('') ||
        '<p class="section__note">还没有发布的作品。</p>';
    }
  }

  /* ------------------------------ 作品页 ------------------------------ */

  function workCard(p) {
    var hue = HUES[p.id % HUES.length];
    var cover = p.cover
      ? '<span class="work__cover"><img src="' + esc(p.cover) + '" alt="" loading="lazy"></span>'
      : '<span class="work__cover is-blank" style="--h:' + hue + '"></span>';
    return '<li class="work"><a href="post.html?id=' + p.id + '">' + cover +
      '<span class="work__body">' +
      '<span class="work__date">' + fmt(p.createdAt) + '</span>' +
      '<span class="work__title">' + esc(p.title) + '</span>' +
      '<span class="work__excerpt">' + esc(p.excerpt || '') + '</span>' +
      '<span class="work__meta">' + esc(p.authorName || 'milifo') + ' · ' +
      (p.kind === 'original' ? '原创' : '社区投稿') + '</span>' +
      '</span></a></li>';
  }

  async function pageWorks() {
    var params = new URLSearchParams(location.search);
    var kind = params.get('kind') || 'all';
    var r = await getJSON('/api/posts?kind=' + encodeURIComponent(kind));
    var posts = (r && r.posts) || [];
    var box = $('[data-works]');
    if (box) {
      box.innerHTML = posts.map(workCard).join('') ||
        '<li class="work"><span class="work__body"><span class="work__title">这里还空着</span>' +
        '<span class="work__excerpt">发布第一篇文章后，它会出现在这里。</span></span></li>';
    }
    $$('.tabs .tab[data-kind]').forEach(function (t) {
      var k = t.getAttribute('data-kind');
      if (k === kind || (k === 'all' && kind === 'all')) t.classList.add('is-on');
      else t.classList.remove('is-on');
    });
    var cta = $('[data-works-cta]');
    if (cta) {
      if (ME) { cta.textContent = '写一篇'; cta.href = 'submit.html'; }
      else { cta.textContent = '登录后投稿'; cta.href = 'login.html?next=submit.html'; }
    }
  }

  /* ------------------------------ 文章页 ------------------------------ */

  async function pagePost() {
    var id = Number(new URLSearchParams(location.search).get('id'));
    var wrap = $('[data-post]');
    if (!id) { if (wrap) wrap.innerHTML = '<p class="section__note">缺少文章编号。</p>'; return; }

    var r = await getJSON('/api/post?id=' + id);
    if (!r.ok) {
      var box = $('[data-comments]');
      if (box) box.remove();
      if (wrap) {
        wrap.innerHTML =
          '<p class="label">404</p>' +
          '<h1 class="section__title">没有这一篇</h1>' +
          '<p class="section__note">' + esc(r.error || '文章不存在') +
          '。可能还在审核，或者作者已经把它撤下了。</p>' +
          '<p class="section__more"><a class="btn btn--ghost" href="works.html">看看别的 →</a></p>';
      }
      return;
    }
    var p = r.post;
    document.title = p.title + ' · milifo';

    if (wrap) {
      wrap.innerHTML =
        '<p class="post__meta"><span>' + (p.kind === 'original' ? '原创 / ORIGINAL' : '社区投稿 / COMMUNITY') +
        '</span> · <span>' + fmt(p.createdAt) + '</span></p>' +
        '<h1 class="post__title">' + esc(p.title) + '</h1>' +
        '<p class="post__meta">' + esc(p.authorName || 'milifo') + ' · ' + fmt(p.createdAt) +
        ' · <span data-ccount>' + (r.comments || []).length + '</span> 条留言</p>' +
        (p.cover ? '<figure class="post__cover"><img src="' + esc(p.cover) + '" alt=""></figure>' : '') +
        '<div class="prose">' + md(p.body) + '</div>' +
        '<p class="section__more" data-owner></p>';
    }

    var owner = $('[data-owner]');
    if (owner && ME && (ME.role === 'admin' || ME.email === p.authorEmail)) {
      owner.innerHTML = '<a class="btn btn--small btn--ghost" href="submit.html?id=' + p.id + '">编辑</a> ' +
        '<button class="btn btn--small btn--danger" type="button" data-del>删除</button>';
      $('[data-del]').addEventListener('click', async function () {
        if (!confirm('删掉《' + p.title + '》？')) return;
        var d = await postJSON('/api/post/delete', { id: p.id });
        if (d.ok) location.href = 'works.html';
        else alert(d.error || '删除失败');
      });
    }

    renderComments(r.comments || [], id);
  }

  function renderComments(list, postId) {
    var box = $('[data-comments]');
    if (!box) return;
    box.innerHTML =
      '<h2 class="comments__title">留言 <span>' + list.length + '</span></h2>' +
      '<ol class="comments__list">' + (list.length ? list.map(function (c) {
        return '<li class="comment"><div class="comment__head">' +
          '<span class="comment__name">' + esc(c.name) + '</span>' +
          '<span class="comment__date">' + fmt(c.createdAt) + '</span></div>' +
          '<p class="comment__body">' + esc(c.body).replace(/\n/g, '<br>') + '</p></li>';
      }).join('') : '<li class="comment"><p class="comment__body">还没有留言，来说两句。</p></li>') + '</ol>' +
      (ME
        ? '<form class="form form--comment" data-comment-form>' +
          '<label class="field"><span class="field__label">留言</span>' +
          '<textarea name="body" rows="3" required placeholder="写点什么，不需要很长。"></textarea></label>' +
          '<div class="form__actions"><span class="flash" data-flash hidden></span>' +
          '<button class="btn" type="submit">发表留言</button></div></form>'
        : '<p class="comments__login">想留言？<a href="login.html?next=' +
          encodeURIComponent('post.html?id=' + postId) + '">先登录</a>，或者' +
          '<a href="register.html">注册</a>一个账号。</p>');

    var form = $('[data-comment-form]');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = $('[data-flash]', form);
      var text = form.body.value.trim();
      if (!text) return;
      form.querySelector('button').disabled = true;
      var r = await postJSON('/api/comment', { post: postId, body: text });
      form.querySelector('button').disabled = false;
      if (!r.ok) { flash(f, r.error || '发送失败', 'err'); return; }
      var one = await getJSON('/api/post?id=' + postId);
      renderComments(one.comments || [], postId);
      var cc = $('[data-ccount]');
      if (cc && one.comments) cc.textContent = one.comments.length;
    });
  }

  /* ------------------------------ 登录 / 注册 ------------------------------ */

  function nextUrl() {
    var n = new URLSearchParams(location.search).get('next');
    if (!n || /^https?:|^\/\//i.test(n)) return 'index.html';
    return n;
  }

  async function pageAuth() {
    var form = $('[data-auth-form]');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = $('[data-flash]', form);
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      var payload = {
        email: form.email.value.trim(),
        password: form.password.value
      };
      var kind = form.getAttribute('data-auth-form');
      if (kind === 'register') {
        payload.name = form.name ? form.name.value.trim() : '';
        if (payload.password !== form.password2.value) {
          btn.disabled = false;
          flash(f, '两次密码不一样', 'err');
          return;
        }
      }
      var r = await postJSON(kind === 'register' ? '/api/register' : '/api/login', payload);
      btn.disabled = false;
      if (!r.ok) { flash(f, r.error || '失败了，再试一次', 'err'); return; }
      location.href = nextUrl();
    });
  }

  /* ------------------------------ 投稿 ------------------------------ */

  async function pageSubmit() {
    var form = $('[data-post-form]');
    if (!form) return;

    if (!ME) {
      location.replace('login.html?next=' + encodeURIComponent(location.pathname + location.search));
      return;
    }

    var id = Number(new URLSearchParams(location.search).get('id')) || 0;
    var coverInput = form.querySelector('[data-uploader-value]');

    if (id) {
      var one = await getJSON('/api/post?id=' + id);
      if (one.ok && one.post) {
        form.title.value = one.post.title;
        form.excerpt.value = one.post.excerpt || '';
        form.body.value = one.post.body;
        if (one.post.cover && coverInput) {
          coverInput.value = one.post.cover;
          var prev = form.querySelector('[data-uploader-preview]');
          if (prev) { prev.src = one.post.cover; prev.hidden = false; }
        }
        $('[data-submit-title]').textContent = '编辑作品';
        $('[data-submit-note]').textContent = '改完保存，立刻生效。';
        if (one.post.status === 'pending') {
          flash($('[data-flash]', form), '这篇还在等审核，审核通过后才会公开。');
        }
      }
    }

    setupUploader();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var f = $('[data-flash]', form);
      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      var r = await postJSON('/api/post/save', {
        id: id || undefined,
        title: form.title.value.trim(),
        excerpt: form.excerpt.value.trim(),
        body: form.body.value,
        cover: coverInput ? coverInput.value : ''
      });
      btn.disabled = false;
      if (!r.ok) { flash(f, r.error || '保存失败', 'err'); return; }
      if (ME.role === 'admin') {
        flash(f, '已保存，正在跳转…');
        setTimeout(function () { location.href = 'post.html?id=' + r.post.id; }, 800);
      } else {
        flash(f, '已提交，等站长审核通过后会出现在「社区投稿」里。');
        form.title.value = '';
        form.excerpt.value = '';
        form.body.value = '';
        btn.textContent = '再投一篇';
      }
    });
  }

  /* ------------------------------ 封面上传 ------------------------------ */

  function setupUploader() {
    var box = $('[data-uploader]');
    if (!box || box.dataset.ready) return;
    box.dataset.ready = '1';

    var file = box.querySelector('[data-uploader-file]');
    var pick = box.querySelector('[data-uploader-pick]');
    var hint = box.querySelector('[data-uploader-hint]');
    var prev = box.querySelector('[data-uploader-preview]');
    var val = box.querySelector('[data-uploader-value]');
    if (!file || !pick) return;

    pick.addEventListener('click', function () { file.click(); });

    file.addEventListener('change', async function () {
      var f = file.files && file.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { hint.textContent = '超过 5MB，换一张'; return; }

      hint.textContent = '上传中…';
      pick.disabled = true;
      try {
        var res = await fetch('/api/upload', {
          method: 'POST',
          body: f,
          headers: { 'content-type': f.type || 'application/octet-stream' }
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || '上传失败');
        if (val) val.value = data.url;
        if (prev) { prev.src = data.url; prev.hidden = false; }
        hint.textContent = '已上传';
      } catch (err) {
        hint.textContent = err.message;
      } finally {
        pick.disabled = false;
      }
    });
  }

  /* ------------------------------ 后台 ------------------------------ */

  async function pageAdmin() {
    var box = $('[data-admin]');
    if (!box) return;
    if (!ME) { location.replace('login.html?next=admin.html'); return; }
    if (ME.role !== 'admin') {
      box.innerHTML = '<p class="section__note">这个页面只有站长能看。你现在登录的是 ' +
        esc(ME.email) + '。</p><p class="section__more"><a class="btn btn--ghost" href="index.html">回首页</a></p>';
      return;
    }

    var r = await getJSON('/api/admin/queue');
    if (!r.ok) { box.innerHTML = '<p class="section__note">' + esc(r.error || '读取失败') + '</p>'; return; }

    var pending = r.pending || [];
    var all = r.all || [];

    box.innerHTML =
      '<div class="admin__actions">' +
      '<a class="btn" href="submit.html">写新作品</a>' +
      '<a class="btn btn--ghost" href="index.html">回首页</a></div>' +

      '<section class="panel"><h2 class="panel__title">待审核 <span class="badge">' + pending.length + '</span></h2>' +
      (pending.length
        ? '<table class="table"><thead><tr><th>标题</th><th>作者</th><th>日期</th><th></th></tr></thead><tbody>' +
          pending.map(function (p) {
            return '<tr><td><strong>' + esc(p.title) + '</strong>' +
              (p.excerpt ? '<br><span class="admin__sub">' + esc(p.excerpt) + '</span>' : '') + '</td>' +
              '<td>' + esc(p.authorName) + '</td><td>' + fmt(p.createdAt) + '</td>' +
              '<td class="row-actions"><a class="btn btn--small btn--ghost" href="post.html?id=' + p.id + '">看</a>' +
              '<button class="btn btn--small" data-ok="' + p.id + '">通过</button>' +
              '<button class="btn btn--small btn--danger" data-no="' + p.id + '">拒绝</button></td></tr>';
          }).join('') + '</tbody></table>'
        : '<p class="section__note">没有待审核的投稿。</p>') +
      '</section>' +

      '<section class="panel"><h2 class="panel__title">全部内容 <span class="badge">' + all.length + '</span></h2>' +
      '<table class="table"><thead><tr><th>标题</th><th>类型</th><th>状态</th><th>作者</th><th>日期</th><th></th></tr></thead><tbody>' +
      all.map(function (p) {
        return '<tr><td><a href="post.html?id=' + p.id + '">' + esc(p.title) + '</a></td>' +
          '<td>' + (p.kind === 'original' ? '原创' : '社区') + '</td>' +
          '<td>' + (p.status === 'published' ? '已发布' : '待审核') + '</td>' +
          '<td>' + esc(p.authorName) + '</td><td>' + fmt(p.createdAt) + '</td>' +
          '<td class="row-actions"><a class="btn btn--small btn--ghost" href="submit.html?id=' + p.id + '">编辑</a></td></tr>';
      }).join('') +
      '</tbody></table></section>';

    $$('[data-ok]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        var res = await postJSON('/api/moderate', { id: Number(b.getAttribute('data-ok')), action: 'approve' });
        if (res.ok) pageAdmin();
        else { b.disabled = false; alert(res.error || '失败'); }
      });
    });
    $$('[data-no]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('拒绝并删除这篇投稿？')) return;
        b.disabled = true;
        var res = await postJSON('/api/moderate', { id: Number(b.getAttribute('data-no')), action: 'reject' });
        if (res.ok) pageAdmin();
        else { b.disabled = false; alert(res.error || '失败'); }
      });
    });
  }

  /* ------------------------------ 启动 ------------------------------ */

  async function route() {
    var page = document.body.getAttribute('data-page');
    if (page === 'index') return pageIndex();
    if (page === 'works') return pageWorks();
    if (page === 'post') return pagePost();
    if (page === 'auth') return pageAuth();
    if (page === 'submit') return pageSubmit();
    if (page === 'admin') return pageAdmin();
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await boot();
    await route();
  });
})();
