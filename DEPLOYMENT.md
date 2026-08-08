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
| `ADMIN_API_TOKEN` | Secret | 至少 32 位随机字符串 |

可用 PowerShell 生成随机令牌：

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

不要把 `ADMIN_API_TOKEN` 提交到 GitHub 或写进前端源码。

## 4. 管理后台保护

API 本身要求 Bearer Token。正式使用时再用 Cloudflare Zero Trust Access 额外保护：

- `https://qso.mizuki.top/admin.html`
- `https://qso.mizuki.top/api/admin/*`

建议只允许你的邮箱登录。

## 5. 首次使用

1. 打开 `https://qso.mizuki.top/admin.html`。
2. 输入 `ADMIN_API_TOKEN`，连接 D1。
3. 点击“同步小程序 API”。浏览器会直接访问 `api.mzyyun.com`，因此会带 `Origin: https://qso.mizuki.top`。
4. API 返回的近一年公开记录会再提交到本站管理 API，归档进 D1。
5. 几年前的 QSO 使用 ADIF、CSV、JSON 或手动录入补齐。

## 6. 备份

建议：

- 大批量导入前：导出 JSON + ADIF
- 每周：ADIF
- 每月：JSON
- 至少一份保存到本地 NAS、电脑或其他云盘

D1 是长期在线档案，但不应成为唯一副本。
