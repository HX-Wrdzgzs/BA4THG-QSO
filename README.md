# BA4THG 通联档案

BA4THG 的独立 QSO 长期档案与公开查询网站。

## 实际使用方式

日常 QSO 仍然在第三方小程序中记录。本站不替代那个小程序，而是同时做两件事：

1. 公开页面直接读取第三方公开接口当前能够提供的近期记录，让刚完成的通联不必等手工归档就能显示。
2. 管理页面把第三方近期记录同步进 Cloudflare D1，形成长期可控的归档副本。

```text
第三方小程序日常记录
        ↓
api.mzyyun.com 公开接口
        ├──────────────→ qso.mizuki.top 近期实时显示
        │
        └→ 管理员浏览器同步 → Pages Functions → D1 长期档案
                                               ↓
                                      qso.mizuki.top 历史查询
```

公开页会把“第三方近期实时记录”和“本站 D1 已归档记录”合并显示，并按通联信息去重。

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
- 公开页面：近期实时记录 + 长期归档记录查询
- 管理页面：录入、修改、历史导入、第三方同步和备份导出
- 长期数据库：Cloudflare D1
- 近期第三方数据源：`https://api.mzyyun.com/public/qso`
- QSL 图片与卡面：继续放在独立的 `BA4THG-QSL` 仓库，不与本项目混合

## 公开搜索

公开页只保留一个搜索框，不要求访客理解“本台 / 对方、年份、模式、频段”等数据库筛选条件。

可以直接搜索：

- 对方呼号，例如 `BA4VRM`
- 频率，例如 `430.610`
- 地点
- 设备
- 天线
- 模式
- 备注
- RST

本站固定以 `BA4THG` 为本台，因此搜索 `BA4VRM` 会直接查找 BA4THG 与 BA4VRM 的相关记录。

## 数据原则

1. 已经同步或导入 D1 的记录长期保留。
2. 第三方接口以后不再返回某条旧记录时，本站不会因此删除归档副本。
3. 第三方同步通过来源编号建立映射，同时使用 QSO 指纹避免重复。
4. 如果第三方记录已经被你在本站手工修改，则本站修改后的内容优先，后续同步不会覆盖它。
5. 近期公开记录可以直接从第三方接口实时显示；较早记录由本站 D1 提供。
6. 实时记录与 D1 记录在浏览器端合并并去重。
7. 较早记录可以通过 ADIF、CSV、JSON 或手工方式补齐。
8. 应定期把 JSON 与 ADIF 备份到 Cloudflare 账户之外。

## 自动部署

Cloudflare Pages 已连接 GitHub 的 `main` 分支并启用自动部署。以后只要向 `main` 提交修改，Cloudflare Pages 会自动重新部署，不再使用额外的 GitHub Actions 部署挂钩。

## 文档

- 部署与 Cloudflare 配置：[`DEPLOYMENT.md`](./DEPLOYMENT.md)
- 页面设计规范：[`DESIGN.md`](./DESIGN.md)
