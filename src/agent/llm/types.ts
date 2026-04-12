/**
 * LLM Backend 抽象接口
 * 支持豆包（火山方舟）/ 0G Compute 等多种后端统一接口
 */

export type BackendKind = "doubao" | "0g-compute";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface InferenceVerification {
  providerAddress: string;
  chatId: string;
  verified: boolean;
}

export interface ChatResponse {
  content: string;
  usage: ChatUsage;
  model: string;
  verification?: InferenceVerification;
}

/**
 * 所有 LLM 后端必须实现的统一接口
 */
export interface LLMBackend {
  readonly kind: BackendKind;

  /**
   * 获取后端标识名（用于日志/审计）
   * e.g. "doubao/doubao-seed-2-0-pro-260215"
   *      "0g-compute/qwen-2.5-7b-instruct"
   */
  readonly label: string;

  /**
   * 执行 chat completion
   * @throws 如果后端不可用，抛出 `BackendUnavailableError`
   */
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export class BackendUnavailableError extends Error {
  constructor(
    public readonly backend: BackendKind,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`[${backend}] ${message}`);
    this.name = "BackendUnavailableError";
  }
}
