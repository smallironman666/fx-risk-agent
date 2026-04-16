# 从 SWIFT 到智能合约：在 0G 上构建可验证 AI 风控基础设施

> 为跨境支付构建第一条完整链上 AI 决策轨迹的两周实践 —— 以及 "Memory as Asset" 叙事为什么在真实生产环境下真的成立。

---

## 没人愿意谈的真问题

跨境支付公司每天处理数十亿美元的外汇交易。从下单到结算的 T+0 到 T+2 窗口期内，汇率在剧烈波动。一笔 ¥1000 万汇款仅 3 个 pip 的偏移，就是 23000 美元的利润蒸发。

现代 Treasury 团队会部署 AI 模型去盯这个窗口。这部分不新鲜。真正新的，是我在跨境支付基础设施做了几年后开始问自己的问题：

**审计团队半年后找上门问："14:32:06 这一刻，你们的 AI 到底知道什么？" —— 你答得出来吗？**

绝大多数情况下：**答不出来。**

推理过程躺在 OpenAI 服务器上。推荐方案是某个同事在 Slack 里发的截图。置信度分数写在 90 天前已经滚掉的日志文件里。Prompt 从那之后又打了三次补丁。如果 AI 当时错了，你无法证明它"相信"了什么。如果它当时是对的，你也无法证明是 AI 的功劳，而不是运气好。

这就是所有"AI + 金融"商业 pitch 里选择性跳过的审计问题。**"AI 做决策"** 和 **"AI 决策可审计"** 之间隔着一条鸿沟 —— 合规、信任、资本配置全在这条鸿沟里掉下去。

## "可验证 AI" 到底是什么意思

Web3 的标准答案是"把 AI 放到链上"。这句话通常意味着三种路线之一：

1. **链上推理** —— 直接在智能合约里跑模型。可爱，但不 scale，gas 贵，大多数有用的模型塞不进去。
2. **Oracle 喂数据** —— 链下 AI 计算，Oracle 签名，签名后的结果上链。更好一点，但你现在在信任 Oracle 运营者没有撒谎。
3. **ZK 证明推理** —— 证明计算正确执行。优雅，但当今 SOTA 只能证明玩具级规模的小模型。

这三条路都没回答真正的审计问题。它们证明 AI **做了**什么，但没证明 AI **想了**什么。

我憋了一个周末的白板后，收敛出的答案：

**可验证性不在于"计算"本身，而在于"推理过程"的可溯源。**

你不需要重跑 AI。你需要在决策的那一刻，对完整决策工件 —— prompt、模型元数据、推理链条、置信度、推荐方案、源数据快照 —— 进行密码学承诺。然后确保：任何第三方，几个月后，都能取回那份完整的工件，并验证它没被篡改。

这就是 FX Risk Agent 的架构底座。

## 四个 0G 组件，每个各司其职

我花了一段时间才真正 appreciate 0G 栈的意义 —— 它是**第一个 L1，四个构建可验证 AI 必需的原语都在同一条链上**：

### 1. 0G Storage —— 推理档案馆

每次 Agent 跑一次分析，都会产出一份 `DecisionLog` JSON，包含：
- 货币对、即期汇率、突破阈值
- 完整的 AI 推理过程（数段自然语言）
- 推荐方案、置信度分数、风险等级
- prompt / completion token 用量
- 模型标识、AI 后端、可选的 TEE 验证凭证
- Session ID、Agent ID、时间戳

这份 JSON 上传到 0G Storage。上传完产生一个 **rootHash** —— 对每个字节的 Merkle 承诺。这个 rootHash 是在其他所有地方被记录的凭证。

这件事比听起来重要。rootHash 是**那一刻那份 AI 推理**的唯一指纹。改推理字段里一个逗号，rootHash 就变了。任何人之后用 rootHash 取回的，都是 AI 当时产生的完全相同的字节。

### 2. 0G Chain —— 风险告警注册表

在 0G Storage 之上，我部署了 `FXRiskOracleV2` Solidity 合约，每条风险告警作为链上事件记录：
- 货币对、风险等级、即期汇率、阈值
- Storage rootHash（链回完整推理）
- 产生告警的 `agentTokenId`
- `aiBackend` 标识

关键设计：`submitAlert` 有访问控制 —— **只有对应 INFT 的持有者**才能以该 Agent 的身份提交告警。这关闭了最常见的冒充攻击面：任何人都能读公开合约，但只有合法 Agent 身份能写。

### 3. 0G Compute —— 可验证推理层

AI 本身用的是**双后端模式**。生产路径：0G Compute（Qwen 2.5 7B 跑在 TEE 认证的 provider 上，通过 `@0glabs/0g-serving-broker` 调用）。Fallback 路径：火山方舟的 Doubao 模型。两者都实现同一个 `LLMBackend` 接口，wrapper 负责切换。

0G Compute 返回响应时，带着 TEE attestation —— provider 用硬件签名声明：这个响应是由声称的模型，在安全飞地里，用给定输入产生的。这份 attestation 被嵌进上传到 0G Storage 的 DecisionLog JSON。任何人下载 decision log 都能独立验证 TEE 签名。

TEE 路径失败时，我们静默 fallback 到 Doubao，并**把 fallback 原因直接记入 DecisionLog**。链上的 `aiBackend` 字段告诉你实际是哪个后端产生了结果。黑箱里没有鬼。

### 4. Agent ID（INFT，ERC-7857 启发）—— 可问责实体

这块让整套架构咔嗒一声对齐的关键：**AI Agent 本身就是一个链上被拥有的、可问责的代币化实体**。

`FXRiskAgentINFT` 是扩展了 ERC-7857 草案灵感的 ERC-721：每个 token 有 `storageRootHash` 指向 Agent 元数据、`creator`、`createdAt`，以及一个动态更新的 `inferenceCount`。每次 Agent 跑完，`updateAgentState()` 递增 `inferenceCount` 并把 storageRootHash 更新为新的 session summary 工件。

三个推论：

- **Agent 有可证明的历史**。Token #0 做过 N 次推理。每次推理的 rootHash 可以通过合约事件查到。
- **所有权可转移**。如果我卖/转让这枚 INFT，新主人继承这个 Agent 的完整审计轨迹 —— 记忆**就是**资产。
- **访问控制有干净的根**。Oracle 的"谁能代表 Agent #0 说话？"问题变成了 `INFT.ownerOf(0) == msg.sender`。丢了 INFT，就丢了以该 Agent 身份说话的权利。

四个组件合起来形成闭环：**Storage 存真相，Chain 存指针，Compute 产生可验证推理，INFT 锚定可问责性。**

## 真正去中心化的 Dashboard

大多数 Web3 Dashboard 是静态 HTML，读中心化 API，API 读中心化数据库。"Web3" 的部分纯粹是美学。

FX Risk Agent 的 Dashboard 是 GitHub Pages 上的一个静态 HTML。当你点任意一条告警的 "View AI Decision"，浏览器**直接从 0G 的 storage indexer 拉取 decision log JSON** —— 没有后端、没有中间人、没有 proxy。你在 modal 里看到的字节，就是我几天前上传的同一份字节，从 0G 的去中心化存储网络里服务出来，由链上同一个 rootHash 验证。

**Download Original** 按钮做同样的事，但把原始 JSON 给你下载。任何人可以自己跑 `curl https://indexer-storage-testnet-turbo.0g.ai/file?root=<hash>` 拿到完全相同的字节。这是当"公开、可验证"不再是营销口号时的真实样子。

老实说这里面也踩过坑。一开始我是在每次 agent 跑完后写本地镜像文件，然后 push 到 repo。能跑，但不够 Web3 —— Dashboard 读的是 GitHub，不是 0G。确认 0G indexer 的 `Access-Control-Allow-Origin: *` 后，我重写 Dashboard 直接 fetch。本地镜像保留做 graceful fallback，但主路径是纯粹的去中心化检索。

## 安全架构：最不起眼但最关键的部分

两个决策上不了 pitch slide，但正是它们让我愿意把这套东西带进生产：

**1. 信任边界两端都闭合。** 铸造 Agent INFT 要求 NFT 合约的 `onlyOwner`。提交告警要求持有 INFT。两端都不是 permissionless。想伪造"官方" AI 告警的攻击者，要么得攻破部署者私钥，要么得攻破 INFT 持有者 —— 没有 Oracle 旁路的横向攻击面，而这正是很多类似项目在显而易见的地方漏掉的。

**2. 状态变更路径都加了重入保护。** `mintAgent` 和 `updateAgentState` 都继承 OpenZeppelin 的 `ReentrancyGuard`。`mintAgent` 先写元数据再外调 `_safeMint`，避免恶意 `ERC721Receiver` 观察到写到一半的状态。这都是小而无聊的决策。它们也是"安全的智能合约"和"真实世界上线第一天所有告警同时响"之间的区别。

## 当下已经上线的部分

- **FXRiskOracleV2**：`0x2abde2687923ffb9a5be4c6df3aac68a4f0a93ca`
- **FXRiskAgentINFT**：`0xAA540f42f0d20588f183E3B92B3b617991fa22D1` —— Token #0 活跃
- **Live Dashboard**：[smallironman666.github.io/fx-risk-agent](https://smallironman666.github.io/fx-risk-agent/)
- **GitHub**：[github.com/smallironman666/fx-risk-agent](https://github.com/smallironman666/fx-risk-agent)

Dashboard 上每一条告警都是真实的 Agent run。每个 rootHash 都 resolve 到 0G Storage 上一份真实的 JSON。每个 `submitAlert` 交易都在 Chainscan 上可索引。自己独立验证，或者信我一次 —— 但重点正是：你**不必**信任任何人的话。

## 坦诚的部分

"Memory as Asset" 叙事会不会是下一个以太坊？我不知道。AI × Web3 赛道声量很大，0G 还很早。我能说的是，在栈里泡了两周后：**这是我试过的唯一一个，用它给真实金融决策做可验证 AI 感觉是"天然"而不是"拼凑"的基础设施。** 其他我考虑过的方案，都要把 IPFS 粘到通用 L2 上，中间还要塞个链下 signer。为这个 use case 准备好的链上原语，在其他地方根本不存在。

这会不会让 0G 成为这个周期 10 倍的资产？这是市场问题，我答不上来。这会不会让 0G 成为今天想出货一个生产级可验证 AI Agent 最明显的选择？这是工程问题，我的答案是：是。

## 下一步

- **主网迁移**到 0G Aristotle（Chain ID 16661）—— 等当前 Agent 状态从测试网毕业。
- **INFT metadata URI** —— 让钱包和浏览器能渲染 Agent #0 的完整 provenance。
- **Historical Replay 模式** —— 用归档的真实决策时间线做一个"危机前一周 Agent 在想什么"的演示。

如果你正在做跨境金融、Agent 所有权、或可验证 AI 的交叉领域 —— 请联系我。这个房间现在还很小，而这正是它重要的原因。

---

**FX Risk Agent** —— 面向跨境支付的可验证 AI 风控 Agent。
在 0G 上构建，Solo 交付，面向生产。

🔗 [Dashboard](https://smallironman666.github.io/fx-risk-agent/) · [GitHub](https://github.com/smallironman666/fx-risk-agent) · [Demo](https://youtu.be/j2eaoJN18a8)
🐦 [@0xSmallironman](https://x.com/0xSmallironman)
