import * as dotenv from "dotenv";
dotenv.config();

import { createHash } from "crypto";
import { AgentRegistryClient } from "../chain/agentRegistry";
import { ZgStorageClient } from "../storage/zgStorage";

/**
 * 一次性 Mint FX Risk Agent 的 INFT
 *
 * 流程：
 *   1. 构建 Agent 元数据 JSON（系统 prompt、能力、版本等）
 *   2. 上传到 0G Storage → 得到 rootHash
 *   3. 调用 FXRiskAgentINFT.mintAgent() 铸造
 *   4. 打印 tokenId，提示用户写入 .env
 *
 * 用法：
 *   npx ts-node src/tools/mintAgent.ts
 */

const AGENT_NAME = "FX Risk Agent";
const AGENT_VERSION = "v0.2.0";
const MODEL_TYPE = "fx-risk-inference";

const SYSTEM_PROMPT_SIGNATURE = `You are an expert FX Risk Analyst AI Agent working for a cross-border payment company.`;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
  const agentContract = process.env.AGENT_INFT_ADDRESS;
  const existingTokenId = process.env.AGENT_TOKEN_ID;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY not set in .env");
  }
  if (!agentContract) {
    throw new Error(
      "AGENT_INFT_ADDRESS not set in .env. Deploy FXRiskAgentINFT first and add the address."
    );
  }
  if (existingTokenId !== undefined && existingTokenId !== "") {
    console.log(`AGENT_TOKEN_ID=${existingTokenId} already set in .env. Skipping mint.`);
    console.log("To re-mint, unset AGENT_TOKEN_ID and run again.");
    process.exit(0);
  }

  const storage = new ZgStorageClient(privateKey);
  const registry = new AgentRegistryClient(agentContract, privateKey, rpcUrl);

  console.log("=".repeat(60));
  console.log("  FX Risk Agent — INFT Mint");
  console.log("=".repeat(60));
  console.log(`  Wallet   : ${storage.getSignerAddress()}`);
  console.log(`  Contract : ${agentContract}`);
  console.log(`  Name     : ${AGENT_NAME}`);
  console.log(`  Version  : ${AGENT_VERSION}`);
  console.log("=".repeat(60));

  // Step 1: 构建 Agent 元数据
  const promptHash = createHash("sha256").update(SYSTEM_PROMPT_SIGNATURE).digest("hex");
  const metadata = {
    name: AGENT_NAME,
    version: AGENT_VERSION,
    description:
      "Verifiable AI agent for FX risk monitoring in cross-border payments. Every decision permanently stored on 0G Storage and recorded on 0G Chain for auditability.",
    modelType: MODEL_TYPE,
    primaryBackend: "doubao/doubao-seed-2-0-pro-260215",
    fallbackBackend: "0g-compute/qwen-2.5-7b-instruct",
    supportedPairs: ["USD/CNY", "EUR/USD", "GBP/USD", "USD/JPY"],
    capabilities: [
      "fx-risk-assessment",
      "threshold-detection",
      "volatility-analysis",
      "confidence-scoring",
      "verifiable-decision-log",
    ],
    creator: storage.getSignerAddress(),
    systemPromptSha256: promptHash,
    chain: {
      name: "0G Galileo Testnet",
      chainId: 16602,
      rpc: rpcUrl,
    },
    createdAt: new Date().toISOString(),
  };

  console.log("\n[1/3] Uploading agent metadata to 0G Storage...");
  const rootHash = await storage.uploadJson(metadata);
  console.log(`      Root hash: ${rootHash}`);

  // Step 2: Mint on-chain
  console.log("\n[2/3] Minting Agent INFT on-chain...");
  const { tokenId, txHash } = await registry.mintAgent(
    AGENT_NAME,
    AGENT_VERSION,
    MODEL_TYPE,
    rootHash
  );

  // Step 3: 输出（tokenId 是 bigint，toString 保留 uint256 全精度）
  const tokenIdStr = tokenId.toString();
  console.log("\n[3/3] Mint complete!");
  console.log("=".repeat(60));
  console.log(`  Token ID    : ${tokenIdStr}`);
  console.log(`  Tx Hash     : ${txHash}`);
  console.log(`  Storage Hash: ${rootHash}`);
  console.log(`  Explorer    : https://chainscan-galileo.0g.ai/tx/${txHash}`);
  console.log("=".repeat(60));
  console.log("\n  Add this to your .env:");
  console.log(`  AGENT_TOKEN_ID=${tokenIdStr}`);
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
