import { ethers } from "ethers";

/**
 * FXRiskAgentINFT 合约客户端
 * 封装 mint / updateAgentState / 查询 等操作
 */

const AGENT_INFT_ABI = [
  "function mintAgent(address to, string calldata agentName, string calldata version, string calldata modelType, bytes32 storageRootHash) external returns (uint256)",
  "function updateAgentState(uint256 tokenId, bytes32 newStorageRootHash) external",
  "function getAgent(uint256 tokenId) view returns (tuple(string agentName, string version, string modelType, bytes32 storageRootHash, uint256 createdAt, address creator) meta, uint256 totalInferences, uint256 lastUpdate)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function inferenceCount(uint256 tokenId) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "event AgentMinted(uint256 indexed tokenId, address indexed creator, string agentName, string version, bytes32 storageRootHash, uint256 timestamp)",
  "event AgentStateUpdated(uint256 indexed tokenId, bytes32 newStorageRootHash, uint256 inferenceCount, uint256 timestamp)",
];

export interface AgentMetadata {
  agentName: string;
  version: string;
  modelType: string;
  storageRootHash: string;
  createdAt: bigint;
  creator: string;
}

export interface AgentInfo {
  meta: AgentMetadata;
  totalInferences: bigint;
  lastUpdate: bigint;
}

export class AgentRegistryClient {
  private readonly contract: ethers.Contract;
  private readonly signer: ethers.Wallet;

  constructor(contractAddress: string, privateKey: string, rpcUrl: string) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.contract = new ethers.Contract(contractAddress, AGENT_INFT_ABI, this.signer);
  }

  get address(): string {
    return this.contract.target as string;
  }

  /**
   * Mint 一个新 Agent
   * @param agentName       Agent 名称
   * @param version         版本
   * @param modelType       模型类型（如 "fx-risk-inference"）
   * @param storageRootHash 0G Storage 中完整元数据 JSON 的 rootHash
   * @returns { tokenId, txHash }
   */
  async mintAgent(
    agentName: string,
    version: string,
    modelType: string,
    storageRootHash: string
  ): Promise<{ tokenId: number; txHash: string }> {
    const paddedHash = ethers.zeroPadValue(storageRootHash, 32);

    console.log(`[AgentRegistry] Minting agent "${agentName}" v${version}...`);
    const tx = await this.contract.mintAgent(
      this.signer.address,
      agentName,
      version,
      modelType,
      paddedHash
    );
    const receipt = await tx.wait();

    // 从 event log 中解析 tokenId
    const iface = new ethers.Interface(AGENT_INFT_ABI);
    let tokenId = -1;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "AgentMinted") {
          tokenId = Number(parsed.args.tokenId);
          break;
        }
      } catch {
        // 非本合约事件，忽略
      }
    }

    if (tokenId < 0) {
      throw new Error("Failed to parse tokenId from AgentMinted event");
    }

    console.log(`[AgentRegistry] Agent minted: tokenId=${tokenId}, tx=${receipt.hash}`);
    return { tokenId, txHash: receipt.hash };
  }

  /**
   * 更新 Agent 状态（每次推理会话结束时调用）
   */
  async updateAgentState(tokenId: number, newStorageRootHash: string): Promise<string> {
    const paddedHash = ethers.zeroPadValue(newStorageRootHash, 32);
    const tx = await this.contract.updateAgentState(tokenId, paddedHash);
    const receipt = await tx.wait();
    console.log(`[AgentRegistry] State updated for tokenId=${tokenId}, tx=${receipt.hash}`);
    return receipt.hash;
  }

  async getAgent(tokenId: number): Promise<AgentInfo> {
    const result = await this.contract.getAgent(tokenId);
    const meta = result[0];
    return {
      meta: {
        agentName: meta[0],
        version: meta[1],
        modelType: meta[2],
        storageRootHash: meta[3],
        createdAt: BigInt(meta[4]),
        creator: meta[5],
      },
      totalInferences: BigInt(result[1]),
      lastUpdate: BigInt(result[2]),
    };
  }

  async ownerOf(tokenId: number): Promise<string> {
    return await this.contract.ownerOf(tokenId);
  }

  async inferenceCount(tokenId: number): Promise<number> {
    const count = await this.contract.inferenceCount(tokenId);
    return Number(count);
  }

  async totalSupply(): Promise<number> {
    const count = await this.contract.totalSupply();
    return Number(count);
  }

  /**
   * 启动校验：断言本钱包拥有指定 tokenId
   * 避免在运行时 updateAgentState revert
   */
  async assertOwnership(tokenId: number): Promise<void> {
    const owner = await this.ownerOf(tokenId);
    if (owner.toLowerCase() !== this.signer.address.toLowerCase()) {
      throw new Error(
        `Wallet ${this.signer.address} does not own agent #${tokenId} (owner: ${owner})`
      );
    }
  }
}
