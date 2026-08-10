# BA4THG 通联档案部署说明

## 1. Cloudflare Pages

将本仓库连接到 Cloudflare Pages，使用以下设置：

- 框架预设：无
- 构建命令：留空
- 构建输出目录：`.`
- 根目录：仓库根目录
- 生产分支：`main`
- 自动部署：启用

正式自定义域名：

```text
qso.mizuki.top
```

GitHub 与 Cloudflare Pages 已连接后，每次向 `main` 提交修改，Cloudflare 会自动重新部署，不需要再配置额外的部署挂钩或 GitHub Actions。

## 2. 第三方小程序网站接入

本站近期数据来自日常使用的第三方小程序公开接口：

```text
https://api.mzyyun.com/public/qso
```

当 `https://qso.mizuki.top` 已经可以正常通过 HTTPS 访问后，在对方小程序中进入：

```text
设置 → 网站接入
```

添加完整网站来源：

```text
https://qso.mizuki.top
```

这里必须填写完整协议和域名：

- 正确：`https://qso.mizuki.top`
- 不要只填：`qso.mizuki.top`
- 不要加页面路径：`/admin.html`

第三方接口会根据浏览器携带的网站来源（Origin）识别对应台站。没有来源信息，或者来源没有在小程序中登记时，会返回 403。

## 3. D1 数据库

数据库名称：

```text
ba4thg-qso
```

当前迁移文件：

```text
migrations/0001_initial.sql
```

如果直接使用 Cloudflare 网页控制台，可以进入：

```text
D1 数据库 → ba4thg-qso → 控制台
```

把迁移 SQL 粘贴执行即可。

执行完成后使用：

```text
/tables
```

应看到主要业务表：

```text
qsos
qso_sources
sync_runs
audit_logs
```

`sqlite_sequence` 是 SQLite 自己维护的系统表，出现它属于正常情况。

如果以后改用命令行，也可以执行：

```bash
npx wrangler d1 migrations apply ba4thg-qso --remote
```

## 4. Pages 绑定 D1

进入 Cloudflare：

```text
Workers 和 Pages → ba4thg-qso → 设置 → 绑定
```

添加 D1 数据库绑定：

- 类型：D1 数据库
- 变量名称：`DB`
- 数据库：`ba4thg-qso`

变量名称必须严格是大写 `DB`，因为后端代码读取的是 `env.DB`。

## 5. 变量和机密

进入：

```text
Workers 和 Pages → ba4thg-qso → 设置 → 变量和机密
```

添加：

| 名称 | 类型 | 值 |
|---|---|---|
| `OPERATOR_CALLSIGN` | 文本 | `BA4THG` |
| `ACCESS_TEAM_DOMAIN` | 文本 | `https://<team-name>.cloudflareaccess.com` |
| `ACCESS_AUD` | 文本 | Access 应用的 Application Audience (AUD) Tag |

`ACCESS_TEAM_DOMAIN` 和 `ACCESS_AUD` 不是机密，但必须填写当前 Cloudflare Access 环境的真实值，不能保留示例占位符。本项目不再配置或使用 `ADMIN_API_TOKEN`。公开查询不需要站点机密；管理端安全边界由下一节的 Cloudflare Access 提供。

## 6. 自动部署

当前项目使用 Cloudflare Pages 自带的 Git 集成：

```text
GitHub main 分支
      ↓
Cloudflare 自动检测提交
      ↓
自动构建并部署
      ↓
https://qso.mizuki.top
```

在 Cloudflare 项目“设置”中应能看到：

```text
生产分支：main
自动部署：已启用
```

如果页面提示“此项目已与您的 Git 帐户断开连接”，需要重新授权 GitHub 中的 Cloudflare Workers and Pages 应用，并确保它有权访问：

```text
HX-Wrdzgzs/BA4THG-QSO
```

## 7. 第一次同步第三方记录

1. 打开 `https://qso.mizuki.top/admin.html`，完成管理端访问策略要求的登录。
2. 进入“记录管理”。
3. 确认对方小程序“设置 → 网站接入”已经登记 `https://qso.mizuki.top`。
4. 点击“同步近期记录”。
5. 浏览器直接访问 `api.mzyyun.com`，第三方接口识别本站来源后返回当前可公开查询的近期记录。
6. 浏览器再把这些记录提交给本站管理接口，保存进 D1。
7. 以后第三方接口不再返回的旧记录，本站也不会自动删除。

如果同步出现 403，优先检查小程序中的“网站接入”是否登记了完全一致的：

```text
https://qso.mizuki.top
```

## 8. 补齐历史记录

第三方公开接口只负责当前能够查询到的近期数据。更早的通联记录需要通过以下方式补齐：

- ADIF 导入
- CSV 导入
- JSON 导入
- 管理页面手工录入

如果某条第三方同步记录后来在本站手工修改，本站修改后的内容会成为本地权威版本，后续同步不会覆盖它。

## 9. 管理页面保护

管理端必须使用 Cloudflare Access 作为唯一的登录和安全边界。删除页面令牌并不等于开放管理接口；部署完成前不要把下列路径提供给未登录访客。

Pages Functions 对每个管理请求都只接受 Cloudflare Access 注入的 `Cf-Access-Jwt-Assertion`，使用 `ACCESS_TEAM_DOMAIN/cdn-cgi/access/certs` 的 JWKS 校验 JWT 签名，并同时校验 issuer（必须等于 `ACCESS_TEAM_DOMAIN`）和 audience（必须等于 `ACCESS_AUD`）。`Cf-Access-Authenticated-User-Email`、自定义 email header 以及“只判断 header 存在”的逻辑都不会被信任。

`ACCESS_TEAM_DOMAIN` 或 `ACCESS_AUD` 缺失、格式无效，JWT 缺失、签名错误、issuer 错误或 AUD 错误，管理接口都会 fail closed 返回 HTTP 403；不会因为无法读取配置而放行。

在 Cloudflare 控制台中进入：

```text
Zero Trust → Access → 应用程序 → 添加自托管应用
```

创建一个覆盖正式域名的应用，至少添加两条路径：

```text
https://qso.mizuki.top/admin.html
https://qso.mizuki.top/api/admin/*
```

策略建议：

- 动作：允许
- 规则：只允许管理员的邮箱、邮箱组或身份提供商用户组
- 未匹配策略：拒绝

保存后，从未登录浏览器访问 `admin.html` 应先被访问策略拦截；登录后页面直接打开“记录管理”。同一策略必须覆盖 `/api/admin/*`，否则即使页面受到保护，管理接口也可能被单独调用。

公开路径保持不受管理策略影响：

部署后应至少验证以下结果：未带 JWT、使用错误签名、错误 issuer、错误 AUD，以及临时移除任一 Access 环境变量时，`/api/admin/session` 和其他 `/api/admin/*` 都返回 403；只有 Access 签发且通过完整校验的 JWT 才能继续执行管理操作。

```text
/
/api/public/*
```

## 10. 备份

建议：

- 大批量导入前：导出 JSON + ADIF
- 每周：导出 ADIF
- 每月：导出 JSON
- 至少一份备份放在 Cloudflare 账户之外，例如本地电脑、NAS 或其他云盘

D1 是长期在线档案，但不应成为唯一副本。
