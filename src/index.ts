import * as dotenv from "dotenv";
dotenv.config();

import { analyzeRisk } from "./agent/analyzer";
import { checkAndAlert } from "./agent/alerter";
import { DecisionLog, RiskLevel } from "./agent/types";
import { generateHistoricalQuotes, RISK_THRESHOLDS } from "./data/fxSimulator";
import { ZgStorageClient } from "./storage/zgStorage";
import { RiskOracleClient } from "./chain/riskOracle";
import { randomUUID } from "crypto";

const AGENT_ID = "fx-risk-agent-v0.1";

// CLI参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  let pair: string | undefined;
  let scenario: "normal" | "volatile" | "crisis" | undefined;

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
 * FX Risk Agent 主流程
 *
 * 1. 生成/获取FX行情数据
 * 2. AI分析风险（支持豆包/Claude/任意OpenAI兼容API）
 * 3. 决策日志上传0G Storage
 * 4. 风险事件上链0G Chain
 */
async function runAgent() {
  const modelName = process.env.AI_MODEL || "unknown";

  console.log("=".repeat(60));
  console.log("  FX Risk Agent - Verifiable AI Decisions on 0G Network");
  console.log("=".repeat(60));
  console.log(`  AI Model : ${modelName}`);
  console.log(`  Chain    : 0G Galileo (ID: 16602)`);

  const privateKey = process.env.PRIVATE_KEY;
  const contractAddress = process.env.FX_RISK_ORACLE_ADDRESS;
  const rpcUrl = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";

  if (!privateKey) {
    throw new Error("PRIVATE_KEY not set in .env");
  }

  // 初始化客户端
  const storageClient = new ZgStorageClient(privateKey);
  const oracleClient = contractAddress
    ? new RiskOracleClient(contractAddress, privateKey, rpcUrl)
    : null;

  const sessionId = randomUUID();
  console.log(`  Wallet   : ${storageClient.getSignerAddress()}`);
  console.log(`  Session  : ${sessionId}`);

  // 解析CLI参数
  const cliArgs = parseArgs();

  // 确定要分析的货币对
  const allPairs = Object.keys(RISK_THRESHOLDS);
  const pairs = cliArgs.pair ? [cliArgs.pair] : allPairs;
  console.log(`  Pairs    : ${pairs.join(", ")}`);
  if (cliArgs.scenario) {
    console.log(`  Scenario : ${cliArgs.scenario} (fixed)`);
  }
  console.log("=".repeat(60));

  const results: AlertResult[] = [];

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
      const scenarios = ["normal", "normal", "volatile", "crisis"] as const;
      const scenario = cliArgs.scenario || scenarios[Math.floor(Math.random() * scenarios.length)];
      console.log(`[Data] ${scenario} scenario, 20 data points`);

      const quotes = generateHistoricalQuotes(pair, 20, 60_000, scenario);
      const latestRate = quotes[quotes.length - 1].mid;
      console.log(`[Data] Latest rate: ${latestRate}`);

      // Step 2: AI分析风险
      console.log("[AI] Analyzing...");
      const assessment = await analyzeRisk(quotes, RISK_THRESHOLDS[pair]);

      const levelLabel = RiskLevel[assessment.level];
      console.log(`[AI] ${levelLabel} (confidence: ${(assessment.confidence * 100).toFixed(0)}%)`);
      console.log(`[AI] ${assessment.reasoning}`);

      // Step 3: HIGH/CRITICAL 触发告警通知
      await checkAndAlert(assessment);

      // Step 4: 构建决策日志
      const decisionLog: DecisionLog = {
        agentId: AGENT_ID,
        sessionId,
        assessment,
        modelUsed: modelName,
        promptTokens: 0,
        completionTokens: 0,
        createdAt: new Date().toISOString(),
      };

      // Step 5: 上传到0G Storage
      console.log("[0G] Uploading decision log to Storage...");
      const rootHash = await storageClient.uploadDecisionLog(decisionLog);
      decisionLog.storageRootHash = rootHash;
      console.log(`[0G] Stored: ${rootHash.slice(0, 18)}...`);

      // Step 6: 上链
      let txHash = "-";
      if (oracleClient) {
        console.log("[0G] Recording alert on-chain...");
        txHash = await oracleClient.submitAlert(
          pair,
          assessment.level,
          assessment.spotRate,
          assessment.threshold,
          rootHash
        );
        decisionLog.txHash = txHash;
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
  console.log(
    "  Pair      | Level    | Rate       | Conf | Storage Hash"
  );
  console.log("  " + "─".repeat(56));
  for (const r of results) {
    const pairPad = r.pair.padEnd(9);
    const levelPad = r.level.padEnd(8);
    const ratePad = r.rate.padEnd(10);
    const confPad = r.confidence.padEnd(4);
    console.log(`  ${pairPad} | ${levelPad} | ${ratePad} | ${confPad} | ${r.rootHash}`);
  }
  console.log(`${"=".repeat(60)}`);

  if (oracleClient) {
    const count = await oracleClient.getAlertCount();
    console.log(`  Total on-chain alerts: ${count}`);
    console.log(`  Contract: ${contractAddress}`);
    console.log(`  Explorer: https://chainscan-galileo.0g.ai/address/${contractAddress}`);
  }

  console.log(`\n  Session complete.\n`);
}

runAgent().catch(console.error);
