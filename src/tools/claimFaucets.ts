import * as dotenv from "dotenv";
dotenv.config();

import { exec } from "child_process";
import { promisify } from "util";

/**
 * 0G Galileo Testnet 水龙头半自动助手
 *
 * 注意：所有水龙头都有 CAPTCHA + 社交登录，无法完全自动化。
 * 本脚本帮你：
 *   1. 把钱包地址复制到剪贴板
 *   2. 按顺序打开所有水龙头网页
 *   3. 你只需要点 CAPTCHA 和 X/Discord 登录
 */

const execAsync = promisify(exec);

const FAUCETS = [
  {
    name: "0G Official Faucet",
    url: "https://faucet.0g.ai",
    dailyLimit: "0.1 OG",
    auth: "X (Twitter) 账号",
  },
  {
    name: "Google Cloud Web3 Faucet",
    url: "https://cloud.google.com/application/web3/faucet/0g/galileo",
    dailyLimit: "0.1 OG",
    auth: "Google 账号",
  },
  {
    name: "Chainlink Faucet",
    url: "https://faucets.chain.link/0g-testnet-galileo",
    dailyLimit: "0.1 OG",
    auth: "钱包连接",
  },
  {
    name: "FaucetMe",
    url: "https://0g.faucetme.pro/",
    dailyLimit: "不定",
    auth: "Discord 账号",
  },
];

async function copyToClipboard(text: string): Promise<void> {
  try {
    // macOS: pbcopy
    await execAsync(`echo -n "${text}" | pbcopy`);
    console.log(`✓ 钱包地址已复制到剪贴板`);
  } catch (err: any) {
    console.warn(`⚠ 复制剪贴板失败：${err.message}`);
  }
}

async function openURL(url: string): Promise<void> {
  try {
    // macOS: open
    await execAsync(`open "${url}"`);
  } catch (err: any) {
    console.warn(`⚠ 打开 URL 失败：${err.message}`);
  }
}

async function main() {
  // 强制要求 WALLET_ADDRESS 环境变量，避免其他使用者领到项目作者钱包
  const walletAddress = process.env.WALLET_ADDRESS;
  if (!walletAddress) {
    console.error("❌ 错误：未设置 WALLET_ADDRESS 环境变量");
    console.error("   请在 .env 中配置：WALLET_ADDRESS=0xYourWalletAddress");
    console.error("   或直接 export：export WALLET_ADDRESS=0xYourWalletAddress");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("  0G Galileo Testnet 水龙头助手");
  console.log("=".repeat(60));
  console.log(`  钱包地址: ${walletAddress}`);
  console.log(`  水龙头数: ${FAUCETS.length}`);
  console.log("=".repeat(60));
  console.log();

  // Step 1: 复制钱包地址到剪贴板
  await copyToClipboard(walletAddress);

  console.log("\n即将依次打开水龙头网页，你需要：");
  console.log("  1. 粘贴钱包地址（Cmd+V，已在剪贴板）");
  console.log("  2. 完成 CAPTCHA 或社交登录");
  console.log("  3. 点击 Claim / Request 按钮");
  console.log();

  // Step 2: 依次打开
  for (let i = 0; i < FAUCETS.length; i++) {
    const f = FAUCETS[i];
    console.log(`\n[${i + 1}/${FAUCETS.length}] ${f.name}`);
    console.log(`  URL:        ${f.url}`);
    console.log(`  每日额度:   ${f.dailyLimit}`);
    console.log(`  认证方式:   ${f.auth}`);
    await openURL(f.url);

    if (i < FAUCETS.length - 1) {
      console.log(`  → 浏览器已打开，3 秒后打开下一个...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("  所有水龙头已打开！");
  console.log("  钱包地址还在剪贴板里，按 Cmd+V 粘贴即可");
  console.log();
  console.log("  领完后查余额:");
  console.log(`    cast balance ${walletAddress} --rpc-url https://evmrpc-testnet.0g.ai`);
  console.log();
  console.log("  如果水龙头不够，去 0G Discord 请求:");
  console.log("    https://discord.com/invite/STmjshM2CN");
  console.log("=".repeat(60));
}

main().catch(console.error);
