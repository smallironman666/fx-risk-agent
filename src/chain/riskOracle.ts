import { ethers } from "ethers";
import { RiskLevel } from "../agent/types";

// FXRiskOracle合约ABI（仅包含需要的函数）
const ORACLE_ABI = [
  "function submitAlert(string currencyPair, uint8 level, uint256 spotRate, uint256 threshold, bytes32 storageRootHash) external",
  "function getAlertCount() view returns (uint256)",
  "function getLatestAlerts(uint256 count) view returns (tuple(string currencyPair, uint8 level, uint256 spotRate, uint256 threshold, bytes32 storageRootHash, uint256 timestamp, address reporter)[])",
  "function latestRiskLevel(string) view returns (uint8)",
  "event AlertCreated(uint256 indexed alertId, string currencyPair, uint8 level, uint256 spotRate, bytes32 storageRootHash, uint256 timestamp)",
];

// 汇率转6位定点数（1.0 = 1_000_000）
function rateToFixed(rate: number): bigint {
  return BigInt(Math.round(rate * 1_000_000));
}

/**
 * 链上FXRiskOracle合约交互
 */
export class RiskOracleClient {
  private contract: ethers.Contract;
  private signer: ethers.Wallet;

  constructor(contractAddress: string, privateKey: string, rpcUrl: string) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.contract = new ethers.Contract(contractAddress, ORACLE_ABI, this.signer);
  }

  /**
   * 提交风险预警到链上
   */
  async submitAlert(
    currencyPair: string,
    level: RiskLevel,
    spotRate: number,
    threshold: number,
    storageRootHash: string
  ): Promise<string> {
    console.log(`[Chain] Submitting alert: ${currencyPair} level=${RiskLevel[level]} rate=${spotRate}`);

    // 确保rootHash是合法的bytes32（0x + 64 hex chars）
    const paddedHash = ethers.zeroPadValue(storageRootHash, 32);

    const tx = await this.contract.submitAlert(
      currencyPair,
      level,
      rateToFixed(spotRate),
      rateToFixed(threshold),
      paddedHash
    );

    const receipt = await tx.wait();
    console.log(`[Chain] Alert submitted, tx: ${receipt.hash}`);
    return receipt.hash;
  }

  async getAlertCount(): Promise<number> {
    const count = await this.contract.getAlertCount();
    return Number(count);
  }

  async getLatestAlerts(count: number = 5): Promise<any[]> {
    return await this.contract.getLatestAlerts(count);
  }
}
