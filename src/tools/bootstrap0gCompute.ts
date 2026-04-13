import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

/**
 * 0G Compute 初始化脚本
 *
 * 一次性完成：
 *   1. 连接 broker
 *   2. 列出 provider，选一个
 *   3. 创建 ledger (deposit 3 OG)
 *   4. acknowledgeProviderSigner
 *   5. 给 provider 子账户 transferFund (1 OG)
 *
 * 用法：npx ts-node src/tools/bootstrap0gCompute.ts
 */

const LEDGER_DEPOSIT_OG = 3;
const PROVIDER_TRANSFER_OG = 1;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";

  if (!privateKey) throw new Error("PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("=".repeat(60));
  console.log("  0G Compute Network — Bootstrap");
  console.log("=".repeat(60));
  console.log(`  Wallet : ${wallet.address}`);

  const balanceWei = await provider.getBalance(wallet.address);
  const balanceOG = Number(ethers.formatEther(balanceWei));
  console.log(`  Balance: ${balanceOG.toFixed(4)} OG`);
  console.log("=".repeat(60));

  if (balanceOG < LEDGER_DEPOSIT_OG + PROVIDER_TRANSFER_OG + 0.5) {
    throw new Error(
      `Insufficient balance. Need ≥${LEDGER_DEPOSIT_OG + PROVIDER_TRANSFER_OG + 0.5} OG, have ${balanceOG.toFixed(4)}`
    );
  }

  // Step 1: 创建 broker
  console.log("\n[1/5] Creating 0G Compute Network Broker...");
  const broker = await createZGComputeNetworkBroker(wallet);
  console.log("      ✓ Broker created");

  // Step 2: 列出 provider
  console.log("\n[2/5] Listing available providers...");
  const services = await broker.inference.listService();
  if (!services || services.length === 0) {
    throw new Error("No providers available on 0G Compute Network");
  }
  console.log(`      ✓ Found ${services.length} provider(s):`);
  services.forEach((s, i) => {
    console.log(`        [${i}] ${s.provider} → ${s.model || "(model in metadata)"}`);
  });

  // 选择首个 provider（或 .env 指定）
  const preferred = process.env.ZG_COMPUTE_PROVIDER;
  const chosen = preferred
    ? services.find((s) => s.provider.toLowerCase() === preferred.toLowerCase())
    : services[0];
  if (!chosen) {
    throw new Error(`Preferred provider ${preferred} not found`);
  }
  const providerAddress = chosen.provider;
  console.log(`      → Selected: ${providerAddress}`);

  // Step 3: 创建 Ledger
  console.log(`\n[3/5] Creating ledger with ${LEDGER_DEPOSIT_OG} OG deposit...`);
  try {
    const ledgerInfo: any = await broker.ledger.getLedger();
    const currentBalanceWei = ledgerInfo.totalBalance ?? ledgerInfo.availableBalance ?? 0n;
    const currentBalanceOG = Number(ethers.formatEther(currentBalanceWei));
    console.log(`      ℹ Ledger already exists with ${currentBalanceOG.toFixed(4)} OG`);

    if (currentBalanceOG < LEDGER_DEPOSIT_OG) {
      const toAdd = LEDGER_DEPOSIT_OG - currentBalanceOG;
      console.log(`      → Topping up with ${toAdd.toFixed(4)} OG...`);
      await broker.ledger.depositFund(toAdd);
      console.log(`      ✓ Topped up`);
    }
  } catch (e: any) {
    // Ledger 不存在，创建它
    console.log(`      → No ledger found, creating with ${LEDGER_DEPOSIT_OG} OG...`);
    await broker.ledger.addLedger(LEDGER_DEPOSIT_OG);
    console.log(`      ✓ Ledger created`);
  }

  // Step 4: 给 provider 子账户充值（必须在 acknowledge 之前，先开子账户）
  console.log(`\n[4/5] Transferring ${PROVIDER_TRANSFER_OG} OG to provider sub-account...`);
  try {
    await broker.ledger.transferFund(
      providerAddress,
      "inference",
      BigInt(PROVIDER_TRANSFER_OG) * BigInt(10 ** 18)
    );
    console.log(`      ✓ Transfer complete, sub-account created`);
  } catch (e: any) {
    console.warn(`      ⚠ Transfer failed or already funded: ${e.message || e}`);
  }

  // Step 5: Acknowledge Provider signer（子账户存在后才能查询/确认）
  console.log(`\n[5/5] Acknowledging provider signer...`);
  try {
    const alreadyAck = await broker.inference.acknowledged(providerAddress);
    if (alreadyAck) {
      console.log(`      ℹ Provider already acknowledged`);
    } else {
      await broker.inference.acknowledgeProviderSigner(providerAddress);
      console.log(`      ✓ Provider acknowledged`);
    }
  } catch (e: any) {
    console.warn(`      ⚠ Acknowledge failed (will retry on first request): ${e.message || e}`);
  }

  // 获取服务元数据
  console.log(`\nFetching service metadata...`);
  const meta = await broker.inference.getServiceMetadata(providerAddress);
  console.log(`      Endpoint: ${meta.endpoint}`);
  console.log(`      Model:    ${meta.model}`);

  // 查询各账户余额
  const finalBalanceWei = await provider.getBalance(wallet.address);
  const finalBalanceOG = Number(ethers.formatEther(finalBalanceWei));

  console.log("\n" + "=".repeat(60));
  console.log("  Bootstrap complete!");
  console.log("=".repeat(60));
  console.log(`  Wallet balance    : ${finalBalanceOG.toFixed(4)} OG`);
  console.log(`  Provider address  : ${providerAddress}`);
  console.log(`  Inference model   : ${meta.model}`);
  console.log(`  Endpoint          : ${meta.endpoint}`);
  console.log();
  console.log("  Next step: run the agent with 0G Compute backend");
  console.log("  $ AI_BACKEND=0g-compute ZG_COMPUTE_PROVIDER=" + providerAddress);
  console.log("    npx ts-node src/index.ts --pair USD/CNY --scenario crisis");
  console.log("=".repeat(60));

  // 写入 .env 建议
  console.log(`\n  Add to .env for future runs:`);
  console.log(`  ZG_COMPUTE_PROVIDER=${providerAddress}`);
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
