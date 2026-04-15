import OpenAI from "openai";
import {
  BackendUnavailableError,
  ChatRequest,
  ChatResponse,
  LLMBackend,
} from "./types";

/**
 * 豆包（火山方舟）后端 - 基于 OpenAI 兼容接口
 * 也可用于任何 OpenAI 兼容的 API（Claude、通义等）
 */
const DEFAULT_TIMEOUT_MS = 30_000;

export class DoubaoBackend implements LLMBackend {
  public readonly kind = "doubao" as const;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    baseURL: string = process.env.AI_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: string = process.env.AI_API_KEY || "",
    model: string = process.env.AI_MODEL || "doubao-seed-2-0-pro-260215",
    timeoutMs: number = Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  ) {
    if (!apiKey) {
      throw new BackendUnavailableError(this.kind, "AI_API_KEY is not set");
    }
    this.client = new OpenAI({ baseURL, apiKey, timeout: timeoutMs });
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  public get label(): string {
    return `doubao/${this.model}`;
  }

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature,
        messages: request.messages,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new BackendUnavailableError(this.kind, "Empty response content");
      }

      return {
        content,
        model: this.model,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
        },
        actualBackend: this.kind,
      };
    } catch (err: any) {
      if (err instanceof BackendUnavailableError) throw err;
      // OpenAI SDK 超时会抛 APIConnectionTimeoutError 或 name="AbortError"
      const isTimeout = err?.name === "APIConnectionTimeoutError" || err?.name === "AbortError";
      const message = isTimeout
        ? `Request timeout after ${this.timeoutMs}ms`
        : `Request failed: ${err.message}`;
      throw new BackendUnavailableError(this.kind, message, err);
    }
  }
}
