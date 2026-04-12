import * as dotenv from "dotenv";
dotenv.config();

import { Indexer } from "@0gfoundation/0g-ts-sdk";
import * as fs from "fs";
import * as path from "path";

/**
 * 通过root hash从0G Storage下载AI决策日志
 *
 * 用法:
 *   npx ts-node src/tools/fetchLog.ts <rootHash>
 */

async function fetchLog(rootHash: string) {
  const indexerUrl = process.env.OG_STORAGE_INDEXER || "https://indexer-storage-testnet-turbo.0g.ai";
  const indexer = new Indexer(indexerUrl);

  const outputDir = path.join(process.cwd(), "downloaded-logs");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${rootHash.slice(0, 10)}.json`);
  console.log(`\n[0G Storage] Downloading log...`);
  console.log(`  rootHash: ${rootHash}`);
  console.log(`  output:   ${outputPath}\n`);

  const err = await indexer.download(rootHash, outputPath, true);
  if (err) {
    console.error(`[Error] Failed to download: ${err}`);
    process.exit(1);
  }

  // 读取并展示
  const content = fs.readFileSync(outputPath, "utf-8");
  const log = JSON.parse(content);

  console.log("=".repeat(60));
  console.log("  AI DECISION LOG");
  console.log("=".repeat(60));
  console.log(`  Agent:     ${log.agentId}`);
  console.log(`  Session:   ${log.sessionId}`);
  console.log(`  Model:     ${log.modelUsed}`);
  console.log(`  Created:   ${log.createdAt}`);
  console.log("-".repeat(60));
  console.log(`  Pair:        ${log.assessment.currencyPair}`);
  console.log(`  Risk Level:  ${["LOW", "MEDIUM", "HIGH", "CRITICAL"][log.assessment.level]}`);
  console.log(`  Spot Rate:   ${log.assessment.spotRate}`);
  console.log(`  Threshold:   ${log.assessment.threshold}`);
  console.log(`  Confidence:  ${(log.assessment.confidence * 100).toFixed(0)}%`);
  console.log("-".repeat(60));
  console.log(`  AI Reasoning:`);
  console.log(`  ${log.assessment.reasoning}`);
  console.log("-".repeat(60));
  console.log(`  Recommendation:`);
  console.log(`  ${log.assessment.recommendation}`);
  console.log("=".repeat(60));
  console.log(`\n  Full log saved to: ${outputPath}\n`);
}

const rootHash = process.argv[2];
if (!rootHash) {
  console.error("Usage: npx ts-node src/tools/fetchLog.ts <rootHash>");
  console.error("Example: npx ts-node src/tools/fetchLog.ts 0xbb4fa9f8a1f63b38d31dc49b...");
  process.exit(1);
}

fetchLog(rootHash).catch(console.error);
