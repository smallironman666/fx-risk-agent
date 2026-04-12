import { AgentSessionSummary } from "./types";
import { BackendKind } from "./llm/types";

/**
 * 构建 Agent 会话摘要
 * 每次 runAgent 执行后生成，上传到 0G Storage 并用作 updateAgentState 的 rootHash
 */
export function buildSessionSummary(params: {
  agentId: string;
  agentTokenId: number;
  sessionId: string;
  aiBackend: BackendKind;
  processedPairs: string[];
  decisionLogRootHashes: string[];
}): AgentSessionSummary {
  return {
    agentId: params.agentId,
    agentTokenId: params.agentTokenId,
    sessionId: params.sessionId,
    aiBackend: params.aiBackend,
    processedPairs: params.processedPairs,
    alertCount: params.decisionLogRootHashes.length,
    decisionLogRootHashes: params.decisionLogRootHashes,
    createdAt: new Date().toISOString(),
  };
}
