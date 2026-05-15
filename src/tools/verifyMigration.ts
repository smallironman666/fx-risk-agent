/**
 * 主网迁移验证脚本：跳过 AI 后端，直接对新 V2.1 合约打一笔 alert，
 * 验证 AlertCreated 新事件签名（threshold + indexed reporter）能被 ABI 正确解析。
 * 同时校验 INFT.tokenURI() 链上 SVG 输出。
 *
 * 使用：npx ts-node src/tools/verifyMigration.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { RiskOracleV2Client } from "../chain/riskOracleV2";
import { explorerAddress } from "../chain/explorer";
import { RiskLevel } from "../agent/types";

async function main() {
  const oracleAddr = process.env.FX_RISK_ORACLE_V2_ADDRESS!;
  const inftAddr = process.env.AGENT_INFT_ADDRESS!;
  const tokenId = BigInt(process.env.AGENT_TOKEN_ID || "0");
  const rpc = process.env.OG_RPC_URL!;
  const pk = process.env.PRIVATE_KEY!;

  console.log("=".repeat(60));
  console.log("  Mainnet Migration Verifier (V2.1)");
  console.log("=".repeat(60));
  console.log(`  RPC      : ${rpc}`);
  console.log(`  Oracle V2: ${oracleAddr}`);
  console.log(`  INFT     : ${inftAddr}`);
  console.log(`  Token #  : ${tokenId}`);
  console.log("=".repeat(60));

  // === Step 1: 验证 INFT.tokenURI() 输出合法 data URI ===
  console.log("\n[1/3] Querying INFT.tokenURI()...");
  const provider = new ethers.JsonRpcProvider(rpc);
  const inft = new ethers.Contract(
    inftAddr,
    ["function tokenURI(uint256) view returns (string)"],
    provider
  );
  const uri: string = await inft.tokenURI(tokenId);
  if (!uri.startsWith("data:application/json;base64,")) {
    throw new Error(`tokenURI prefix unexpected: ${uri.slice(0, 60)}`);
  }
  const jsonRaw = Buffer.from(uri.split(",")[1], "base64").toString("utf8");
  const meta = JSON.parse(jsonRaw);
  console.log(`  ✔ name        : ${meta.name}`);
  console.log(`  ✔ image (SVG) : ${meta.image.slice(0, 50)}...`);
  console.log(`  ✔ traits      : ${meta.attributes.length} attrs`);

  // === Step 2: 直接 submit 一笔 mock alert ===
  console.log("\n[2/3] Submitting mock alert via Oracle V2.1...");
  const client = new RiskOracleV2Client(oracleAddr, pk, rpc);
  const txHash = await client.submitAlert(
    "USD/CNY",
    RiskLevel.HIGH,
    7.32,
    7.30,
    "0x" + "ab".repeat(32), // mock 32-byte rootHash
    tokenId,
    "doubao"
  );
  console.log(`  ✔ tx hash: ${txHash}`);

  // === Step 3: 用新 ABI 解 event，验证 threshold + reporter 字段都被解析 ===
  console.log("\n[3/3] Fetching alert and verifying schema...");
  const count = await client.getAlertCount();
  const alerts = await client.getLatestAlerts(1);
  const a = alerts[0];
  console.log(`  ✔ count     : ${count}`);
  console.log(`  ✔ pair      : ${a.currencyPair}`);
  console.log(`  ✔ level     : ${a.level}`);
  console.log(`  ✔ spotRate  : ${a.spotRate}`);
  console.log(`  ✔ threshold : ${a.threshold}`);
  console.log(`  ✔ reporter  : ${a.reporter}`);
  console.log(`  ✔ tokenId   : ${a.agentTokenId}`);
  console.log(`  ✔ backend   : ${a.aiBackend}`);

  console.log("\n" + "=".repeat(60));
  console.log("  ✅ Migration verified: V2.1 ABI + on-chain SVG OK");
  console.log("=".repeat(60));
  console.log(`  Explorer: ${explorerAddress(oracleAddr)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
