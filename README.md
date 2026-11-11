# milifo · EdgeOne Pages 版

静态页面 + 一个 `/api` 函数，数据全放 EdgeOne Pages 的 **Blob** 存储里。
登录、留言、投稿审核、封面图都是真的。

```
.
├─ index.html        首页
├─ works.html        作品列表（?kind=original / community）
├─ post.html         文章 + 留言（?id=1）
├─ login.html
├─ register.html
├─ submit.html       投稿 / 编辑（?id=3 编辑已发布的）
├─ admin.html        后台：待审核、全部内容
├─ 404.html
├─ assets/
│  ├─ style.css      原设计
│  ├─ blog.css       组件样式
│  ├─ app.js         时钟、入场动画
│  └─ app-api.js     调 /api 的前端逻辑
├─ functions/
│  └─ api/[[default]].js   所有 /api/* 的入口
├─ package.json      只有一个依赖：@edgeone/pages-blob
└─ .gitignore
```

## 部署方式 A：GitHub（推荐）

仓库已经推到 GitHub 之后：

1. EdgeOne Pages 控制台 → 新建项目 → 选「导入 Git 仓库」→ 授权 → 选这个仓库和分支（`main`）。
2. 构建设置：
   - 构建命令：`npm install`（或留空，Node 预设会自动装依赖）
   - 输出目录：`.`（就是仓库根目录，不要填 dist）
3. 绑定存储：存储 → **Blob** → 新建 Store，名字 `BLOG_BLOB` → 绑定到项目。
4. 环境变量：
   - `ADMIN_EMAIL`：你的邮箱
   - `ADMIN_PASSWORD`：你的密码（**必须设**，不设就用函数里的默认值，那个不能留）
   - `BLOB_STORE`（可选）：Blob 的 Store 名，默认 `BLOG_BLOB`
5. 部署一次，然后打开 `/api/health`，应该是：

```json
{"ok":true,"store":"blob","storeName":"BLOG_BLOB","blob":{"ok":true,"name":"BLOG_BLOB","error":""},"envKeys":["BLOB_STORE"],"user":null}
```

## 部署方式 B：直接上传 zip

不接 GitHub 也行：控制台「部署」→ 上传 `milifo-edge-site.zip`（`index.html` 在根），
其余绑定步骤同上。区别是这种方式**没有构建步骤**，`@edgeone/pages-blob` 可能装不上，
那样所有 `/api` 都会报“Blob 存储不可用”。所以能接 GitHub 就接 GitHub。

## 第一次访问会自动建数据

函数第一次被调用时（`ensureSeed`）会：

- 建站长账号（用 `ADMIN_EMAIL` / `ADMIN_PASSWORD`）
- 写 3 篇示例文章

所以首屏不会空着。想换成自己写的，直接进后台删掉或编辑。

## 报错怎么办

页面出现「`存储初始化失败：…`」「`Blob 不可用：…`」，说明**连不上 Blob 存储**。按顺序试：

1. **对一下存储名**：控制台 → 存储 → Blob，看你建的存储叫什么（不是绑定变量名）。把它填到环境变量 `BLOB_STORE`，重新部署。
2. **看诊断**：浏览器打开 `/api/health`，会返回 `blob.ok`、`blob.name`、`blob.error` 和 `envKeys`（你配了哪些变量），把这段 JSON 发我就能定位。
3. **确认依赖装了**：`package.json` 里有 `@edgeone/pages-blob`，部署日志里能看到 `npm install` 成功。

这个版本**只用 Blob**，代码里没有任何 KV 调用，也不需要绑 KV。

## 功能对照

| 地址 | 谁 | 做什么 |
| --- | --- | --- |
| `/` | 所有人 | 最近更新、写作列表 |
| `/works.html` | 所有人 | 作品列表，按原创/社区过滤 |
| `/post.html?id=1` | 所有人 | 文章正文 + 留言 |
| `/register.html` | 所有人 | 注册（8 位密码） |
| `/submit.html` | 登录用户 | 投稿；站长发的直接发布，别人发的进待审核 |
| `/admin.html` | 只有站长 | 通过/拒绝投稿、编辑全部内容 |

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/session` | 当前登录用户 |
| POST | `/api/login` / `/api/register` / `/api/logout` | 会话 |
| GET | `/api/posts?kind=all\|original\|community` | 只返回已发布 |
| GET | `/api/post?id=` | 文章 + 留言 |
| POST | `/api/post/save` | 新建/编辑（会员 → pending） |
| POST | `/api/post/delete` | 作者或站长 |
| POST | `/api/moderate` | `{id, action:'approve'\|'reject'}` 仅站长 |
| POST | `/api/comment` | 需登录 |
| POST | `/api/upload` | 需登录，≤5MB，jpg/png/webp/gif |
| GET | `/api/img/<key>` | 读回图片，1 年强缓存 |
| GET | `/api/admin/queue` | 仅站长 |
| GET | `/api/health` | 自检 |

所有 POST 都校验 `Origin` 与本站一致，跨站请求返回 403。
密码用 PBKDF2-SHA256（12 万次）加盐存储；会话是 HttpOnly cookie，30 天。

## 数据怎么存的

一个 Blob Store 里全是普通键值，值是 JSON 字符串：

| 键 | 内容 |
| --- | --- |
| `user:<email>` | 账号（含密码哈希） |
| `users:index` | 邮箱列表 |
| `post:<id>` | 文章 |
| `posts:index` | 文章 id 列表（最多 500） |
| `cmt:<postId>` | 这篇的留言数组 |
| `sess:<token>` | 会话（30 天） |
| `seq:user` / `seq:post` | 自增序号 |
| `img/<时间戳>-<随机>.<ext>` | 封面图二进制 |
| `meta:seeded` | 初始化标记 |

读取统一用 `consistency:"strong"`，所以刚写完立刻就能读到。

## 本地预览（可选）

线上这套不需要本地跑。想在本机看一眼：

```bash
npm install          # 装 @edgeone/pages-blob
node dev-edge.js     # http://127.0.0.1:8090
```

`dev-edge.js` 不在这个包里，它在开发目录里，用 mock 的 `@edgeone/pages-blob`（`.edge-blob/` 目录）。

## 已知限制

- 整个后端依赖 `@edgeone/pages-blob`。装不上就全站接口 500 —— 所以要接 GitHub 构建，
  别用“直接上传”。
- Blob 免费额度用完后写入抛 `QuotaExceededError`，站点变只读（读、删仍可用）。
- 单张图 5MB 上限；正文别贴 base64 图片。
- 没做邮件通知：有人投稿需要你自己去 `/admin.html` 看。

