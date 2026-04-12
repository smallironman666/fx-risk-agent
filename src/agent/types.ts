/**
 * FX Risk Agent 核心类型定义
 */

import type { BackendKind, ChatUsage, InferenceVerification } from "./llm/types";

export enum RiskLevel {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export interface FXQuote {
  currencyPair: string;   // "USD/CNY"
  bid: number;
  ask: number;
  mid: number;
  timestamp: number;
  source: string;
}

export interface RiskThreshold {
  currencyPair: string;
  upperBound: number;     // 汇率上限
  lowerBound: number;     // 汇率下限
  volatilityMax: number;  // 最大波动率 (%)
}

export interface RiskAssessment {
  currencyPair: string;
  level: RiskLevel;
  spotRate: number;
  threshold: number;        // 被触发的阈值
  reasoning: string;        // AI分析推理过程
  recommendation: string;   // AI建议
  confidence: number;       // 0-1
  timestamp: number;
  quotes: FXQuote[];        // 分析依据的行情数据

  // LLM Backend 附加信息
  backendLabel?: string;    // e.g. "doubao/doubao-seed-2-0-pro"
  usage?: ChatUsage;
  verification?: InferenceVerification;
}

export interface DecisionLog {
  agentId: string;
  sessionId: string;
  assessment: RiskAssessment;
  modelUsed: string;
  promptTokens: number;
  completionTokens: number;
  storageRootHash?: string;  // 上链后回填
  txHash?: string;           // 上链后回填
  createdAt: string;         // ISO 8601

  // Agent ID 集成（V2 新增，向后兼容）
  agentTokenId?: number;          // INFT tokenId
  agentContract?: string;         // FXRiskAgentINFT 合约地址
  aiBackend?: BackendKind;        // "doubao" | "0g-compute"
  inferenceVerification?: InferenceVerification;
  fallbackReason?: string;        // 如果后端降级，记录原因
}

/**
 * Agent 会话摘要（用于 updateAgentState 的 Storage 引用）
 */
export interface AgentSessionSummary {
  agentId: string;
  agentTokenId: number;
  sessionId: string;
  aiBackend: BackendKind;
  processedPairs: string[];
  alertCount: number;
  decisionLogRootHashes: string[];
  createdAt: string;
  inferenceCount?: number;  // 从链上读取
}
