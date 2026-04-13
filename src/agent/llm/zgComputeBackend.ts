import { ethers } from "ethers";
import { createZGComputeNetworkBroker, ZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import {
  BackendUnavailableError,
  ChatRequest,
  ChatResponse,
  LLMBackend,
} from "./types";

/**
 * 0G Compute 后端 - 基于 @0glabs/0g-serving-broker SDK
 *
 * 架构：
 *   1. 连接 0G Compute Network 获取可用 Provider
 *   2. Acknowledge Provider 的 TEE Signer
 *   3. 调用 OpenAI 兼容的 inference 接口
 *   4. 使用 processResponse 做 TEE 验证
 */
export class ZgComputeBackend implements LLMBackend {
  public readonly kind = "0g-compute" as const;

  private readonly wallet: ethers.Wallet;
  private readonly preferredProvider?: string;
  private readonly enableTEE: boolean;

  private broker?: ZGComputeNetworkBroker;
  private providerAddress?: string;
  private serviceMeta?: { endpoint: string; model: string };
  private initPromise?: Promise<void>;

  constructor(opts: {
    privateKey?: string;
    rpcUrl?: string;
    preferredProvider?: string;
    enableTEE?: boolean;
  } = {}) {
    const privateKey = opts.privateKey || process.env.PRIVATE_KEY;
    const rpcUrl = opts.rpcUrl || process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";

    if (!privateKey) {
      throw new BackendUnavailableError(this.kind, "PRIVATE_KEY not set");
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, provider);
    this.preferredProvider = opts.preferredProvider || process.env.ZG_COMPUTE_PROVIDER;
    this.enableTEE = opts.enableTEE ?? (process.env.ZG_COMPUTE_TEE !== "false");
  }

  public get label(): string {
    const model = this.serviceMeta?.model || "pending-init";
    const teeLabel = this.enableTEE ? " (TEE)" : "";
    return `0g-compute/${model}${teeLabel}`;
  }

  /**
   * 懒加载初始化 - 首次调用 chat() 时才初始化
   * 避免 Doubao 模式下载入无用 broker
   */
  private async ensureReady(): Promise<void> {
    if (this.broker && this.providerAddress && this.serviceMeta) return;

    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      // Step 1: 创建 broker
      this.broker = await createZGComputeNetworkBroker(this.wallet);

      // Step 2: 发现 provider（如果没指定则选第一个）
      let providerAddress = this.preferredProvider;
      if (!providerAddress) {
        const services = await this.broker.inference.listService();
        if (!services || services.length === 0) {
          throw new BackendUnavailableError(
            this.kind,
            "No inference providers available on 0G Compute Network"
          );
        }
        providerAddress = services[0].provider;
      }
      this.providerAddress = providerAddress;

      // Step 3: Acknowledge Provider TEE Signer（幂等）
      const alreadyAcknowledged = await this.broker.inference.acknowledged(providerAddress);
      if (!alreadyAcknowledged) {
        console.log(`[0G Compute] Acknowledging provider signer: ${providerAddress}`);
        await this.broker.inference.acknowledgeProviderSigner(providerAddress);
      }

      // Step 4: 获取服务元数据
      this.serviceMeta = await this.broker.inference.getServiceMetadata(providerAddress);
      console.log(
        `[0G Compute] Connected to provider ${providerAddress} / model ${this.serviceMeta.model}`
      );
    } catch (err: any) {
      this.initPromise = undefined;
      if (err instanceof BackendUnavailableError) throw err;
      throw new BackendUnavailableError(
        this.kind,
        `Initialization failed: ${err.message || err}`,
        err
      );
    }
  }

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    await this.ensureReady();
    const broker = this.broker!;
    const providerAddress = this.providerAddress!;
    const { endpoint, model } = this.serviceMeta!;

    // 对于 Qwen 2.5 7B 等小模型，加强 JSON 输出指令
    const enhancedMessages = [...request.messages];
    if (enhancedMessages[0]?.role === "system") {
      enhancedMessages[0] = {
        ...enhancedMessages[0],
        content:
          enhancedMessages[0].content +
          "\n\nIMPORTANT: Respond ONLY with a valid JSON object, no markdown fences, no commentary.",
      };
    }

    // 用户内容用于计费签名
    const userContent = enhancedMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    try {
      const headers = await broker.inference.getRequestHeaders(providerAddress, userContent);

      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(headers as unknown as Record<string, string>),
        },
        body: JSON.stringify({
          model,
          messages: enhancedMessages,
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new BackendUnavailableError(
          this.kind,
          `HTTP ${response.status}: ${body.slice(0, 200)}`
        );
      }

      // ChatID 提取优先级：ZG-Res-Key header → zg-res-key header → data.id fallback
      // 参考：0G Agent Skills 规范 (https://github.com/0gfoundation/0g-agent-skills)
      const data = await response.json() as any;
      const chatId =
        response.headers.get("ZG-Res-Key") ||
        response.headers.get("zg-res-key") ||
        data.id ||
        undefined;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new BackendUnavailableError(this.kind, "Empty response content");
      }

      // 可选 TEE 验证
      let verification: ChatResponse["verification"];
      if (this.enableTEE && chatId) {
        try {
          const verified = await broker.inference.processResponse(
            providerAddress,
            chatId,
            JSON.stringify(data.usage || {})
          );
          verification = {
            providerAddress,
            chatId,
            verified: verified === true,
          };
        } catch (verifyErr: any) {
          console.warn(`[0G Compute] TEE verification failed: ${verifyErr.message}`);
          verification = {
            providerAddress,
            chatId,
            verified: false,
          };
        }
      }

      // 剥离可能的 markdown 围栏（Qwen 习惯包 ```json）
      const cleaned = this.stripMarkdownFences(content);

      return {
        content: cleaned,
        model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        },
        verification,
      };
    } catch (err: any) {
      if (err instanceof BackendUnavailableError) throw err;
      throw new BackendUnavailableError(
        this.kind,
        `Chat failed: ${err.message || err}`,
        err
      );
    }
  }

  private stripMarkdownFences(text: string): string {
    return text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  }
}
