import {
  BackendKind,
  BackendUnavailableError,
  ChatRequest,
  ChatResponse,
  LLMBackend,
} from "./types";

/**
 * 双后端 Fallback 包装器
 *
 * 首选 primary 后端；若 primary 抛出 BackendUnavailableError（含超时），
 * 自动切换到 fallback 后端并在响应里标注 fallbackReason，
 * 供上层写入 DecisionLog 做可追溯审计。
 *
 * 两者都失败时抛出最终错误（带两份原因）。
 */
export class FallbackLLMBackend implements LLMBackend {
  public readonly kind: BackendKind;

  constructor(
    private readonly primary: LLMBackend,
    private readonly fallback: LLMBackend
  ) {
    this.kind = primary.kind;
  }

  public get label(): string {
    return `${this.primary.label} → fallback(${this.fallback.label})`;
  }

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      return await this.primary.chat(request);
    } catch (primaryErr: any) {
      const reason =
        primaryErr instanceof BackendUnavailableError
          ? primaryErr.message
          : `unexpected: ${primaryErr?.message || primaryErr}`;

      console.warn(
        `[LLM Fallback] Primary backend "${this.primary.kind}" failed, switching to "${this.fallback.kind}". Reason: ${reason}`
      );

      try {
        const response = await this.fallback.chat(request);
        return {
          ...response,
          actualBackend: this.fallback.kind,
          fallbackReason: reason,
        };
      } catch (fallbackErr: any) {
        // 两个都挂了，抛一个信息丰富的错误
        const fbReason =
          fallbackErr instanceof BackendUnavailableError
            ? fallbackErr.message
            : `unexpected: ${fallbackErr?.message || fallbackErr}`;
        throw new BackendUnavailableError(
          this.fallback.kind,
          `Both backends failed. Primary(${this.primary.kind}): ${reason}; Fallback(${this.fallback.kind}): ${fbReason}`,
          fallbackErr
        );
      }
    }
  }
}
