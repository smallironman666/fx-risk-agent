/**
 * Chain explorer URL helper：按 chainId 自适应主网/testnet。
 * 16661 = Aristotle 主网；16602 = Galileo testnet；其它 fallback Galileo。
 */
const MAINNET_BASE = "https://chainscan.0g.ai";
const TESTNET_BASE = "https://chainscan-galileo.0g.ai";

function baseFromEnv(): string {
  const id = Number(process.env.OG_CHAIN_ID || "16602");
  return id === 16661 ? MAINNET_BASE : TESTNET_BASE;
}

export function explorerTx(txHash: string): string {
  return `${baseFromEnv()}/tx/${txHash}`;
}

export function explorerAddress(addr: string): string {
  return `${baseFromEnv()}/address/${addr}`;
}
