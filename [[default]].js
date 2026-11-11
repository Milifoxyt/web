/**
 * milifo 博客 —— EdgeOne Pages Functions 版后端
 * 路径：functions/api/[[default]].js  →  匹配 /api/*
 *
 * 存储：EdgeOne Pages Blob（只用 Blob，不依赖 KV）
 * 运行环境：V8 isolate（Web Crypto / fetch / Request / Response）
 */

const COOKIE = 'mf_sess';
const SESSION_DAYS = 30;
const MAX_POSTS = 500;

/* ------------------------------ 工具 ------------------------------ */

const enc = new TextEncoder();

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra
    }
  });
}

const bad = (msg, status = 400) => json({ ok: false, error: msg }, status);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function jget(kv, key, fallback = null) {
  const raw = await kv.get(key);
  if (raw === null || raw === undefined || raw === '') return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

const jset = (kv, key, val) => kv.put(key, JSON.stringify(val));

const rnd = (n) => {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
};

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function pbkdf2(password, saltB64, iterations = 120000) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
  );
  return b64(bits);
}

async function hashPassword(password) {
  const salt = rnd(16);
  const saltB64 = btoa(String.fromCharCode(...Uint8Array.from(salt.match(/../g).map((h) => parseInt(h, 16)))));
  const hash = await pbkdf2(password, saltB64);
  return `pbkdf2$${saltB64}$${hash}`;
}

async function checkPassword(password, stored) {
  const [algo, saltB64, hash] = String(stored).split('$');
  if (algo !== 'pbkdf2' || !saltB64 || !hash) return false;
  const test = await pbkdf2(password, saltB64);
  if (test.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < test.length; i++) diff |= test.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

function cookies(req) {
  const raw = req.headers.get('cookie') || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

const setCookie = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

function originOk(req, url) {
  const o = req.headers.get('origin');
  if (!o) return true;
  try { return new URL(o).host === url.host; } catch { return false; }
}

async function body(req) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { return await req.json(); } catch { return {}; }
  }
  const text = await req.text();
  const out = {};
  new URLSearchParams(text).forEach((v, k) => { out[k] = v; });
  return out;
}

/* ------------------------------ 数据 ------------------------------ */

async function currentUser(req, kv) {
  const token = cookies(req)[COOKIE];
  if (!token) return null;
  const sess = await jget(kv, `sess:${token}`);
  if (!sess || sess.exp < Date.now()) return null;
  const user = await jget(kv, `user:${sess.email}`);
  return user ? { ...user, token } : null;
}

async function createSession(kv, email) {
  const token = rnd(32);
  await jset(kv, `sess:${token}`, { email, exp: Date.now() + SESSION_DAYS * 864e5 });
  return token;
}

const publicUser = (u) => u && {
  id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt
};

async function allPosts(kv) {
  const ids = await jget(kv, 'posts:index', []);
  if (!ids.length) return [];
  const rows = await Promise.all(ids.map((id) => jget(kv, `post:${id}`)));
  return rows.filter(Boolean);
}

const visible = (post, user) =>
  post.status === 'published' || (user && (user.role === 'admin' || user.email === post.authorEmail));

/* ------------------------------ 初始化 ------------------------------ */

const DEMO = [
  {
    title: '在南昌路的二楼读完《城市与狗》',
    excerpt: '十一月的上海开始起雾。我在南昌路一家旧书店的二楼，把《城市与狗》的最后三十页读完了。',
    body: '十一月的上海开始起雾。我在南昌路一家旧书店的二楼，把《城市与狗》的最后三十页读完了。\n\n## 为什么是这张桌子\n\n靠窗第二张，椅背有点松，但正对着梧桐。下午四点的光会斜着落到书页上，字会变淡，得把书往左挪一点。\n\n> 一本书读到最后一页的时候，记住的往往不是情节，而是当时的光线、声音，和椅子硬不硬。\n\n书店的猫叫「报纸」，会在你翻页的时候抬头看你一眼，然后继续睡。',
    kind: 'original'
  },
  {
    title: '把阅读当成一种坐标',
    excerpt: '我记不住读过的每一本书，但记得读它的那个下午。',
    body: '我记不住读过的每一本书，但记得读它的那个下午。\n\n书的内容会被忘掉，但读它的那个下午——光、声音、椅子硬不硬——往往记得很清楚。\n\n所以这个站只记两件事：读了什么，以及在哪儿读的。',
    kind: 'original'
  },
  {
    title: '关于「读不完」这件事',
    excerpt: '有些书不是用来读完的，是用来放在床头的。',
    body: '有些书不是用来读完的，是用来放在床头的。\n\n读了一半停下来，不代表放弃。它在那儿，每天看一眼，也许某天就接着读了。',
    kind: 'original'
  }
];

async function ensureSeed(kv, env) {
  const done = await jget(kv, 'meta:seeded');
  if (done) return;

  const email = (env && env.ADMIN_EMAIL) || 'hi@milifo.com';
  const password = (env && env.ADMIN_PASSWORD) || 'milifo-admin-2026';
  const now = Date.now();

  const admin = {
    id: 1,
    email: email.toLowerCase(),
    name: (env && env.ADMIN_NAME) || 'milifo',
    pass: await hashPassword(password),
    role: 'admin',
    createdAt: now
  };
  await jset(kv, `user:${admin.email}`, admin);
  await jset(kv, 'users:index', [admin.email]);
  await jset(kv, 'seq:user', 1);

  const ids = [];
  let pid = 0;
  for (const d of DEMO) {
    pid += 1;
    const post = {
      id: pid,
      title: d.title,
      excerpt: d.excerpt,
      body: d.body,
      cover: '',
      kind: 'original',
      status: 'published',
      authorEmail: admin.email,
      authorName: admin.name || 'milifo',
      createdAt: now - pid * 3600e3,
      updatedAt: now - pid * 3600e3
    };
    await jset(kv, `post:${pid}`, post);
    ids.unshift(pid);
  }
  await jset(kv, 'posts:index', ids);
  await jset(kv, 'seq:post', pid);
  await jset(kv, 'meta:seeded', { at: now });
}

/* ------------------------------ Blob（图片） ------------------------------ */

const IMG_MAX = 5 * 1024 * 1024;

const MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif'
};

/* ---------------- 存储：只用 Blob ---------------- */

let _rawStore = null;   // 原始 Blob store（图片用）
let _store = null;      // 包成 get/put/delete 的统一接口
let _storeKind = '';    // 'blob'
let _storeName = '';
let _storeErr = null;
let _storeTried = false;

const envStoreKeys = (env) => Object.keys(env || {}).filter((k) => /BLOB|STORE/i.test(k));

async function blobSdk() {
  try { return await import('@edgeone/pages-blob'); } catch (e) { return null; }
}

/**
 * 依次试候选名称，第一个能读通的才算数。
 * 名称顺序：环境变量指定 → 约定名。真实名称以控制台创建的存储名为准。
 */
async function probeBlob(env) {
  const mod = await blobSdk();
  if (!mod) {
    return { ok: false, error: '没有装 @edgeone/pages-blob（构建时缺少依赖，请用 Git 仓库 + npm install）' };
  }
  const names = [
    env && env.BLOB_STORE, env && env.BLOB_STORE_NAME, env && env.BLOG_BLOB,
    'BLOG_BLOB', 'milifo', 'milifo-blob', 'milifo_blog', 'blog'
  ].filter(Boolean).map(String);
  const errs = [];
  for (const name of [...new Set(names)]) {
    let s = null;
    try {
      s = mod.getStore ? mod.getStore(name) : null;
    } catch (e) {
      try { s = mod.getStore ? mod.getStore({ name }) : null; } catch (e2) { s = null; }
    }
    if (!s && typeof globalThis !== 'undefined' && globalThis[name]) s = globalThis[name];
    if (!s) { errs.push(name + ' → getStore 返回空'); continue; }
    try {
      await blobRead(s, '__probe__');
      return { ok: true, raw: s, name };
    } catch (e) {
      errs.push(name + ' → ' + (e && e.message || e));
    }
  }
  return { ok: false, error: 'Blob 不可用：' + errs.join('；') };
}

function sniffImage(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

/**
 * 读一个键，依次降级：
 *   {type:'text', consistency:'strong'} → {type:'text'} → 无参数
 * 不同版本的 SDK 对选项要求不一样，遇到 "Param Invalid" 就换下一档。
 */
let _blobReadMode = 0;

const isParamError = (e) => /param|invalid|argument|option|unsupported/i.test(String(e && e.message || e));

async function blobRead(store, key) {
  const modes = [
    ['get(k,{text,strong})', () => store.get(key, { type: 'text', consistency: 'strong' })],
    ['get(k,{text})', () => store.get(key, { type: 'text' })],
    ['get(k)', () => store.get(key)]
  ];
  const errs = [];
  for (let i = _blobReadMode; i < modes.length; i++) {
    try {
      const v = await modes[i][1]();
      _blobReadMode = i;
      if (v === null || v === undefined || typeof v === 'string') return v;
      if (typeof v.text === 'function') return await v.text();
      return await new Response(v).text();
    } catch (e) {
      errs.push(modes[i][0] + ' → ' + (e && e.message || e));
      if (!isParamError(e)) throw e;
    }
  }
  throw new Error('Blob 读取失败：' + errs.join(' | '));
}

/**
 * 写一个键，依次降级：
 *   set(key, value) → set(key, value, {contentType}) → setJSON
 * 不同版本的 SDK 对参数要求不一样，遇到 "Param Invalid" 换下一档。
 */
let _blobSetMode = 0;

async function blobWrite(store, key, value) {
  const text = String(value);
  const modes = [
    ['set(k,v)', () => store.set(key, text)],
    ['set(k,v,{contentType})', () => store.set(key, text, { contentType: 'text/plain; charset=utf-8' })],
    ['set(k,Blob)', () => store.set(key, new Blob([text], { type: 'text/plain; charset=utf-8' }))],
    ['set(k,Uint8Array)', () => store.set(key, enc.encode(text))],
    ['setJSON(k,v)', () => store.setJSON ? store.setJSON(key, text) : Promise.reject(new Error('no setJSON'))]
  ];
  const errs = [];
  for (let i = _blobSetMode; i < modes.length; i++) {
    try {
      await modes[i][1]();
      _blobSetMode = i;
      return;
    } catch (e) {
      errs.push(modes[i][0] + ' → ' + (e && e.message || e));
      if (!isParamError(e)) throw e;
    }
  }
  throw new Error('Blob 写入失败：' + errs.join(' | '));
}

/**
 * 键名规整：Blob 的对象键只保证 ASCII 安全，
 * 冒号、@ 这类字符会被 SDK 判成非法参数（Param Invalid），统一换掉。
 */
const safeKey = (k) => String(k)
  .replace(/:/g, '.')
  .replace(/@/g, '~')
  .replace(/[^A-Za-z0-9._\-/]/g, '_');

/**
 * 把 Blob 包成 get / put / delete 三个方法，
 * 这样上面所有 jget / jset 逻辑一行都不用改。
 */
function blobAsKV(store) {
  return {
    async get(key) {
      const v = await blobRead(store, safeKey(key));
      return v === null || v === undefined ? null : v;
    },
    async put(key, value) {
      await blobWrite(store, safeKey(key), value);
    },
    async delete(key) {
      await store.delete(safeKey(key));
    }
  };
}

/** 只用 Blob：没有绑好就直接报错，不退回任何其它存储 */
async function resolveStore(env) {
  if (_storeTried) {
    if (_storeErr) throw _storeErr;
    return _store;
  }
  _storeTried = true;

  const r = await probeBlob(env);
  if (r.ok) {
    _rawStore = r.raw;
    _store = blobAsKV(r.raw);
    _storeKind = 'blob';
    _storeName = r.name;
    return _store;
  }

  _storeErr = new Error(
    'Blob 存储不可用。' + r.error +
    '。请确认：① 已安装依赖 @edgeone/pages-blob；② 已创建 Blob 存储；' +
    '③ 存储名写进了环境变量 BLOB_STORE（没有就用约定的 BLOG_BLOB）。'
  );
  throw _storeErr;
}

/** 图片上传用：拿原始 Blob store（没配就 null） */
async function blobStore(env) {
  if (!_storeTried) { try { await resolveStore(env); } catch (e) { /* 交给调用方判断 */ } }
  return _rawStore;
}

/* ------------------------------ 路由 ------------------------------ */

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();

  let kv;
  try {
    kv = await resolveStore(env);
  } catch (e) {
    return json({ ok: false, error: e.message, needsStore: true }, 500);
  }

  try {
    await ensureSeed(kv, env);
  } catch (e) {
    return json({ ok: false, error: '存储初始化失败：' + (e.message || e) }, 500);
  }

  const user = await currentUser(request, kv);

  if (method === 'POST' && !originOk(request, url)) {
    return bad('跨站请求被拒绝', 403);
  }

  try {
    /* ---------- 图片（Blob） ---------- */
    if (path.startsWith('/api/img/')) {
      if (method !== 'GET') return bad('只支持 GET', 405);
      const store = await blobStore(env);
      if (!store) return bad('Blob 没有配置', 501);
      const key = decodeURIComponent(path.slice('/api/img/'.length));
      if (!key || key.includes('..')) return bad('路径不对', 400);
      let buf = null;
      for (const opts of [{ type: 'arrayBuffer' }, { type: 'blob' }, undefined]) {
        try {
          buf = opts ? await store.get(key, opts) : await store.get(key);
          if (buf) break;
        } catch (e) {
          if (!isParamError(e)) throw e;
        }
      }
      if (!buf) return bad('图片不存在', 404);
      if (typeof buf === 'string') buf = enc.encode(buf);
      else if (buf instanceof Response) buf = await buf.arrayBuffer();
      else if (typeof buf.arrayBuffer === 'function') buf = await buf.arrayBuffer();
      else if (buf.data) buf = new Uint8Array(buf.data);
      const ext = (key.split('.').pop() || 'jpg').toLowerCase();
      return new Response(buf, {
        status: 200,
        headers: {
          'content-type': MIME[ext] || 'application/octet-stream',
          'cache-control': 'public, max-age=31536000, immutable'
        }
      });
    }

    if (path === '/api/upload') {
      if (method !== 'POST') return bad('只支持 POST', 405);
      if (!user) return bad('请先登录', 401);
      const store = await blobStore(env);
      if (!store) return bad('图片上传还没配置：需要绑定 Blob 存储', 501);

      const bytes = await request.arrayBuffer();
      if (!bytes || bytes.byteLength === 0) return bad('没有收到文件');
      if (bytes.byteLength > IMG_MAX) return bad('图片最大 5MB');

      const ext = sniffImage(bytes);
      if (!ext) return bad('只支持 jpg / png / webp / gif');

      const key = `img/${Date.now()}-${rnd(4)}.${ext}`;
      await store.set(key, bytes);
      return json({ ok: true, url: `/api/img/${key}`, key });
    }

    switch (path) {
      /* ---------- 会话 ---------- */
      case '/api/session':
        return json({ ok: true, user: publicUser(user) });

      case '/api/login': {
        if (method !== 'POST') return bad('只支持 POST', 405);
        const b = await body(request);
        const email = String(b.email || '').trim().toLowerCase();
        const u = await jget(kv, `user:${email}`);
        if (!u || !(await checkPassword(String(b.password || ''), u.pass))) {
          return json({ ok: false, error: '邮箱或密码不对' }, 401);
        }
        const token = await createSession(kv, u.email);
        return json({ ok: true, user: publicUser(u) }, 200, { 'set-cookie': setCookie(token, SESSION_DAYS * 86400) });
      }

      case '/api/register': {
        if (method !== 'POST') return bad('只支持 POST', 405);
        const b = await body(request);
        const email = String(b.email || '').trim().toLowerCase();
        const name = String(b.name || '').trim();
        const password = String(b.password || '');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad('邮箱格式不对');
        if (password.length < 8) return bad('密码至少 8 位');
        if (await jget(kv, `user:${email}`)) return bad('这个邮箱已经注册过了', 409);

        const seq = (await jget(kv, 'seq:user', 0)) + 1;
        const u = {
          id: seq,
          email,
          name: name || email.split('@')[0],
          pass: await hashPassword(password),
          role: 'member',
          createdAt: Date.now()
        };
        await jset(kv, `user:${email}`, u);
        const idx = await jget(kv, 'users:index', []);
        idx.push(email);
        await jset(kv, 'users:index', idx);
        await jset(kv, 'seq:user', seq);

        const token = await createSession(kv, email);
        return json({ ok: true, user: publicUser(u) }, 200, { 'set-cookie': setCookie(token, SESSION_DAYS * 86400) });
      }

      case '/api/logout': {
        const token = cookies(request)[COOKIE];
        if (token) await kv.delete(`sess:${token}`);
        return json({ ok: true }, 200, { 'set-cookie': setCookie('', 0) });
      }

      /* ---------- 文章 ---------- */
      case '/api/posts': {
        const kind = url.searchParams.get('kind') || 'all';
        const posts = (await allPosts(kv))
          .filter((p) => p.status === 'published')
          .filter((p) => kind === 'all' || p.kind === kind)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((p) => ({
            id: p.id, title: p.title, excerpt: p.excerpt, cover: p.cover,
            kind: p.kind, status: p.status, authorName: p.authorName,
            createdAt: p.createdAt
          }));
        return json({ ok: true, posts });
      }

      case '/api/post': {
        const id = Number(url.searchParams.get('id'));
        const p = await jget(kv, `post:${id}`);
        if (!p) return bad('文章不存在', 404);
        if (!visible(p, user)) return bad('文章不存在', 404);
        const cmts = await jget(kv, `cmt:${id}`, []);
        return json({ ok: true, post: p, comments: cmts, user: publicUser(user) });
      }

      case '/api/post/save': {
        if (method !== 'POST') return bad('只支持 POST', 405);
        if (!user) return bad('请先登录', 401);
        const b = await body(request);
        const title = String(b.title || '').trim();
        const text = String(b.body || '').trim();
        if (title.length < 2) return bad('标题太短');
        if (text.length < 5) return bad('正文太短');

        const isAdmin = user.role === 'admin';
        const id = Number(b.id) || 0;

        if (id) {
          const old = await jget(kv, `post:${id}`);
          if (!old) return bad('文章不存在', 404);
          if (!isAdmin && old.authorEmail !== user.email) return bad('不能改别人的文章', 403);
          const next = {
            ...old, title,
            excerpt: String(b.excerpt || '').trim() || text.slice(0, 60),
            body: text,
            cover: String(b.cover || old.cover || ''),
            updatedAt: Date.now()
          };
          if (isAdmin && b.status) next.status = b.status;
          await jset(kv, `post:${id}`, next);
          return json({ ok: true, post: next });
        }

        const seq = (await jget(kv, 'seq:post', 0)) + 1;
        const post = {
          id: seq,
          title,
          excerpt: String(b.excerpt || '').trim() || text.slice(0, 60),
          body: text,
          cover: String(b.cover || ''),
          kind: isAdmin ? 'original' : 'community',
          status: isAdmin ? (b.status || 'published') : 'pending',
          authorEmail: user.email,
          authorName: user.name || user.email.split('@')[0],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await jset(kv, `post:${seq}`, post);
        const idx = await jget(kv, 'posts:index', []);
        idx.unshift(seq);
        await jset(kv, 'posts:index', idx.slice(0, MAX_POSTS));
        await jset(kv, 'seq:post', seq);
        return json({ ok: true, post });
      }

      case '/api/post/delete': {
        if (method !== 'POST') return bad('只支持 POST', 405);
        if (!user) return bad('请先登录', 401);
        const b = await body(request);
        const id = Number(b.id);
        const p = await jget(kv, `post:${id}`);
        if (!p) return bad('文章不存在', 404);
        if (user.role !== 'admin' && p.authorEmail !== user.email) return bad('没有权限', 403);
        await kv.delete(`post:${id}`);
        await kv.delete(`cmt:${id}`);
        const idx = (await jget(kv, 'posts:index', [])).filter((x) => x !== id);
        await jset(kv, 'posts:index', idx);
        return json({ ok: true });
      }

      case '/api/moderate': {
        if (method !== 'POST') return bad('只支持 POST', 405);
        if (!user || user.role !== 'admin') return bad('需要站长权限', 403);
        const b = await body(request);
        const id = Number(b.id);
        const action = String(b.action || '');
        const p = await jget(kv, `post:${id}`);
        if (!p) return bad('文章不存在', 404);
        if (action === 'approve') {
          p.status = 'published';
          p.updatedAt = Date.now();
          await jset(kv, `post:${id}`, p);
        } else if (action === 'reject') {
          await kv.delete(`post:${id}`);
          const idx = (await jget(kv, 'posts:index', [])).filter((x) => x !== id);
          await jset(kv, 'posts:index', idx);
        } else {
          return bad('不认识的操作');
        }
        return json({ ok: true });
      }

      /* ---------- 留言 ---------- */
      case '/api/comment': {
        if (method !== 'POST') return bad('只支持 POST', 405);
        if (!user) return bad('请先登录再留言', 401);
        const b = await body(request);
        const pid = Number(b.post);
        const text = String(b.body || '').trim();
        if (text.length < 1) return bad('写点什么再发');
        if (text.length > 2000) return bad('太长了，2000 字以内');
        const p = await jget(kv, `post:${pid}`);
        if (!p || p.status !== 'published') return bad('文章不存在', 404);

        const cmts = await jget(kv, `cmt:${pid}`, []);
        const c = {
          id: cmts.length ? Math.max(...cmts.map((x) => x.id)) + 1 : 1,
          name: user.name || user.email.split('@')[0],
          email: user.email,
          body: text,
          createdAt: Date.now()
        };
        cmts.push(c);
        await jset(kv, `cmt:${pid}`, cmts);
        return json({ ok: true, comment: c });
      }

      /* ---------- 后台 ---------- */
      case '/api/admin/queue': {
        if (!user || user.role !== 'admin') return bad('需要站长权限', 403);
        const posts = (await allPosts(kv))
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((p) => ({
            id: p.id, title: p.title, excerpt: p.excerpt, kind: p.kind,
            status: p.status, authorName: p.authorName, createdAt: p.createdAt
          }));
        return json({
          ok: true,
          pending: posts.filter((p) => p.status === 'pending'),
          all: posts
        });
      }

      case '/api/health': {
        const blob = await probeBlob(env);
        try { await resolveStore(env); } catch (e) { /* 报告用 */ }

        // 自测：写一次、读一次、删一次，把真实报错带出来
        const selfTest = { write: false, read: false, error: '' };
        if (_rawStore) {
          const probeKey = '__selftest__.txt';
          try { await blobWrite(_rawStore, probeKey, 'ok'); selfTest.write = true; }
          catch (e) { selfTest.error += 'write: ' + (e && e.message || e) + ' | '; }
          try { selfTest.read = (await blobRead(_rawStore, probeKey)) === 'ok'; }
          catch (e) { selfTest.error += 'read: ' + (e && e.message || e) + ' | '; }
          try { await _rawStore.delete(probeKey); } catch (e) { /* 忽略 */ }
        }

        const payload = {
          ok: true,
          store: _storeKind || 'none',
          storeName: _storeName || '',
          blob: { ok: blob.ok, name: blob.name || '', error: blob.ok ? '' : blob.error },
          selfTest,
          modes: { read: _blobReadMode, write: _blobSetMode },
          envKeys: envStoreKeys(env),
          user: publicUser(user)
        };

        // 浏览器直接打开时给一个人能读的页面（手机上截图就能发）
        const accept = (request.headers.get('accept') || '');
        if (accept.includes('text/html')) {
          const line = (k, v, bad) =>
            '<li><b>' + k + '</b><span style="color:' + (bad ? '#ff8a5c' : '#8fd694') + '">' +
            escapeHtml(String(v)) + '</span></li>';
          const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>存储自检</title>' +
            '<style>body{background:#0b0908;color:#f2eae1;font:16px/1.7 system-ui,sans-serif;' +
            'margin:0;padding:28px 20px}h1{font-size:22px;margin:0 0 4px}' +
            '.n{color:#a4958a;font-size:13px;letter-spacing:.08em;margin-bottom:22px}' +
            'ul{list-style:none;padding:0;margin:0}li{padding:11px 0;border-bottom:1px solid #2a2320;' +
            'display:flex;gap:12px;justify-content:space-between}b{font-weight:500;color:#a4958a}' +
            'span{font-family:ui-monospace,Consolas,monospace;font-size:13px;text-align:right;' +
            'word-break:break-all}.e{margin-top:18px;font-family:ui-monospace,monospace;font-size:12px;' +
            'color:#ff8a5c;word-break:break-all;white-space:pre-wrap}</style>' +
            '<h1>存储自检</h1><div class="n">/api/health</div><ul>' +
            line('store', payload.store, payload.store !== 'blob') +
            line('storeName', payload.storeName, false) +
            line('blob.ok', payload.blob.ok, !payload.blob.ok) +
            line('selfTest.write', payload.selfTest.write, !payload.selfTest.write) +
            line('selfTest.read', payload.selfTest.read, !payload.selfTest.read) +
            line('modes.write', payload.modes.write, false) +
            line('modes.read', payload.modes.read, false) +
            line('envKeys', payload.envKeys.join(',') || '(空)', false) +
            '</ul>' +
            (payload.blob.error ? '<div class="e">blob: ' + escapeHtml(payload.blob.error) + '</div>' : '') +
            (payload.selfTest.error ? '<div class="e">' + escapeHtml(payload.selfTest.error) + '</div>' : '') +
            '</html>';
          return new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
          });
        }

        return json(payload);
      }

      default:
        return bad('没有这个接口：' + path, 404);
    }
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e) }, 500);
  }
}
