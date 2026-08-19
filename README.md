# BA4THG 通联档案

BA4THG 的独立 QSO 长期档案、公开查询和 QSL 卡片申请网站。

## 实际使用方式

日常 QSO 仍然在第三方小程序中记录。本站不替代那个小程序，而是同时做两件事：

1. 日常 QSO 仍由现有小程序记录。
2. 用户主动查询某个呼号时，公开页面读取第三方公开接口当前能够提供的近期记录，并与本站 D1 长期档案合并去重。
3. 第三方公开接口负责近期查询和 QSL 申请，本站 D1 负责长期归档。
4. 管理页面可以把第三方近期记录完整同步进 Cloudflare D1；公开 API 在成功取得对应呼号的第三方记录时也会校验并写入 D1。

```text
第三方小程序日常记录
        ↓
api.mzyyun.com 公开接口
        ├─ 用户主动按呼号查询时返回近期记录
        ├─ 用户完成身份核验后申请 QSL 卡片
        │
        ├→ 公开 API 查询成功 → 校验/去重 → D1 长期档案
        │
        └→ 管理员浏览器同步 → Pages Functions → D1 长期档案
                                               ↓
                                      qso.mizuki.top 查询
```

历史文件也可以直接进入本站：

```text
ADIF / CSV / JSON / 手工录入
              ↓
Cloudflare Pages Functions
              ↓
Cloudflare D1
```

## 站点信息

- 正式域名：`https://qso.mizuki.top`
- 公开页面：默认不显示任何 QSO，只允许按呼号主动查询
- 管理页面：录入、修改、历史导入、近期同步和备份导出
- 长期数据库：Cloudflare D1
- Pages 默认域名：`https://ba4thg-qso.pages.dev`
- 近期第三方数据源：`https://api.mzyyun.com/public/qso`
- QSL 申请：`https://api.mzyyun.com/public/qsl-apply/*`
- QSL 图片与卡面：继续放在独立的 `BA4THG-QSL` 仓库，不与本项目混合

## 公共 API

公开查询接口：

```text
GET /api/public/qsos?q=<CALLSIGN>&page=1&limit=20
```

当前可用入口：

```text
浏览器 / 正式站点：
https://qso.mizuki.top/api/public/qsos?q=<CALLSIGN>&page=1&limit=20

机器调用 / 自动验收：
https://ba4thg-qso.pages.dev/api/public/qsos?q=<CALLSIGN>&page=1&limit=20
```

两者进入同一套 Pages Functions，并读取同一个 D1。当前 Cloudflare 自定义域名对部分非浏览器流量会触发 Managed Challenge；在对应 WAF / Bot 规则完成 API 路径豁免前，机器调用优先使用 `pages.dev` 入口。该豁免只应针对公开 API 路径，不应放宽 `/api/admin/*` 或 Cloudflare Access。

API 行为：

1. 外部 API 请求默认先尝试通过 `api.mzyyun.com/public/qso` 获取该呼号当前可公开查询的近期记录。
2. 上游返回的记录必须同时满足“本台呼号为 `BA4THG`”和“对方呼号等于本次查询呼号”，通过校验后才会写入 D1。
3. 写入使用上游记录 ID + QSO 指纹去重；已经在本站手工修改过的本地记录不会被上游覆盖。
4. 直接上游数据优先级高于公开互证快照；互证快照只能补齐空缺，不能覆盖后续取得的直接记录。
5. 完成刷新或补齐后再从 D1 返回结果，因此 API 返回的数据同时也是本站长期档案的一部分。
6. `refresh=0` 可显式关闭实时刷新，只读取 D1；已内置的经验证一次性补齐数据仍可在 D1 为空时落库。
7. 响应中的 `upstream` 字段给出本次是否尝试刷新、上游 HTTP 状态、验证码状态以及归档统计。
8. `stale`、`complete`、`degraded`、`warning` 用于区分“实时上游成功”“仅返回长期档案”“使用降级补齐”等状态；上游异常而 D1 可读时不再伪装成“确定无记录”，也不再仅因为上游失败返回 502。
9. GET/OPTIONS 支持 CORS。第一方页面本身会直接调用第三方接口并处理图形验证，因此同源页面请求默认只读 D1，避免重复请求上游。

示例：

```text
https://ba4thg-qso.pages.dev/api/public/qsos?q=BA4VRM&page=1&limit=20
```

目前已通过生产验收确认：BA4VRM 的 4 条经验证互证记录已写入 D1，后续查询直接从长期档案返回，不会重复插入。

## 公开查询规则

公开页面采用最小化展示和主动查询原则：

1. 首页默认不展示任何通联记录。
2. 必须由访客主动输入对方呼号后才进行查询。
3. 本站固定以 `BA4THG` 为本台，只按对方呼号精确匹配。
4. 不提供按地点、设备、频率、天线、备注等条件扫描整个数据库的公开搜索。
5. 页面文案和示例不得使用真实通联对象的呼号、频率、地点或设备作为演示数据。
6. 第三方近期记录只在用户主动查询对应呼号时请求，不在首页批量拉取。

## QSL 申请流程

公开查询使用第三方 API 的 `role=contact` 模式；只有公开查询返回通联后，页面才显示 QSL 申请入口。QSL 申请本身直接使用第三方的完整状态机：

```text
lookup → 身份核验 → verifyToken → 勾选 eligibleQsoIds → submit → status
```

`lookup` 的 `mask`、`sms`、`locked`、`session`、`status` 和 `already_sent` 六种模式都由 [`qsl-apply.js`](./qsl-apply.js) 处理。`queryToken` 仅保存在当前会话并只用于公开 QSO 第 1 页；`sessionToken` 按呼号保存到 `qsl-apply-session:<CALLSIGN>`；一次性 `verifyToken` 只保存在控制器内存中，提交成功或 API 明确返回失效时销毁。

QSL 申请资格、申请记录和寄出状态以第三方 QSL API 为准。本站 D1 只负责长期 QSO 归档，不在本地模拟 QSL application record。真实 `submit` 会产生正式申请记录，验收时必须先明确测试用的 QSO，不能随意使用真实通联重复提交。

## 数据原则

1. 已经同步或导入 D1 的记录长期保留。
2. 第三方接口以后不再返回某条旧记录时，本站不会因此删除归档副本。
3. 第三方同步通过来源编号建立映射，同时使用 QSO 指纹避免重复。
4. 如果第三方记录已经被你在本站手工修改，则本站修改后的内容优先，后续同步不会覆盖它。
5. 公共 API 成功取得指定呼号的第三方近期记录时，会先校验、归档，再从 D1 返回；公开页面仍可合并浏览器实时结果与 D1 已归档记录。
6. 经验证的公开互证记录只用于补齐明确缺失的记录，来源单独记录，不能覆盖直接上游或本地人工版本。
7. 较早记录可以通过 ADIF、CSV、JSON 或手工方式补齐。
8. 应定期把 JSON 与 ADIF 备份到 Cloudflare 账户之外。

公开页面不提供全库浏览，也不提供按地点、设备、天线、频率或备注搜索。查询结果只针对访客输入的呼号与固定台站 `BA4THG` 的公开通联。

管理页面和 `/api/admin/*` 由 Cloudflare Access 统一保护，不再使用 `ADMIN_API_TOKEN` 或页面内的管理令牌。

管理 Functions 使用 `jose` 验证 `Cf-Access-Jwt-Assertion` 的签名、issuer 和 Access Application Audience。部署时必须配置 `ACCESS_TEAM_DOMAIN` 与 `ACCESS_AUD`；配置缺失或 JWT 校验失败时管理接口统一返回 403。

## 当前外部依赖状态

当前代码、D1 和 Pages 默认域名均已通过自动测试；仍有两个不属于仓库代码本身的外部配置项：

1. `api.mzyyun.com` 对 `Origin: https://qso.mizuki.top` 当前返回 HTTP 500，而其文档约定未登记 Origin 应返回 403。需要在第三方小程序“设置 → 网站接入”确认该 Origin 正确绑定到 BA4THG，并由上游修复未绑定 Origin 的 500 错误路径。
2. `qso.mizuki.top` 对 GitHub Actions 等非浏览器请求当前返回 Cloudflare `cf-mitigated: challenge`；`ba4thg-qso.pages.dev` 同一 API 返回 200。需要在 Cloudflare WAF / Bot 配置中只对公开 API 路径调整挑战规则。

这两个问题都不会删除已经写入 D1 的长期档案；上游恢复后，直接记录会按来源优先级更新外部管理的归档记录。

## 自动部署与测试

Cloudflare Pages 已连接 GitHub 的 `main` 分支并启用自动部署。以后只要向 `main` 提交修改，Cloudflare Pages 会自动重新部署。

仓库同时保留两类自动验收：

- `QSO Functions tests`：运行 Node 回归测试。
- `Production QSO smoke`：通过 Pages 默认域名验证生产 Functions 和 D1，并单独记录自定义域名的 Cloudflare 挑战状态。

## 文档

- 部署与 Cloudflare 配置：[`DEPLOYMENT.md`](./DEPLOYMENT.md)
- 页面设计规范：[`DESIGN.md`](./DESIGN.md)
