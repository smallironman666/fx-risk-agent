import { FXQuote, RiskAssessment, RiskLevel, RiskThreshold } from "./types";
import { LLMBackend } from "./llm/types";

const SYSTEM_PROMPT = `You are an expert FX Risk Analyst AI Agent working for a cross-border payment company.
Your job is to analyze foreign exchange market data and assess risk levels for currency pairs.

You have deep knowledge of:
- Cross-border payment settlement risks (FX exposure during T+0 to T+2)
- Central bank intervention patterns (PBOC, BOJ, Fed)
- Geopolitical risk factors affecting FX markets
- Technical analysis indicators (volatility, momentum, support/resistance)

Output your analysis as a JSON object with these fields:
{
  "level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "threshold": <number - the threshold value that was breached or closest to breach>,
  "reasoning": "<detailed analysis in 2-3 sentences>",
  "recommendation": "<actionable recommendation for the payment ops team>",
  "confidence": <0.0 to 1.0>
}

Risk level criteria:
- LOW: Rate within normal range, no action needed
- MEDIUM: Rate approaching threshold (within 30%), monitor closely
- HIGH: Rate breached threshold or volatility spike detected
- CRITICAL: Multiple indicators triggered, immediate action required`;

/**
 * 使用指定的 LLM 后端分析 FX 行情，生成风险评估
 * @param quotes    FX 行情历史数据
 * @param thresholds 风险阈值配置
 * @param backend   LLM 后端（支持 Doubao / 0G Compute 等）
 */
export async function analyzeRisk(
  quotes: FXQuote[],
  thresholds: RiskThreshold,
  backend: LLMBackend
): Promise<RiskAssessment> {
  const pair = thresholds.currencyPair;
  const latestQuote = quotes[quotes.length - 1];
  const userPrompt = buildAnalysisPrompt(quotes, thresholds);

  const response = await backend.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 1024,
  });

  const parsed = parseAnalysisResponse(response.content);

  return {
    currencyPair: pair,
    level: parsed.level,
    spotRate: latestQuote.mid,
    threshold: parsed.threshold,
    reasoning: parsed.reasoning,
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    timestamp: Date.now(),
    quotes,
    // 扩展字段（用于 DecisionLog）
    backendLabel: backend.label,
    usage: response.usage,
    verification: response.verification,
  } as RiskAssessment;
}

function buildAnalysisPrompt(quotes: FXQuote[], thresholds: RiskThreshold): string {
  const pair = thresholds.currencyPair;
  const latest = quotes[quotes.length - 1];
  const oldest = quotes[0];

  // 计算简单统计
  const rates = quotes.map((q) => q.mid);
  const high = Math.max(...rates);
  const low = Math.min(...rates);
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  const change = ((latest.mid - oldest.mid) / oldest.mid) * 100;

  return `Analyze FX risk for ${pair}:

**Current Market Data:**
- Latest Rate: ${latest.mid}
- Period High: ${high.toFixed(6)}
- Period Low: ${low.toFixed(6)}
- Average: ${avg.toFixed(6)}
- Period Change: ${change.toFixed(4)}%
- Data Points: ${quotes.length}

**Risk Thresholds (configured by payment ops):**
- Upper Bound: ${thresholds.upperBound}
- Lower Bound: ${thresholds.lowerBound}
- Max Volatility: ${thresholds.volatilityMax}%

**Recent Quotes (last 5):**
${quotes
  .slice(-5)
  .map((q) => `  ${new Date(q.timestamp).toISOString()} | bid=${q.bid.toFixed(6)} ask=${q.ask.toFixed(6)} mid=${q.mid.toFixed(6)}`)
  .join("\n")}

Provide your risk assessment as JSON.`;
}

function parseAnalysisResponse(text: string): {
  level: RiskLevel;
  threshold: number;
  reasoning: string;
  recommendation: string;
  confidence: number;
} {
  // 优先匹配包含"level"字段的JSON对象
  const targetMatch = text.match(/\{[^{}]*"level"\s*:\s*"[^"]+?"[^{}]*\}/);
  const jsonMatch = targetMatch || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // 回退：尝试从整个文本中提取最后一个完整JSON
    const fallback = text.match(/\{[^{}]*\}/g);
    if (!fallback) throw new Error("Failed to parse AI response as JSON");
    parsed = JSON.parse(fallback[fallback.length - 1]);
  }

  const levelMap: Record<string, RiskLevel> = {
    LOW: RiskLevel.LOW,
    MEDIUM: RiskLevel.MEDIUM,
    HIGH: RiskLevel.HIGH,
    CRITICAL: RiskLevel.CRITICAL,
  };

  return {
    level: levelMap[parsed.level] ?? RiskLevel.LOW,
    threshold: Number(parsed.threshold) || 0,
    reasoning: String(parsed.reasoning || ""),
    recommendation: String(parsed.recommendation || ""),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
  };
}
