import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";
import { DecisionLog } from "../agent/types";

/**
 * 0G Storage 集成
 * 将AI决策日志上传到0G去中心化存储，获取root hash作为审计凭证
 */

const OG_RPC_URL = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const OG_INDEXER_URL = process.env.OG_STORAGE_INDEXER || "https://indexer-storage-testnet-turbo.0g.ai";

export class ZgStorageClient {
  private indexer: Indexer;
  private signer: ethers.Wallet;

  constructor(privateKey: string) {
    const provider = new ethers.JsonRpcProvider(OG_RPC_URL);
    this.signer = new ethers.Wallet(privateKey, provider);
    this.indexer = new Indexer(OG_INDEXER_URL);
  }

  /**
   * 通用 JSON 上传（供 DecisionLog / AgentMetadata / SessionSummary 共享）
   * @returns root hash（bytes32格式，可直接写入合约）
   */
  async uploadJson<T>(payload: T): Promise<string> {
    const jsonData = JSON.stringify(payload, null, 2);
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonData);

    const memData = new MemData(data);

    const [result, uploadErr] = await this.indexer.upload(memData, OG_RPC_URL, this.signer);
    if (uploadErr) {
      throw new Error(`Failed to upload to 0G Storage: ${uploadErr}`);
    }

    // upload()返回 {txHash, rootHash} 或批量模式的 {txHashes[], rootHashes[]}
    // 兼容两种 shape，避免 rootHash undefined 被静默写到合约
    const raw = result as {
      txHash?: string;
      rootHash?: string;
      txHashes?: string[];
      rootHashes?: string[];
    };
    const rootHash = raw.rootHash ?? raw.rootHashes?.[0];
    const txHash = raw.txHash ?? raw.txHashes?.[0];

    if (!rootHash || typeof rootHash !== "string") {
      throw new Error(
        `[0G Storage] upload returned unexpected shape, no rootHash: ${JSON.stringify(raw)}`
      );
    }

    console.log(`[0G Storage] Upload successful, tx: ${txHash}`);
    console.log(`[0G Storage] Root hash: ${rootHash}`);

    return rootHash;
  }

  /**
   * 上传 DecisionLog（uploadJson 的语义别名，保持向后兼容）
   */
  async uploadDecisionLog(log: DecisionLog): Promise<string> {
    return this.uploadJson(log);
  }

  /**
   * 从0G Storage下载决策日志
   */
  async downloadDecisionLog(rootHash: string, outputPath: string): Promise<void> {
    const err = await this.indexer.download(rootHash, outputPath, true);
    if (err) {
      throw new Error(`Failed to download from 0G Storage: ${err}`);
    }
  }

  getSignerAddress(): string {
    return this.signer.address;
  }
}
