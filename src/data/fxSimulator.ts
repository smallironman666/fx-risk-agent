import { FXQuote, RiskThreshold } from "../agent/types";

/**
 * 模拟外汇行情数据生成器
 * 基于真实汇率基准 + 随机波动，模拟跨境支付场景下的FX行情
 *
 * 用于 --scenario normal/volatile/crisis 压力测试路径。
 * 真实数据请走 fxRealData.ts（--scenario real），由 fawazahmed0/Frankfurter 提供。
 */

// 真实基准汇率（2026年4月近似值，覆盖全球主要跨境支付走廊）
const BASE_RATES: Record<string, number> = {
  // ===== G10 主流 =====
  "EUR/USD": 1.08,
  "GBP/USD": 1.26,
  "USD/JPY": 152.5,
  "AUD/USD": 0.63,
  "USD/CAD": 1.40,
  "USD/CHF": 0.90,

  // ===== 亚太跨境支付核心 =====
  "USD/CNY": 7.25,   // 中国
  "USD/HKD": 7.80,   // 香港（联系汇率 7.75-7.85）
  "USD/SGD": 1.27,   // 新加坡（0G 所在地）
  "USD/KRW": 1380,   // 韩国
  "USD/INR": 84,     // 印度（全球最大汇款走廊）
  "USD/MYR": 4.48,   // 马来西亚
  "USD/PHP": 57,     // 菲律宾
  "USD/THB": 34,     // 泰国
  "USD/IDR": 16000,  // 印尼
  "USD/TWD": 32.5,   // 台湾
  "USD/VND": 25000,  // 越南

  // ===== 北美拉美 =====
  "USD/MXN": 17.0,   // 墨西哥（美国-拉美最大走廊）
};

// 风险阈值配置（针对跨境支付场景，阈值约为基准价 ±3-5%；联系汇率币种例外）
export const RISK_THRESHOLDS: Record<string, RiskThreshold> = {
  // ===== G10 主流 =====
  "EUR/USD":  { currencyPair: "EUR/USD",  upperBound: 1.12,   lowerBound: 1.04,   volatilityMax: 0.8 },
  "GBP/USD":  { currencyPair: "GBP/USD",  upperBound: 1.30,   lowerBound: 1.22,   volatilityMax: 0.9 },
  "USD/JPY":  { currencyPair: "USD/JPY",  upperBound: 158.0,  lowerBound: 148.0,  volatilityMax: 1.0 },
  "AUD/USD":  { currencyPair: "AUD/USD",  upperBound: 0.67,   lowerBound: 0.59,   volatilityMax: 0.9 },
  "USD/CAD":  { currencyPair: "USD/CAD",  upperBound: 1.45,   lowerBound: 1.34,   volatilityMax: 0.6 },
  "USD/CHF":  { currencyPair: "USD/CHF",  upperBound: 0.95,   lowerBound: 0.85,   volatilityMax: 0.7 },

  // ===== 亚太跨境支付核心 =====
  "USD/CNY":  { currencyPair: "USD/CNY",  upperBound: 7.35,   lowerBound: 7.15,   volatilityMax: 0.5 },
  "USD/HKD":  { currencyPair: "USD/HKD",  upperBound: 7.85,   lowerBound: 7.75,   volatilityMax: 0.1 }, // 联系汇率
  "USD/SGD":  { currencyPair: "USD/SGD",  upperBound: 1.36,   lowerBound: 1.24,   volatilityMax: 0.5 },
  "USD/KRW":  { currencyPair: "USD/KRW",  upperBound: 1420,   lowerBound: 1300,   volatilityMax: 1.5 },
  "USD/INR":  { currencyPair: "USD/INR",  upperBound: 87.0,   lowerBound: 81.0,   volatilityMax: 0.7 },
  "USD/MYR":  { currencyPair: "USD/MYR",  upperBound: 4.80,   lowerBound: 4.20,   volatilityMax: 0.8 },
  "USD/PHP":  { currencyPair: "USD/PHP",  upperBound: 60.0,   lowerBound: 54.0,   volatilityMax: 0.8 },
  "USD/THB":  { currencyPair: "USD/THB",  upperBound: 36.0,   lowerBound: 32.0,   volatilityMax: 0.8 },
  "USD/IDR":  { currencyPair: "USD/IDR",  upperBound: 16800,  lowerBound: 15200,  volatilityMax: 1.0 },
  "USD/TWD":  { currencyPair: "USD/TWD",  upperBound: 33.5,   lowerBound: 31.5,   volatilityMax: 0.6 },
  "USD/VND":  { currencyPair: "USD/VND",  upperBound: 26000,  lowerBound: 24000,  volatilityMax: 0.8 },

  // ===== 北美拉美 =====
  "USD/MXN":  { currencyPair: "USD/MXN",  upperBound: 18.5,   lowerBound: 15.5,   volatilityMax: 1.5 },
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
