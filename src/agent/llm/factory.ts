import { BackendKind, LLMBackend } from "./types";
import { DoubaoBackend } from "./doubaoBackend";
import { ZgComputeBackend } from "./zgComputeBackend";
import { FallbackLLMBackend } from "./fallbackBackend";

/**
 * LLM Backend 工厂
 *
 * 根据环境变量决定后端：
 *   AI_BACKEND=doubao       → Doubao 单后端
 *   AI_BACKEND=0g-compute   → 0G Compute 主，Doubao fallback（生产默认）
 *
 * 禁用 fallback：AI_FALLBACK_ENABLED=false（仅跑 primary）
 */
export function createLLMBackend(kind?: BackendKind): LLMBackend {
  const resolvedKind = kind || (process.env.AI_BACKEND as BackendKind) || "doubao";
  const fallbackEnabled = process.env.AI_FALLBACK_ENABLED !== "false";

  const primary = instantiateBackend(resolvedKind);

  // Doubao 单后端 / 显式禁用 fallback：直接返回 primary
  if (resolvedKind === "doubao" || !fallbackEnabled) {
    return primary;
  }

  // 0G Compute primary → Doubao fallback
  try {
    const fallback = new DoubaoBackend();
    return new FallbackLLMBackend(primary, fallback);
  } catch (err: any) {
    // Doubao 初始化失败（比如没配 API key），降级为单 primary
    console.warn(
      `[LLM Factory] Fallback backend unavailable (${err.message}), running primary-only`
    );
    return primary;
  }
}

function instantiateBackend(kind: BackendKind): LLMBackend {
  switch (kind) {
    case "doubao":
      return new DoubaoBackend();
    case "0g-compute":
      return new ZgComputeBackend();
    default:
      console.warn(`[LLM Factory] Unknown AI_BACKEND "${kind}", falling back to doubao`);
      return new DoubaoBackend();
  }
}

export { BackendKind, LLMBackend } from "./types";
