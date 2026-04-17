import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { FXQuote } from "../agent/types";

/**
 * 真实 FX 数据源（三层 fallback 架构）
 *
 * 层级设计（参考真实金融系统对数据源的标准做法）：
 *   L1 主源：fawazahmed0 CDN      （jsDelivr，无限制无 key，200+ 币种）
 *   L2 备源：Frankfurter API      （ECB + 40 央行权威数据）
 *   L3 保底：本地缓存 + 告警       （最近一次成功的拉取）
 *
 * 为何这样分层：
 *   - L1 是 CDN 静态文件，全球低延迟、高可用
 *   - L2 是 ECB 官方权威源，数据可信度最高（监管合规场景的 fallback）
 *   - L3 保证即便两个外部源全挂，agent 仍能用最近已知数据继续决策（降级可用）
 *
 * 未来升级路径：主网迁移后 L1 切换为 Chainlink Data Streams（秒级推送），
 * Frankfurter 继续作为 L2 合规校验源。
 */

const CACHE_DIR = join(process.cwd(), ".cache");
const CACHE_PATH = join(CACHE_DIR, "fx-rates.json");
const FETCH_TIMEOUT_MS = 5_000;

export type RealDataSource = "fawazahmed0" | "frankfurter" | "local-cache";

interface RatesCache {
  /** 以 USD 为基准的汇率表，key 为小写货币代码，如 rates.jpy = 152.5 */
  rates: Record<string, number>;
  /** 本次数据的实际来源 */
  source: RealDataSource;
  /** 拉取成功时的 epoch 毫秒 */
  fetchedAt: number;
}

export interface RealRatesResult {
  rates: Record<string, number>;
  source: RealDataSource;
  fetchedAt: number;
  /** 若走到 cache 层，标记 cache age（小时） */
  cacheAgeHours?: number;
}

/**
 * L1：fawazahmed0 CDN
 * 返回数据结构示例：{ date: "2026-04-16", usd: { jpy: 152.5, cny: 7.25, ... } }
 */
async function fetchFromFawazahmed0(): Promise<Record<string, number>> {
  const url =
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = (await res.json()) as { usd?: Record<string, number> };
  if (!data.usd || typeof data.usd !== "object") {
    throw new Error("Malformed response: missing 'usd' field");
  }
  return data.usd;
}

/**
 * L2：Frankfurter API（ECB 权威）
 * 返回数据结构示例：{ base: "USD", rates: { JPY: 152.5, CNY: 7.25, ... } }
 * 注意：Frankfurter 返回的货币代码是大写，需要统一转小写以对齐 L1
 */
async function fetchFromFrankfurter(): Promise<Record<string, number>> {
  const url =
    "https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY,CNY,EUR,GBP,HKD,SGD";
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = (await res.json()) as { rates?: Record<string, number> };
  if (!data.rates || typeof data.rates !== "object") {
    throw new Error("Malformed response: missing 'rates' field");
  }

  const normalized: Record<string, number> = {};
  for (const [code, value] of Object.entries(data.rates)) {
    normalized[code.toLowerCase()] = value;
  }
  return normalized;
}

function loadCache(): RatesCache | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const raw = readFileSync(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as RatesCache;
    if (!parsed.rates || !parsed.fetchedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(rates: Record<string, number>, source: RealDataSource): void {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    const cache: RatesCache = { rates, source, fetchedAt: Date.now() };
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (err: any) {
    // 缓存写入失败不应阻塞主流程，仅告警
    console.warn(`[Data] Cache write failed: ${err.message}`);
  }
}

/**
 * 三层 fallback 拉取最新汇率
 * @throws Error 当所有三层都失败时（主 + 备 + 无缓存）
 */
export async function fetchRealRates(): Promise<RealRatesResult> {
  // L1: fawazahmed0
  try {
    const rates = await fetchFromFawazahmed0();
    saveCache(rates, "fawazahmed0");
    return { rates, source: "fawazahmed0", fetchedAt: Date.now() };
  } catch (err: any) {
    console.warn(`[Data] L1 fawazahmed0 failed: ${err.message}, falling back to L2`);
  }

  // L2: Frankfurter
  try {
    const rates = await fetchFromFrankfurter();
    saveCache(rates, "frankfurter");
    return { rates, source: "frankfurter", fetchedAt: Date.now() };
  } catch (err: any) {
    console.warn(`[Data] L2 frankfurter failed: ${err.message}, falling back to L3`);
  }

  // L3: local cache
  const cached = loadCache();
  if (cached) {
    const ageHours = (Date.now() - cached.fetchedAt) / (1000 * 60 * 60);
    console.warn(
      `[Data] L3 using local cache (age: ${ageHours.toFixed(1)}h, origin: ${cached.source})`
    );
    return {
      rates: cached.rates,
      source: "local-cache",
      fetchedAt: cached.fetchedAt,
      cacheAgeHours: ageHours,
    };
  }

  throw new Error(
    "All FX data sources exhausted: L1 fawazahmed0 + L2 frankfurter failed and no local cache available"
  );
}

/**
 * 从汇率表中解析指定 pair 的汇率
 * 支持三种形式：
 *   - USD/X：直接取 rates[x]
 *   - X/USD：取 1 / rates[x]
 *   - X/Y：通过 USD 交叉计算 rates[y] / rates[x]
 */
export function resolvePairRate(
  pair: string,
  rates: Record<string, number>
): number {
  const [base, quote] = pair.split("/");
  if (!base || !quote) {
    throw new Error(`Invalid pair format: "${pair}" (expected "BASE/QUOTE")`);
  }

  const b = base.toLowerCase();
  const q = quote.toLowerCase();

  if (b === "usd") {
    const rate = rates[q];
    if (!rate) throw new Error(`Quote currency "${quote}" not in rates`);
    return rate;
  }

  if (q === "usd") {
    const rate = rates[b];
    if (!rate) throw new Error(`Base currency "${base}" not in rates`);
    return 1 / rate;
  }

  // 交叉盘：X/Y = (USD/Y) / (USD/X)
  const rateBase = rates[b];
  const rateQuote = rates[q];
  if (!rateBase || !rateQuote) {
    throw new Error(
      `Cannot compute "${pair}": missing ${!rateBase ? base : quote} in rates`
    );
  }
  return rateQuote / rateBase;
}

/**
 * 基于真实数据生成历史报价（用于 AI 分析）
 *
 * 真实 API 只提供"当前"汇率，历史回溯需要付费 tier。
 * 这里的做法：以真实当前汇率为锚点，生成 N 个数据点，带小幅随机噪声
 * 模拟近期市场波动（真实盘内 tick）。
 *
 * 波动参数（0.05% / tick）远小于 simulator 的 crisis 场景（0.5%+），
 * 所以 "real" 场景下 AI 判断更贴近真实市场环境——不会被人造极端值带偏。
 */
export async function generateRealHistoricalQuotes(
  pair: string,
  count: number = 20,
  intervalMs: number = 60_000
): Promise<{ quotes: FXQuote[]; source: RealDataSource; cacheAgeHours?: number }> {
  const result = await fetchRealRates();
  const baseRate = resolvePairRate(pair, result.rates);

  const spread = baseRate * 0.0002; // 2 pips
  const tickVolatility = baseRate * 0.0005; // 真实盘内小波动（0.05%）

  const now = Date.now();
  const quotes: FXQuote[] = [];

  for (let i = 0; i < count; i++) {
    const shift = (Math.random() - 0.5) * 2 * tickVolatility;
    const mid = Number((baseRate + shift).toFixed(6));
    quotes.push({
      currencyPair: pair,
      bid: Number((mid - spread / 2).toFixed(6)),
      ask: Number((mid + spread / 2).toFixed(6)),
      mid,
      timestamp: now - (count - i) * intervalMs,
      source: `REAL_${result.source.toUpperCase()}`,
    });
  }

  return {
    quotes,
    source: result.source,
    cacheAgeHours: result.cacheAgeHours,
  };
}
