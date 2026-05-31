# 基金模拟投资助手 (webfund)

模拟基金持仓、实时估值、自定义策略与历史回测的个人工具。数据保存在浏览器本地，支持
Base64 字符串导入/导出，可部署在 Cloudflare Pages & Workers。

> 本工具数据来自公开网络、估值为非官方推算，仅供学习与模拟参考，**不构成任何投资建议**。

## 功能

1. 模拟持仓操作（买入/卖出/转换/分红，遵循场外基金标准交易规则）
2. 多持仓集合管理，支持 Base64 导入/导出
3. 持仓实时估值，多数据源切换与对比（天天基金 / 蛋卷 / 自建公开持仓估算）
4. 自定义买卖策略 + 策略集 + 基于历史数据的区间回测
5. 策略集 Base64 导入/导出
6. 个人数据保存在浏览器 localStorage（存储层已抽象，预留微信小程序适配）

## 策略速查表

内置 11 种买卖策略，可组合成策略集并回测。买入端与卖出端均支持智能调整。

| 策略 | 类型 | 触发逻辑 | 关键参数 | 适用场景 |
|------|------|----------|----------|----------|
| 底仓 | 买入 | 首个交易日一次性建仓，之后不操作 | 建仓金额 | 打底后再配合定投/网格加仓 |
| 定投 | 买入 | 每周/每月固定日定额买入 | 周期、执行日、金额 | 纪律化分批建仓，平滑成本 |
| 智能定投·涨跌幅 | 买入 | 定投基础上，按近 N 日涨跌幅调整投入：越跌投越多 | 基准金额、参考窗口、每档幅度/调整比例、倍数上下限 | 增强定投，低位多买 |
| 智能定投·均线 | 买入 | 按当前净值相对均线的偏离调整投入：低于均线投越多 | 基准金额、均线窗口、每档幅度/调整比例、倍数上下限 | 用均线判断高低位的增强定投 |
| 目标市值法 | 买入/卖出 | 持仓市值贴近匀速增长的目标路径：低于目标补买、高于目标减仓 | 每期目标市值增长、单期最大买入、是否高位卖出 | 学术上最优的定投变体，自动低买高卖 |
| 阈值买入 | 买入 | 近 N 日跌幅达阈值时买入固定金额 | 跌幅阈值、观察窗口、买入金额 | 抄底/越跌越买 |
| 阈值卖出 | 卖出 | 近 N 日涨幅达阈值时卖出固定金额 | 涨幅阈值、观察窗口、卖出金额 | 高位逐步兑现 |
| 止盈 | 卖出 | 持仓收益率达标时按比例卖出 | 止盈收益率、卖出比例 | 一次性止盈 |
| 智能止盈 | 卖出 | 收益越高卖得越多，分档加码减仓 | 起始收益率、每档间隔、每档卖出比例、卖出上限 | 牛市途中渐进式止盈 |
| 止损 | 卖出 | 持仓收益率跌破阈值时按比例卖出 | 止损跌幅、卖出比例 | 控制下行风险 |
| 网格 | 买入/卖出 | 净值区间分档，下穿买入、上穿卖出 | 上下界、网格层数、每格金额 | 震荡行情高抛低吸 |

> 策略可在「策略」页组合成策略集，在「回测」页选区间回测，并支持多策略集横向对比。

## 架构

pnpm monorepo，分层解耦，核心逻辑平台无关（为微信小程序演进预留）：

```
packages/
├── core/      @fund/core   平台无关核心库（领域模型/交易引擎/估值聚合/策略回测/序列化/存储接口）
├── web/       @fund/web    React + Vite + TS 前端（部署 Cloudflare Pages）
└── workers/   @fund/workers Cloudflare Workers 数据代理与计算服务
```

详见 `AICodingDoc/基金模拟投资助手需求/` 下的需求分析、技术方案、任务拆解文档。

## 技术栈

- 前端：React 18 + Vite + TypeScript + React Router + Zustand + Ant Design + ECharts
- 核心库：纯 TypeScript（零 DOM/网络依赖），Vitest 测试
- 边缘服务：Cloudflare Workers + Hono
- 工程：pnpm workspace

## 开发

前置：Node >= 20，pnpm >= 11。

```bash
pnpm install

# 终端 1：启动 Workers（本地 http://localhost:8787）
pnpm dev:workers

# 终端 2：启动前端（http://localhost:5173，/api 自动代理到 Workers）
pnpm dev:web
```

打开 http://localhost:5173 ，首页会显示核心库版本与 Workers 连接状态。

## 构建与校验

```bash
pnpm build         # 构建 core + web
pnpm test          # 运行所有测试
pnpm typecheck     # 全量类型检查
pnpm lint          # ESLint
```

## 部署

### 前端（Cloudflare Pages）
- 构建命令：`pnpm install && pnpm --filter @fund/core build && pnpm --filter @fund/web build`
- 输出目录：`packages/web/dist`
- 环境变量：`VITE_API_BASE` 指向 Workers 对外地址（如 `https://fund-workers.<account>.workers.dev/api`）。
  不设置时默认走同源 `/api`（需在 Pages 侧把 `/api/*` 路由到 Workers，或用自定义域）。
- SPA 路由：`public/_redirects` 已配置 `/* /index.html 200`。

### 边缘服务（Cloudflare Workers）
```bash
pnpm --filter @fund/workers deploy   # 等价 wrangler deploy
```
部署前在 `packages/workers/wrangler.toml`：
- 设置 `ALLOWED_ORIGINS` 为 Pages 域名（逗号分隔多个），用于 CORS 白名单。
- 如需跨实例缓存，取消注释 `[[kv_namespaces]]` 并填入 `wrangler kv namespace create FUND_CACHE` 得到的 id。
  未绑定 KV 时退化为进程内缓存（单实例有效，仍可用）。

## 数据来源说明

所有数据均来自**公开网络接口**，非官方授权，仅供学习参考：
- **天天基金（东方财富）**：盘中实时估值、历史净值、基金信息、公开持仓（季报重仓股）。
- **蛋卷基金（雪球）**：最近确认净值（其盘中估值接口需登录，故作为对比/容灾源）。
- **腾讯行情**：个股实时行情（用于自建估值加权计算）。
- **交易日历**：内置 2023–2026 A股节假日/补班静态数据，超出范围退化为周末规则。

自建估值算法：基于基金公开持仓（季报披露重仓股）按权重加权个股实时涨跌幅，未覆盖仓位
（重仓股之外）按沪深300 指数补全，输出覆盖率 `confidence` 供参考。因持仓季度披露存在滞后，
该估值有固有误差。

## 微信小程序演进预留

核心库 `@fund/core` 为纯 TypeScript、零 DOM/网络依赖，可直接被小程序复用。接入小程序时：
1. **存储**：实现 `StorageAdapter` 接口的 `WxStorageAdapter`（用 `wx.getStorageSync` 等），
   替换 Web 的 `LocalStorageAdapter`。
2. **网络**：估值/历史/持仓数据统一走 Workers REST 接口，小程序用 `wx.request` 复用同一套 API。
3. **UI**：重新实现页面层（小程序原生组件），业务逻辑（交易引擎、回测、序列化）全部复用核心库。
4. **回测**：小程序无 Web Worker，可直接在主线程调用 `runBacktest`（数据量大时分片）。

## 目录约定（localStorage 键）

```
fund.portfolios.index     持仓集合 id 列表
fund.portfolio.<id>       单个持仓集合
fund.strategySets.index   策略集 id 列表
fund.strategySet.<id>     单个策略集
fund.settings             数据源偏好/刷新设置
```

## 测试

核心库与 Workers 均有单元测试覆盖（交易引擎、序列化、策略回测、数据源解析等）：
```bash
pnpm test            # 全部
pnpm test:core       # 仅核心库
```
