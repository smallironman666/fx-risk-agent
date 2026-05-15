# FX Risk Agent — 5 分钟 Workshop Demo 流程

> 场合：0G APAC Builder Workshop 直播
> 受众：Web3 builder 社区
> 时长：~5 分钟

---

## 开场前准备（上台前确认）

```
□ Dashboard 加载正常，V2 告警列表可见
    → https://smallironman666.github.io/fx-risk-agent/

□ CRITICAL USD/JPY 告警 → 点 "View AI Decision" → JSON 弹窗正常

□ Chainscan 合约页提前开好（Read Contract 标签打开）
    → https://chainscan-galileo.0g.ai/address/0x2abde2687923ffb9a5be4c6df3aac68a4f0a93ca?tab=read-contract

□ 关闭微信 / 钉钉 / Discord 通知

□ 水在旁边，深呼吸 3 次（4-7-8 法）
```

---

## 0:00 — 0:40 开场 + 问题

> "大家好我是 Small，5 年经验传统金融跨境支付后端，做过 SWIFT、FIX 协议换汇、支付风控，多币种清结算。
>
> 今天分享的项目解决一个我在真实工作里碰到的问题——
>
> 换汇公司的报价引擎，在给客户锁汇率之前，需要知道当前这个汇率到底安不安全。AI 可以判断，但 AI 的判断过程是黑箱——事后审计来问"那一刻 AI 知道什么"，答不上来。
>
> **FX Risk Agent 就是解这个：把 AI 的每一次风险判断，做成不可篡改的链上凭证。**"

---

## 0:40 — 1:20 架构（一句话带过）

**【屏幕切到 Dashboard 或 README 架构图（https://github.com/smallironman666/fx-risk-agent/blob/main/README.zh-CN.md ） 】**
→ https://smallironman666.github.io/fx-risk-agent/

> "架构很简单，四个组件：
>
> AI 分析完 → 推理全文写入 **0G Storage**，拿到 rootHash
> rootHash 上链到 **FXRiskOracleV2 合约**
> 推理跑在 **0G Compute** 的 TEE 飞地里，有硬件签名
> Agent 本身是枚 **INFT**，每次推理它都在链上"变老"
>
> 换汇系统在给客户报价前，查一下合约——CRITICAL 就拒绝锁价，LOW 就正常出价。**决策留证，不可篡改。**"

---

## 1:20 — 3:40 Live Demo（重头戏）

### 步骤 1 · 打开 Dashboard（30 秒）

**【保持在 Dashboard 页面】**
→ https://smallironman666.github.io/fx-risk-agent/

> "这是 Live Dashboard，直接从 0G Storage 拉数据，没有后端、没有中间人。
>
> 左边是 Agent Token #0 的身份，右边是链上 Alert 时间线，现在有 8 条 V2 告警。"

---

### 步骤 2 · 点开 CRITICAL 告警（40 秒）

**【点击 USD/JPY CRITICAL 那条告警的 "View AI Decision"】**

> "这条 USD/JPY **CRITICAL**，汇率 173，这是近 40 年来从未出现过的极端价位，AI 置信度 95%。
>
> 点 View AI Decision——"
>
> **【弹出 DecisionLog JSON】**
>
> "你看到的这个 JSON——模型用了什么、推理是什么、置信度多少——这不是我说的，这是从 **0G Storage 直接拉下来的原始字节**。任何人都能自己验证。"

---  

### 步骤 3 · rootHash 跳链上（30 秒）

**【点 rootHash 链接，跳转 0G Storage Indexer】**
→ `https://indexer-storage-testnet-turbo.0g.ai/file?root=0xe79eb1df00f7e9618fcda651d77150ae9235abaed6f5f88b719d26e5d106e5b2`

> "这个 rootHash，点一下——这就是那份 JSON 的 Merkle 承诺。
>
> 任何人自己 `curl` 这个 URL，拿到的字节跟 hash 对得上，就证明没被篡改。**不用信任我，验证就够了。**"

---

### 步骤 4 · 链上合约查询（40 秒）

**【切到 Chainscan → FXRiskOracleV2 → Read Contract → latestRiskLevel】**
→ https://chainscan-galileo.0g.ai/address/0x2abde2687923ffb9a5be4c6df3aac68a4f0a93ca?tab=read-contract

> "最后看一下链上合约。这是 `latestRiskLevel`，输入 `USD/JPY`——"
>
> **【Query，返回 3】**
>
> "返回 `3` = CRITICAL。这个值是换汇系统直接读的——报价引擎调这个合约，返回 CRITICAL 就拒绝给客户锁价。**不是通知，是前置门禁。**
>
> 每一条 Alert 都有对应的链上 tx，永远查得到。这才是换汇系统敢消费这个 Oracle 数据的基础——不是信任我，是验证链上记录。"

---

## 3:40 — 4:30 意义延展

> "为什么用 0G 而不是其他链？
>
> Storage、Chain、Compute、INFT——这四个原语我同时需要。别的方案得把 IPFS + 以太坊 + 外挂 LLM + NFT 标准拼在一起，四套账单四套可用性。**0G 一个栈全给了，Solo 两周交付。**
>
> 更重要的一点——这个 Agent 本身是链上资产。它做过的 8 次推理，都挂在 Token #0 的历史上。
>
> INFT 现在最直接的作用是访问控制——只有持有它的钱包才能代表这个 Agent 说话，防止任何人伪造 AI 决策。
>
> 长期看，它让 Agent 的合规历史可以随业务转让而转让——支付公司被并购时，新东家直接继承 Token #0，链上所有历史决策可追溯。**这是合规交接的 clean handover，不是交易品。**"

**【INFT 合约地址（备用，可展示）】**
→ https://chainscan-galileo.0g.ai/address/0xAA540f42f0d20588f183E3B92B3b617991fa22D1

---

## 4:30 — 5:00 CTA

> "三个链接：
>
> - GitHub → github.com/smallironman666/fx-risk-agent
> - Live Dashboard → smallironman666.github.io/fx-risk-agent
> - Demo 视频 → youtu.be/j2eaoJN18a8
>
> 如果你在做 PayFi、DeFi 稳定币、或者传统跨境支付 on-chain 的方向，欢迎来找我——这个交叉点上的 builder 太少了。
>
> **谢谢！**"

---

## 核心叙事（随时脑补）

> FX Risk Agent 不是拦截交易的系统——它是换汇系统报价引擎的**上游 Oracle**，提供可验证的风险情报，让换汇系统自己做有据可查的决策。

---

## FX Risk Agent 在整体系统中的角色定位

### 传统金融（TradFi）：不可篡改的 AI 决策审计层

```
客户下单换汇
    ↓
换汇系统报价引擎 ──查询──→ FXRiskOracleV2.latestRiskLevel("USD/JPY")
    ↓                              ↑
CRITICAL → 拒绝锁价          FX Risk Agent 持续写入
LOW     → 正常出价
    ↓
事后合规审计 ──→ 链上 tx + 0G Storage DecisionLog
               永久可查，不可篡改
```

**解决的核心问题**：监管/审计团队半年后来问"那一刻 AI 到底知道什么、判断了什么"——现在有链上凭证可以回答。

**不做的事**：FX Risk Agent 不拦截交易、不控制支付流程。它只提供可信情报，换汇系统自己做决策。

---

### Web3 / DeFi 金融：可组合的链上风险预言机

```
DeFi 稳定币跨境支付协议
    ↓
智能合约执行前 ──调用──→ FXRiskOracleV2.latestRiskLevel("USD/JPY")
    ↓
CRITICAL → revert，拒绝本次跨链结算
LOW      → 正常执行链上转账
```

**与 Chainlink 的差异**：
- Chainlink 提供的是**价格数据**（USD/JPY 现在是多少）
- FX Risk Agent 提供的是**风险判断**（这个价格现在安不安全，以及 AI 为什么这么认为）
- 两者互补：Chainlink 是数据层，FX Risk Agent 是风险智能层

**可组合性**：任何链上合约都可以 `IERC20` 同款方式直接调用 `FXRiskOracleV2`，无需信任中间方。

---

### 一句话总结两个角色

| 场景 | 角色 | 核心价值 |
|------|------|----------|
| **传统金融** | AI 决策审计基础设施 | 每一次风控判断都有不可篡改的链上凭证，合规可追溯 |
| **Web3 / DeFi** | 可验证风险预言机 | 链上合约可直接消费、无需信任、AI 推理过程公开可验证 |

---

## 3 个金句（慢下来讲）

1. **"AI 做决策"和"AI 决策可审计"，是完全不同的两件事**
2. **不用信任我，验证就够了**
3. **转让 INFT 就转让了完整的审计轨迹——记忆本身是资产**

---

## 忘词应急

| 情况 | 处理 |
|------|------|
| Dashboard 卡了 | "网络小问题，咱们先看下 GitHub README" |
| 忘了下一句 | 喝口水，接"刚才说到…" |
| 被问到不懂的问题 | "好问题，直播后群里详细回你" |
| 时间超了 | 跳过步骤 4（合约查询），直接进意义延展 |

---

## 链接速查

| 资源 | 链接 |
|------|------|
| Live Dashboard | https://smallironman666.github.io/fx-risk-agent/ |
| GitHub | https://github.com/smallironman666/fx-risk-agent |
| Demo 视频 | https://youtu.be/j2eaoJN18a8 |
| FXRiskOracleV2 合约 | https://chainscan-galileo.0g.ai/address/0x2abde2687923ffb9a5be4c6df3aac68a4f0a93ca |
| FXRiskAgentINFT 合约 | https://chainscan-galileo.0g.ai/address/0xAA540f42f0d20588f183E3B92B3b617991fa22D1 |
| CRITICAL Alert Storage | https://indexer-storage-testnet-turbo.0g.ai/file?root=0xe79eb1df00f7e9618fcda651d77150ae9235abaed6f5f88b719d26e5d106e5b2 |
