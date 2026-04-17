import { ethers } from "ethers";
import { RiskLevel } from "../agent/types";

// FXRiskOracleV2 合约 ABI
const ORACLE_V2_ABI = [
  "function submitAlert(string currencyPair, uint8 level, uint256 spotRate, uint256 threshold, bytes32 storageRootHash, uint256 agentTokenId, string aiBackend) external",
  "function getAlertCount() view returns (uint256)",
  "function getLatestAlerts(uint256 count) view returns (tuple(string currencyPair, uint8 level, uint256 spotRate, uint256 threshold, bytes32 storageRootHash, uint256 timestamp, address reporter, uint256 agentTokenId, string aiBackend)[])",
  "function latestRiskLevel(string) view returns (uint8)",
  "function alertCountByAgent(uint256) view returns (uint256)",
  "function agentContract() view returns (address)",
  "event AlertCreated(uint256 indexed alertId, string currencyPair, uint8 level, uint256 spotRate, bytes32 storageRootHash, uint256 timestamp, uint256 indexed agentTokenId, string aiBackend)",
];

// 汇率转 6 位定点数：用 toFixed 规避浮点乘法误差（0.1*1e6 这类场景不会漂）
function rateToFixed(rate: number): bigint {
  return BigInt(rate.toFixed(6).replace(".", ""));
}

// Galileo testnet 最低 gas price，ethers 默认可能低于此被 revert
const OG_MIN_GAS_PRICE = BigInt(process.env.OG_MIN_GAS_PRICE || "3000000000");

/**
 * FXRiskOracleV2 合约客户端
 * 提交带 Agent ID + AI Backend 的风险预警
 */
export class RiskOracleV2Client {
  private readonly contract: ethers.Contract;
  private readonly signer: ethers.Wallet;

  constructor(contractAddress: string, privateKey: string, rpcUrl: string) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.contract = new ethers.Contract(contractAddress, ORACLE_V2_ABI, this.signer);
  }

  get address(): string {
    return this.contract.target as string;
  }

  async submitAlert(
    currencyPair: string,
    level: RiskLevel,
    spotRate: number,
    threshold: number,
    storageRootHash: string,
    agentTokenId: bigint,
    aiBackend: string
  ): Promise<string> {
    console.log(
      `[ChainV2] submitAlert ${currencyPair} lvl=${RiskLevel[level]} agent=#${agentTokenId.toString()} backend=${aiBackend}`
    );

    const paddedHash = ethers.zeroPadValue(storageRootHash, 32);
    const tx = await this.contract.submitAlert(
      currencyPair,
      level,
      rateToFixed(spotRate),
      rateToFixed(threshold),
      paddedHash,
      agentTokenId,
      aiBackend,
      { gasPrice: OG_MIN_GAS_PRICE }
    );
    const receipt = await tx.wait();
    console.log(`[ChainV2] Alert submitted, tx: ${receipt.hash}`);
    return receipt.hash;
  }

  async getAlertCount(): Promise<bigint> {
    return BigInt(await this.contract.getAlertCount());
  }

  async getLatestAlerts(count: number = 5): Promise<any[]> {
    return await this.contract.getLatestAlerts(count);
  }

  async getAgentContract(): Promise<string> {
    return await this.contract.agentContract();
  }

  async getAlertCountByAgent(agentTokenId: bigint): Promise<bigint> {
    return BigInt(await this.contract.alertCountByAgent(agentTokenId));
  }
}
