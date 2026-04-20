/**
 * AI 响应解析器单元测试
 *
 * 运行方式：npx ts-node test/ts/analyzer.test.ts
 */

import * as assert from "assert";
import { RiskLevel } from "../../src/agent/types";

// 为了测试，把 analyzer 里的 parseAnalysisResponse 行为提取出来
// （原函数是 private，这里复制核心逻辑做测试）
function parseAnalysisResponse(text: string): {
  level: RiskLevel;
  threshold: number;
  reasoning: string;
  recommendation: string;
  confidence: number;
} {
  const targetMatch = text.match(/\{[^{}]*"level"\s*:\s*"[^"]+?"[^{}]*\}/);
  const jsonMatch = targetMatch || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
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

// ==========================================================
// 测试用例
// ==========================================================

let passed = 0;
let failed = 0;
const failures: { name: string; error: any }[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
    failures.push({ name, error: err });
  }
}

console.log("\nparseAnalysisResponse");

test("解析标准 JSON 响应", () => {
  const input = `{"level":"HIGH","threshold":7.35,"reasoning":"rate breached","recommendation":"pause trades","confidence":0.95}`;
  const result = parseAnalysisResponse(input);
  assert.strictEqual(result.level, RiskLevel.HIGH);
  assert.strictEqual(result.threshold, 7.35);
  assert.strictEqual(result.reasoning, "rate breached");
  assert.strictEqual(result.confidence, 0.95);
});

test("解析带 markdown 围栏的 JSON", () => {
  const input = "```json\n{\"level\":\"CRITICAL\",\"threshold\":7.5,\"reasoning\":\"x\",\"recommendation\":\"y\",\"confidence\":0.9}\n```";
  const result = parseAnalysisResponse(input);
  assert.strictEqual(result.level, RiskLevel.CRITICAL);
  assert.strictEqual(result.threshold, 7.5);
});

test("解析前后有文字的 JSON", () => {
  const input = `Based on my analysis, here is the risk assessment:\n{"level":"MEDIUM","threshold":7.3,"reasoning":"approaching","recommendation":"monitor","confidence":0.8}\nHope this helps.`;
  const result = parseAnalysisResponse(input);
  assert.strictEqual(result.level, RiskLevel.MEDIUM);
});

test("confidence 超出 [0,1] 会被夹紧", () => {
  const overInput = `{"level":"LOW","threshold":1,"reasoning":"","recommendation":"","confidence":1.5}`;
  assert.strictEqual(parseAnalysisResponse(overInput).confidence, 1);

  const underInput = `{"level":"LOW","threshold":1,"reasoning":"","recommendation":"","confidence":-0.3}`;
  assert.strictEqual(parseAnalysisResponse(underInput).confidence, 0);
});

test("未知 level 回退到 LOW", () => {
  const input = `{"level":"UNKNOWN","threshold":1,"reasoning":"","recommendation":"","confidence":0.5}`;
  assert.strictEqual(parseAnalysisResponse(input).level, RiskLevel.LOW);
});

test("threshold 缺失回退到 0", () => {
  const input = `{"level":"HIGH","reasoning":"x","recommendation":"y","confidence":0.9}`;
  assert.strictEqual(parseAnalysisResponse(input).threshold, 0);
});

test("无效输入抛出错误", () => {
  assert.throws(() => parseAnalysisResponse("no json here"));
});

// ==========================================================
// FXSimulator 测试
// ==========================================================

import { generateHistoricalQuotes, RISK_THRESHOLDS, generateMarketSnapshot } from "../../src/data/fxSimulator";

console.log("\nfxSimulator");

test("generateHistoricalQuotes 返回正确数量", () => {
  const quotes = generateHistoricalQuotes("USD/CNY", 20, 60_000, "normal");
  assert.strictEqual(quotes.length, 20);
});

test("每条 quote 结构完整", () => {
  const quotes = generateHistoricalQuotes("USD/CNY", 5, 60_000, "normal");
  for (const q of quotes) {
    assert.strictEqual(q.currencyPair, "USD/CNY");
    assert.ok(typeof q.bid === "number");
    assert.ok(typeof q.ask === "number");
    assert.ok(typeof q.mid === "number");
    assert.ok(q.ask > q.bid, "ask 必须大于 bid");
    assert.ok(q.mid >= q.bid && q.mid <= q.ask, "mid 在 bid-ask 之间");
  }
});

test("时间戳递增（从旧到新）", () => {
  const quotes = generateHistoricalQuotes("USD/CNY", 10, 60_000, "normal");
  for (let i = 1; i < quotes.length; i++) {
    assert.ok(
      quotes[i].timestamp > quotes[i - 1].timestamp,
      `时间戳应递增：第 ${i} 条 ${quotes[i].timestamp} vs 第 ${i - 1} 条 ${quotes[i - 1].timestamp}`
    );
  }
});

test("crisis 场景波动大于 normal", () => {
  // 用同一货币对和数量，对比两种场景的最大跨度
  const normalQuotes = generateHistoricalQuotes("USD/CNY", 20, 60_000, "normal");
  const crisisQuotes = generateHistoricalQuotes("USD/CNY", 20, 60_000, "crisis");

  const normalRange = Math.max(...normalQuotes.map((q) => q.mid)) - Math.min(...normalQuotes.map((q) => q.mid));
  const crisisRange = Math.max(...crisisQuotes.map((q) => q.mid)) - Math.min(...crisisQuotes.map((q) => q.mid));

  assert.ok(
    crisisRange > normalRange,
    `crisis 跨度 ${crisisRange.toFixed(6)} 应大于 normal 跨度 ${normalRange.toFixed(6)}`
  );
});

test("generateMarketSnapshot 覆盖全部配置的货币对", () => {
  const snapshot = generateMarketSnapshot();
  const expectedPairs = Object.keys(RISK_THRESHOLDS);
  const actualPairs = snapshot.map((q) => q.currencyPair);

  assert.strictEqual(snapshot.length, expectedPairs.length);
  for (const pair of expectedPairs) {
    assert.ok(actualPairs.includes(pair), `缺少货币对 ${pair}`);
  }
});

// ==========================================================
// Session Summary 测试
// ==========================================================

import { buildSessionSummary } from "../../src/agent/sessionSummary";

console.log("\nsessionSummary");

test("构建 session summary 含所有字段", () => {
  // tokenId 使用 bigint 保持 uint256 全精度（参考 agentRegistry / index.ts 的类型约定）
  const summary = buildSessionSummary({
    agentId: "fx-risk-agent-v0.2",
    agentTokenId: 0n,
    sessionId: "abc-123",
    aiBackend: "doubao",
    processedPairs: ["USD/CNY", "EUR/USD"],
    decisionLogRootHashes: ["0xhash1", "0xhash2"],
  });

  assert.strictEqual(summary.agentId, "fx-risk-agent-v0.2");
  assert.strictEqual(summary.agentTokenId, 0n);
  assert.strictEqual(summary.sessionId, "abc-123");
  assert.strictEqual(summary.aiBackend, "doubao");
  assert.deepStrictEqual(summary.processedPairs, ["USD/CNY", "EUR/USD"]);
  assert.deepStrictEqual(summary.decisionLogRootHashes, ["0xhash1", "0xhash2"]);
  assert.strictEqual(summary.alertCount, 2);
  assert.ok(summary.createdAt);
});

test("alertCount 等于 rootHashes 数量", () => {
  const summary = buildSessionSummary({
    agentId: "x",
    agentTokenId: 0n,
    sessionId: "s1",
    aiBackend: "0g-compute",
    processedPairs: ["USD/CNY", "EUR/USD", "GBP/USD"],
    decisionLogRootHashes: ["0x1", "0x2", "0x3", "0x4"],
  });

  assert.strictEqual(summary.alertCount, 4);
});

// ==========================================================
// Summary
// ==========================================================

console.log("\n" + "=".repeat(50));
console.log(`  Tests: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`);
console.log("=".repeat(50));

if (failed > 0) {
  process.exit(1);
}
