# BA4THG 通联档案

BA4THG 的独立 QSO 长期档案、公开查询和 QSL 卡片申请网站。

## 实际使用方式

日常 QSO 仍然在第三方小程序中记录。本站不替代那个小程序，而是同时做两件事：

1. 日常 QSO 仍由现有小程序记录。
2. 用户主动查询某个呼号时，公开页面读取第三方公开接口当前能够提供的近期记录，并与本站 D1 长期档案合并去重。
3. 第三方公开接口负责近期查询和 QSL 申请，本站 D1 负责长期归档。
4. 管理页面把第三方近期记录同步进 Cloudflare D1，形成长期可控的归档副本。

```text
第三方小程序日常记录
        ↓
api.mzyyun.com 公开接口
        ├─ 用户主动按呼号查询时返回近期记录
        ├─ 用户完成身份核验后申请 QSL 卡片
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
- 近期第三方数据源：`https://api.mzyyun.com/public/qso`
- QSL 申请：`https://api.mzyyun.com/public/qsl-apply/*`
- QSL 图片与卡面：继续放在独立的 `BA4THG-QSL` 仓库，不与本项目混合

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
5. 用户主动查询某个呼号时，可合并第三方近期记录与本站 D1 已归档记录。
6. 较早记录可以通过 ADIF、CSV、JSON 或手工方式补齐。
7. 应定期把 JSON 与 ADIF 备份到 Cloudflare 账户之外。

公开页面不提供全库浏览，也不提供按地点、设备、天线、频率或备注搜索。查询结果只针对访客输入的呼号与固定台站 `BA4THG` 的公开通联。

管理页面和 `/api/admin/*` 由 Cloudflare Access 统一保护，不再使用 `ADMIN_API_TOKEN` 或页面内的管理令牌。

管理 Functions 使用 `jose` 验证 `Cf-Access-Jwt-Assertion` 的签名、issuer 和 Access Application Audience。部署时必须配置 `ACCESS_TEAM_DOMAIN` 与 `ACCESS_AUD`；配置缺失或 JWT 校验失败时管理接口统一返回 403。

## 自动部署

Cloudflare Pages 已连接 GitHub 的 `main` 分支并启用自动部署。以后只要向 `main` 提交修改，Cloudflare Pages 会自动重新部署，不再使用额外的 GitHub Actions 部署挂钩。

## 文档

- 部署与 Cloudflare 配置：[`DEPLOYMENT.md`](./DEPLOYMENT.md)
- 页面设计规范：[`DESIGN.md`](./DESIGN.md)
