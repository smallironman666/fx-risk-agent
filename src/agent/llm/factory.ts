import { BackendKind, LLMBackend } from "./types";
import { DoubaoBackend } from "./doubaoBackend";
import { ZgComputeBackend } from "./zgComputeBackend";

/**
 * LLM Backend 工厂
 * 根据环境变量 AI_BACKEND 决定使用哪个后端
 */
export function createLLMBackend(kind?: BackendKind): LLMBackend {
  const resolvedKind = kind || (process.env.AI_BACKEND as BackendKind) || "doubao";

  switch (resolvedKind) {
    case "doubao":
      return new DoubaoBackend();
    case "0g-compute":
      return new ZgComputeBackend();
    default:
      console.warn(`Unknown AI_BACKEND "${resolvedKind}", falling back to doubao`);
      return new DoubaoBackend();
  }
}

export { BackendKind, LLMBackend } from "./types";
