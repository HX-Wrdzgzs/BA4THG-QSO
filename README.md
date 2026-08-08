# BA4THG QSO Archive

BA4THG 的独立 QSO 数字档案与公开日志网站。

## 架构

```text
网页手动录入 / ADIF / CSV / JSON ─┐
                                    ├─> Cloudflare Pages Functions ─> D1 ─> 公开日志
管理员浏览器 ─> api.mzyyun.com ────┘
             (已登记 Origin)
```

- 正式域名：`https://qso.mizuki.top`
- Cloudflare Pages：静态页面 + Pages Functions
- Cloudflare D1：全时段长期 QSO 档案
- `api.mzyyun.com`：只作为近一年公开数据同步来源，不是网站实时依赖
- QSL 图片与卡面：继续留在独立的 `BA4THG-QSL` 仓库，不放到本项目

## 页面

- `/`：公开全时段 QSO 日志
- `/admin.html`：私有录入、编辑、导入、浏览器同步、备份导出

## 数据原则

1. D1 永久保存已归档记录，不因上游 API 超过一年后不再返回而删除。
2. 上游同步以 `source + source_id` 建立来源映射，并用 QSO 指纹去重。
3. 网页查询只读 D1，不会因为访客查询而调用上游 API。
4. 历史记录可通过 ADIF / CSV / JSON 或网页手动补录。
5. 定期导出 ADIF 和 JSON 到 Cloudflare 账户以外的位置。

部署与 D1 初始化见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。
