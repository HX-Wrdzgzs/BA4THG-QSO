# BA4THG QSO Archive 部署

## 1. Cloudflare Pages

将本仓库连接到 Cloudflare Pages：

- Framework preset：None
- Build command：留空
- Build output directory：`.`
- Root directory：仓库根目录

正式自定义域名使用：

```text
qso.mizuki.top
```

域名确认可以 HTTPS 正常访问后，再在微信小程序 **设置 → 网站接入** 中添加完整 Origin：

```text
https://qso.mizuki.top
```

不要填写路径，例如 `/admin.html`；也不要只填裸域名。公开 API 会根据浏览器自动携带的 `Origin` 识别对应操作员，无 Origin 或未登记 Origin 会返回 403。

## 2. 创建 D1

```bash
npx wrangler d1 create ba4thg-qso
```

记录返回的 `database_id`。将 `wrangler.toml.example` 复制为本地 `wrangler.toml`，替换数据库 ID。

执行迁移：

```bash
npx wrangler d1 migrations apply ba4thg-qso --remote
```

## 3. Pages 绑定

Cloudflare Pages → Settings → Bindings：

- 类型：D1 database
- Variable name：`DB`
- Database：`ba4thg-qso`

Variables and Secrets：

| 名称 | 类型 | 值 |
|---|---|---|
| `OPERATOR_CALLSIGN` | Text | `BA4THG` |
| `ADMIN_API_TOKEN` | Secret | 至少 32 字节随机值 |

Windows PowerShell 可用：

```powershell
$bytes = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); ([BitConverter]::ToString($bytes) -replace '-','').ToLower()
```

不要把 `ADMIN_API_TOKEN` 提交到 GitHub 或写进前端源码。

## 4. 每次提交自动触发 Pages 部署

仓库包含：

```text
.github/workflows/trigger-cloudflare-pages.yml
```

该工作流会在每次 `main` 分支收到新提交后调用 Cloudflare Pages Deploy Hook。

一次性配置：

1. Cloudflare Pages 项目 → Settings → Builds & deployments → Deploy hooks。
2. 创建一个 Production deploy hook，例如名称 `github-main`，分支选 `main`。
3. 复制生成的 Deploy Hook URL。
4. GitHub 仓库 `HX-Wrdzgzs/BA4THG-QSO` → Settings → Secrets and variables → Actions → New repository secret。
5. Secret 名称填写：

```text
CLOUDFLARE_PAGES_DEPLOY_HOOK
```

6. Secret 值填写刚才 Cloudflare 生成的 Deploy Hook URL。

此 Secret 未配置时，GitHub Actions 会安全跳过显式触发，不会使工作流失败。

如果 Cloudflare 的原生 Git 集成已经稳定做到每次 `main` 提交自动部署，那么这个 Deploy Hook 工作流属于额外兜底；确认长期稳定后可以删除该 workflow，避免同一次提交产生两个部署。

## 5. 管理后台保护

API 本身要求 Bearer Token。正式使用时再用 Cloudflare Zero Trust Access 额外保护：

- `https://qso.mizuki.top/admin.html`
- `https://qso.mizuki.top/api/admin/*`

建议只允许你的邮箱登录。

## 6. 首次使用

1. 打开 `https://qso.mizuki.top/admin.html`。
2. 输入 `ADMIN_API_TOKEN`，连接 D1。
3. 点击“同步小程序 API”。浏览器会直接访问 `api.mzyyun.com`，因此会带 `Origin: https://qso.mizuki.top`。
4. API 返回的近一年公开记录会再提交到本站管理 API，归档进 D1。
5. 几年前的 QSO 使用 ADIF、CSV、JSON 或手动录入补齐。

## 7. 备份

建议：

- 大批量导入前：导出 JSON + ADIF
- 每周：ADIF
- 每月：JSON
- 至少一份保存到本地 NAS、电脑或其他云盘

D1 是长期在线档案，但不应成为唯一副本。
