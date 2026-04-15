import { FXQuote, RiskThreshold } from "../agent/types";

/**
 * 模拟外汇行情数据生成器
 * 基于真实汇率基准 + 随机波动，模拟跨境支付场景下的FX行情
 */

// 真实基准汇率（2026年4月近似值）
const BASE_RATES: Record<string, number> = {
  "USD/CNY": 7.25,
  "EUR/USD": 1.08,
  "GBP/USD": 1.26,
  "USD/JPY": 152.5,
  "USD/HKD": 7.80,
  "USD/SGD": 1.35,
};

// 风险阈值配置（模拟跨境支付场景）
export const RISK_THRESHOLDS: Record<string, RiskThreshold> = {
  "USD/CNY": {
    currencyPair: "USD/CNY",
    upperBound: 7.35,
    lowerBound: 7.15,
    volatilityMax: 0.5,
  },
  "EUR/USD": {
    currencyPair: "EUR/USD",
    upperBound: 1.12,
    lowerBound: 1.04,
    volatilityMax: 0.8,
  },
  "GBP/USD": {
    currencyPair: "GBP/USD",
    upperBound: 1.30,
    lowerBound: 1.22,
    volatilityMax: 0.9,
  },
  "USD/JPY": {
    currencyPair: "USD/JPY",
    upperBound: 158.0,
    lowerBound: 148.0,
    volatilityMax: 1.0,
  },
};

/**
 * 生成一个带随机波动的FX报价
 */
function generateQuote(pair: string, volatilityMultiplier: number = 1): FXQuote {
  const baseRate = BASE_RATES[pair] || 1.0;
  const spread = baseRate * 0.0002; // 2 pips
  const volatility = baseRate * 0.002 * volatilityMultiplier; // 基础波动20 pips

  const randomShift = (Math.random() - 0.5) * 2 * volatility;
  const mid = baseRate + randomShift;

  const midFixed = Number(mid.toFixed(6));
  return {
    currencyPair: pair,
    bid: Number((midFixed - spread / 2).toFixed(6)),
    ask: Number((midFixed + spread / 2).toFixed(6)),
    mid: midFixed,
    timestamp: Date.now(),
    source: "FX_SIMULATOR",
  };
}

/**
 * 生成一组FX行情快照（模拟某一时刻所有监控货币对的报价）
 */
export function generateMarketSnapshot(volatilityMultiplier: number = 1): FXQuote[] {
  return Object.keys(RISK_THRESHOLDS).map((pair) =>
    generateQuote(pair, volatilityMultiplier)
  );
}

/**
 * 生成一段时间窗口的历史行情（用于AI分析趋势）
 * @param pair 货币对
 * @param count 数据点数量
 * @param intervalMs 间隔毫秒数
 * @param scenario 场景: normal | volatile | crisis
 */
export function generateHistoricalQuotes(
  pair: string,
  count: number = 20,
  intervalMs: number = 60_000,
  scenario: "normal" | "volatile" | "crisis" = "normal"
): FXQuote[] {
  const volatilityMap = { normal: 1, volatile: 3, crisis: 8 };
  const multiplier = volatilityMap[scenario];

  const now = Date.now();
  const quotes: FXQuote[] = [];

  // 模拟趋势：crisis场景下有方向性偏移
  let trendBias = 0;
  if (scenario === "crisis") {
    trendBias = (BASE_RATES[pair] || 1) * 0.005; // 持续上行压力
  }

  for (let i = 0; i < count; i++) {
    const quote = generateQuote(pair, multiplier);
    quote.timestamp = now - (count - i) * intervalMs;

    if (scenario === "crisis") {
      const progress = i / count;
      quote.mid = Number((quote.mid + trendBias * progress).toFixed(6));
      // bid/ask 同样按 6 位小数规整，保持与 generateQuote 一致
      quote.bid = Number((quote.mid - (BASE_RATES[pair] || 1) * 0.0001).toFixed(6));
      quote.ask = Number((quote.mid + (BASE_RATES[pair] || 1) * 0.0001).toFixed(6));
    }

    quotes.push(quote);
  }

  return quotes;
}
