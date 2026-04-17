import * as dotenv from "dotenv";
dotenv.config();

import { analyzeRisk } from "./agent/analyzer";
import { checkAndAlert } from "./agent/alerter";
import { createLLMBackend } from "./agent/llm/factory";
import { DecisionLog, RiskLevel } from "./agent/types";
import { buildSessionSummary } from "./agent/sessionSummary";
import { generateHistoricalQuotes, RISK_THRESHOLDS } from "./data/fxSimulator";
import { generateRealHistoricalQuotes } from "./data/fxRealData";
import { ZgStorageClient } from "./storage/zgStorage";
import { RiskOracleClient } from "./chain/riskOracle";
import { RiskOracleV2Client } from "./chain/riskOracleV2";
import { AgentRegistryClient } from "./chain/agentRegistry";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const AGENT_ID = "fx-risk-agent-v0.2";

// CLI参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  let pair: string | undefined;
  let scenario: "normal" | "volatile" | "crisis" | "real" | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pair" && args[i + 1]) pair = args[++i];
    if (args[i] === "--scenario" && args[i + 1]) scenario = args[++i] as any;
  }

  return { pair, scenario };
}

interface AlertResult {
  pair: string;
  level: string;
  rate: string;
  confidence: string;
  rootHash: string;
  txHash: string;
}

/**
 * FX Risk Agent V2 主流程
 *
 * 1. 生成/获取FX行情数据
 * 2. AI分析风险（工厂选择豆包 or 0G Compute 后端）
 * 3. 决策日志上传 0G Storage
 * 4. 风险事件上链 0G Chain V2（带 agentTokenId + aiBackend）
 * 5. 会话结束：上传会话摘要 + 调用 INFT.updateAgentState
 */
async function runAgent() {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
  const oracleV1Address = process.env.FX_RISK_ORACLE_ADDRESS;
  const oracleV2Address = process.env.FX_RISK_ORACLE_V2_ADDRESS;
  const agentInftAddress = process.env.AGENT_INFT_ADDRESS;
  const agentTokenIdRaw = process.env.AGENT_TOKEN_ID;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY not set in .env");
  }

  // 初始化 LLM 后端（通过工厂根据 AI_BACKEND 选择）
  const llmBackend = createLLMBackend();
  const modelName = llmBackend.label;

  // 初始化客户端
  const storageClient = new ZgStorageClient(privateKey);

  // V2 优先，V1 兼容（老流程还能跑）
  const useV2 = Boolean(oracleV2Address && agentInftAddress && agentTokenIdRaw);

  // 解析 agentTokenId 为 bigint（uint256 全量精度），未设置时 undefined；设置非法值立即报错
  // 只在 V2 模式下实际使用；V1 模式 undefined 即可
  const agentTokenId: bigint | undefined = (() => {
    if (agentTokenIdRaw === undefined || agentTokenIdRaw === "") return undefined;
    if (!/^\d+$/.test(agentTokenIdRaw)) {
      throw new Error(
        `Invalid AGENT_TOKEN_ID: "${agentTokenIdRaw}" (must be a non-negative integer string)`
      );
    }
    return BigInt(agentTokenIdRaw);
  })();

  const oracleV2Client = useV2
    ? new RiskOracleV2Client(oracleV2Address!, privateKey, rpcUrl)
    : null;
  const oracleV1Client = !useV2 && oracleV1Address
    ? new RiskOracleClient(oracleV1Address, privateKey, rpcUrl)
    : null;
  const agentRegistry = useV2
    ? new AgentRegistryClient(agentInftAddress!, privateKey, rpcUrl)
    : null;

  // V2 模式下断言 Agent 所有权
  if (useV2 && agentRegistry && agentTokenId !== undefined) {
    try {
      await agentRegistry.assertOwnership(agentTokenId);
    } catch (err: any) {
      console.error(`[Agent] Ownership check failed: ${err.message}`);
      throw err;
    }
  }

  const sessionId = randomUUID();

  console.log("=".repeat(60));
  console.log("  FX Risk Agent - Verifiable AI Decisions on 0G Network");
  console.log("=".repeat(60));
  console.log(`  Backend   : ${llmBackend.kind}`);
  console.log(`  Model     : ${modelName}`);
  console.log(`  Chain     : 0G Galileo (ID: 16602)`);
  console.log(`  Wallet    : ${storageClient.getSignerAddress()}`);
  if (useV2) {
    console.log(`  Agent ID  : #${agentTokenId!.toString()} (${agentInftAddress!.slice(0, 10)}...)`);
    console.log(`  Oracle V2 : ${oracleV2Address}`);
  } else {
    console.log(`  Oracle V1 : ${oracleV1Address ?? "(not configured)"}`);
    console.log(`  [Note] Running in V1 mode. Set AGENT_INFT_ADDRESS + AGENT_TOKEN_ID + FX_RISK_ORACLE_V2_ADDRESS to enable V2.`);
  }
  console.log(`  Session   : ${sessionId}`);

  // 解析CLI参数
  const cliArgs = parseArgs();

  // 确定要分析的货币对
  const allPairs = Object.keys(RISK_THRESHOLDS);
  const pairs = cliArgs.pair ? [cliArgs.pair] : allPairs;
  console.log(`  Pairs     : ${pairs.join(", ")}`);
  if (cliArgs.scenario) {
    console.log(`  Scenario  : ${cliArgs.scenario} (fixed)`);
  }
  console.log("=".repeat(60));

  const results: AlertResult[] = [];
  const decisionLogRootHashes: string[] = [];

  for (const pair of pairs) {
    if (!RISK_THRESHOLDS[pair]) {
      console.error(`[Error] Unknown currency pair: ${pair}`);
      continue;
    }

    console.log(`\n${"─".repeat(50)}`);
    console.log(`  ${pair}`);
    console.log(`${"─".repeat(50)}`);

    try {
      // Step 1: 获取行情数据
      // real 场景走三层 fallback 真实数据源（L1 fawazahmed0 → L2 frankfurter → L3 local cache）
      // 其他场景保留 simulator，用于 crisis 压力测试/demo 极端情境
      const scenarios = ["normal", "normal", "volatile", "crisis"] as const;
      const scenario = cliArgs.scenario || scenarios[Math.floor(Math.random() * scenarios.length)];
      console.log(`[Data] ${scenario} scenario, 20 data points`);

      let quotes;
      if (scenario === "real") {
        const realResult = await generateRealHistoricalQuotes(pair, 20, 60_000);
        quotes = realResult.quotes;
        const ageNote = realResult.cacheAgeHours !== undefined
          ? ` (cache age: ${realResult.cacheAgeHours.toFixed(1)}h)`
          : "";
        console.log(`[Data] Real source: ${realResult.source}${ageNote}`);
      } else {
        quotes = generateHistoricalQuotes(pair, 20, 60_000, scenario);
      }
      const latestRate = quotes[quotes.length - 1].mid;
      console.log(`[Data] Latest rate: ${latestRate}`);

      // Step 2: AI分析风险
      console.log(`[AI] Analyzing via ${llmBackend.kind}...`);
      const assessment = await analyzeRisk(quotes, RISK_THRESHOLDS[pair], llmBackend);

      const levelLabel = RiskLevel[assessment.level];
      console.log(`[AI] ${levelLabel} (confidence: ${(assessment.confidence * 100).toFixed(0)}%)`);
      console.log(`[AI] ${assessment.reasoning}`);

      // Step 3: HIGH/CRITICAL 触发告警通知
      await checkAndAlert(assessment);

      // Step 4: 构建决策日志
      // 优先用 actualBackend（反映实际产生响应的后端），未设置则退回 llmBackend.kind
      const effectiveBackend = assessment.actualBackend ?? llmBackend.kind;
      if (assessment.fallbackReason) {
        console.warn(`[AI] Fallback to ${effectiveBackend}: ${assessment.fallbackReason}`);
      }
      const decisionLog: DecisionLog = {
        agentId: AGENT_ID,
        sessionId,
        assessment,
        modelUsed: modelName,
        promptTokens: assessment.usage?.promptTokens ?? 0,
        completionTokens: assessment.usage?.completionTokens ?? 0,
        createdAt: new Date().toISOString(),
        aiBackend: effectiveBackend,
        inferenceVerification: assessment.verification,
        ...(assessment.fallbackReason && { fallbackReason: assessment.fallbackReason }),
        ...(useV2 && {
          agentTokenId,
          agentContract: agentInftAddress,
        }),
      };

      // Step 5: 上传到0G Storage
      console.log("[0G] Uploading decision log to Storage...");
      const rootHash = await storageClient.uploadDecisionLog(decisionLog);
      decisionLog.storageRootHash = rootHash;
      decisionLogRootHashes.push(rootHash);
      console.log(`[0G] Stored: ${rootHash.slice(0, 18)}...`);

      // Step 5b: 同步镜像到 frontend/data/，供 Dashboard Modal 展示
      // 权威源仍在 0G Storage（rootHash 链上可验），此文件是展示副本
      // BigInt 不能被 JSON.stringify 原生序列化，用 replacer 统一转 string
      try {
        const mirrorDir = join(process.cwd(), "frontend", "data");
        mkdirSync(mirrorDir, { recursive: true });
        writeFileSync(
          join(mirrorDir, `${rootHash}.json`),
          JSON.stringify(decisionLog, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
        );
      } catch (mirrorErr: any) {
        console.warn(`[Mirror] Skipped local mirror: ${mirrorErr.message}`);
      }

      // Step 6: 上链
      let txHash = "-";
      if (oracleV2Client && agentTokenId !== undefined) {
        console.log("[0G] Recording alert on-chain (V2)...");
        txHash = await oracleV2Client.submitAlert(
          pair,
          assessment.level,
          assessment.spotRate,
          assessment.threshold,
          rootHash,
          agentTokenId,
          effectiveBackend
        );
      } else if (oracleV1Client) {
        console.log("[0G] Recording alert on-chain (V1)...");
        txHash = await oracleV1Client.submitAlert(
          pair,
          assessment.level,
          assessment.spotRate,
          assessment.threshold,
          rootHash
        );
      }
      decisionLog.txHash = txHash;
      if (txHash !== "-") {
        console.log(`[0G] Tx: ${txHash.slice(0, 18)}...`);
      }

      results.push({
        pair,
        level: levelLabel,
        rate: latestRate.toFixed(4),
        confidence: `${(assessment.confidence * 100).toFixed(0)}%`,
        rootHash: rootHash.slice(0, 18) + "...",
        txHash: txHash === "-" ? "-" : txHash.slice(0, 18) + "...",
      });

    } catch (error: any) {
      console.error(`[Error] ${pair}: ${error.message}`);
      results.push({
        pair,
        level: "ERROR",
        rate: "-",
        confidence: "-",
        rootHash: "-",
        txHash: "-",
      });
    }
  }

  // 输出汇总表格
  console.log(`\n${"=".repeat(60)}`);
  console.log("  SUMMARY");
  console.log(`${"=".repeat(60)}`);
  console.log("  Pair      | Level    | Rate       | Conf | Storage Hash");
  console.log("  " + "─".repeat(56));
  for (const r of results) {
    const pairPad = r.pair.padEnd(9);
    const levelPad = r.level.padEnd(8);
    const ratePad = r.rate.padEnd(10);
    const confPad = r.confidence.padEnd(4);
    console.log(`  ${pairPad} | ${levelPad} | ${ratePad} | ${confPad} | ${r.rootHash}`);
  }
  console.log(`${"=".repeat(60)}`);

  // Step 7: 会话结束后更新 Agent 状态（V2 模式）
  if (useV2 && agentRegistry && agentTokenId !== undefined && decisionLogRootHashes.length > 0) {
    try {
      console.log(`\n[Agent] Updating agent state on-chain...`);
      const summary = buildSessionSummary({
        agentId: AGENT_ID,
        agentTokenId,
        sessionId,
        aiBackend: llmBackend.kind,
        processedPairs: pairs,
        decisionLogRootHashes,
      });
      const summaryRootHash = await storageClient.uploadJson(summary);
      console.log(`[Agent] Session summary: ${summaryRootHash.slice(0, 18)}...`);

      const stateTxHash = await agentRegistry.updateAgentState(agentTokenId, summaryRootHash);
      console.log(`[Agent] State updated: ${stateTxHash}`);

      const newCount = await agentRegistry.inferenceCount(agentTokenId);
      console.log(`[Agent] Total inferences: ${newCount.toString()}`);
    } catch (err: any) {
      console.warn(`[Agent] Failed to update state (non-fatal): ${err.message}`);
    }
  }

  // 输出链上总量
  if (oracleV2Client) {
    const count = await oracleV2Client.getAlertCount();
    console.log(`\n  V2 Alerts: ${count} | Contract: ${oracleV2Address}`);
  }
  if (oracleV1Client || oracleV1Address) {
    try {
      const v1Client = oracleV1Client || new RiskOracleClient(oracleV1Address!, privateKey, rpcUrl);
      const countV1 = await v1Client.getAlertCount();
      console.log(`  V1 Alerts: ${countV1} | Contract: ${oracleV1Address}`);
    } catch {}
  }
  console.log(`  Explorer  : https://chainscan-galileo.0g.ai/address/${oracleV2Address ?? oracleV1Address}`);

  console.log(`\n  Session complete.\n`);
}

runAgent().catch(console.error);
