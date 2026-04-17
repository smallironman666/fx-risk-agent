import { createClient, decodeReport, LogLevel } from "@chainlink/data-streams-sdk";

/**
 * L0 数据源：Chainlink Data Streams
 *
 * 策略定位：三层 fallback 架构的最高层（L0）—— 亚秒级事件驱动数据
 *   L0 Chainlink Data Streams  ← 本模块
 *   L1 fawazahmed0 CDN           (fxRealData.ts)
 *   L2 Frankfurter / ECB         (fxRealData.ts)
 *   L3 本地缓存                   (fxRealData.ts)
 *
 * 启用条件：
 *   - 设置环境变量 CHAINLINK_API_KEY + CHAINLINK_USER_SECRET
 *   - 在 CHAINLINK_FEEDS 里配置 pair → feedId 映射
 *   任一缺失 → 本层静默不可用，上层 fallback 接手
 *
 * Dragon 2026-04-17 官方确认：Data Streams 在 Galileo testnet + Aristotle
 * mainnet 都可用，Verifier Proxy 合约已部署。"For scenarios like the FX
 * Risk Agent, Data Streams are the correct choice."
 *
 * 应用流程：见 docs/CHAINLINK_DATA_STREAMS_SETUP.md
 */

/** Feed 配置：env var 格式 "USD/CNH=0xfeedId1,EUR/USD=0xfeedId2" */
interface FeedConfig {
  pair: string;
  feedId: string;
}

function parseFeedConfig(): FeedConfig[] {
  const raw = process.env.CHAINLINK_FEEDS || "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((kv) => kv.trim())
    .filter(Boolean)
    .map((kv) => {
      const [pair, feedId] = kv.split("=").map((s) => s.trim());
      if (!pair || !feedId) throw new Error(`Invalid CHAINLINK_FEEDS entry: "${kv}"`);
      return { pair: pair.toUpperCase(), feedId };
    });
}

/**
 * 把 Chainlink 的 benchmark price 转换为我们 rates 表的规约：
 *   我们的规约: rates[lowercase_quote] = "1 USD 能换多少 quote"
 *   即 USD base 的报价保持原样，X/USD 型（quote=USD）要取倒数
 *
 * @param pair 如 "EUR/USD" 或 "USD/CNH"
 * @param benchmarkPrice Chainlink 的 v3 benchmark price（人类可读数值，已除过 1e18）
 */
function pairPriceToRate(
  pair: string,
  benchmarkPrice: number
): { currency: string; rate: number } | null {
  const [base, quote] = pair.split("/");
  if (!base || !quote) return null;

  if (base === "USD") {
    // USD/X 形式：price 就是 "1 USD 能换多少 X"
    return { currency: quote.toLowerCase(), rate: benchmarkPrice };
  }
  if (quote === "USD") {
    // X/USD 形式：price 是 "1 X 能换多少 USD"，取倒数存到 rates[x]
    return { currency: base.toLowerCase(), rate: 1 / benchmarkPrice };
  }
  // 交叉盘直接存（resolvePairRate 会按 base/quote 兜底 via USD）
  // 这里返回 null 让 fxRealData 的交叉盘计算走 USD 中转
  return null;
}

export interface ChainlinkRatesResult {
  rates: Record<string, number>;
  /** 每对具体哪个 feed 给出、验证时间戳 */
  pairMeta: Record<string, { feedId: string; observedAt: number }>;
}

/**
 * 拉取所有已配置 feed 的最新报价，聚合成 fxRealData 需要的格式
 * 设计：只要有 1 条 feed 成功就返回部分结果；全部失败抛出让上层 fallback
 */
export async function fetchFromChainlinkDataStreams(
  timeoutMs = 5000
): Promise<ChainlinkRatesResult> {
  const apiKey = process.env.CHAINLINK_API_KEY;
  const userSecret = process.env.CHAINLINK_USER_SECRET;
  const endpoint =
    process.env.CHAINLINK_ENDPOINT || "https://api.testnet-dataengine.chain.link";
  const wsEndpoint =
    process.env.CHAINLINK_WS_ENDPOINT || "wss://ws.testnet-dataengine.chain.link";

  if (!apiKey || !userSecret) {
    throw new Error("Chainlink credentials not configured (CHAINLINK_API_KEY / CHAINLINK_USER_SECRET)");
  }

  const feeds = parseFeedConfig();
  if (feeds.length === 0) {
    throw new Error("No Chainlink feeds configured (CHAINLINK_FEEDS)");
  }

  const client = createClient({
    apiKey,
    userSecret,
    endpoint,
    wsEndpoint,
    logging: { logger: console, logLevel: LogLevel.WARN },
  });

  const rates: Record<string, number> = {};
  const pairMeta: Record<string, { feedId: string; observedAt: number }> = {};

  // 并发拉，单条失败不影响其他
  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const report = await Promise.race([
        client.getLatestReport(f.feedId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Chainlink timeout ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      const decoded = decodeReport(report.fullReport, report.feedID) as any;

      // v3 crypto schema: benchmarkPrice 是 18 位定点大整数
      const rawPrice = decoded?.data?.benchmarkPrice;
      if (rawPrice === undefined || rawPrice === null) {
        throw new Error(`Feed ${f.pair} returned no benchmarkPrice`);
      }
      const priceFloat = Number(BigInt(rawPrice.toString())) / 1e18;

      const conv = pairPriceToRate(f.pair, priceFloat);
      if (!conv) {
        throw new Error(`Cross-pair ${f.pair} not supported by pairPriceToRate`);
      }

      return {
        pair: f.pair,
        feedId: f.feedId,
        currency: conv.currency,
        rate: conv.rate,
        observedAt: Number(report.observationsTimestamp) * 1000,
      };
    })
  );

  let successes = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      const { pair, feedId, currency, rate, observedAt } = r.value;
      rates[currency] = rate;
      pairMeta[pair] = { feedId, observedAt };
      successes++;
    } else {
      errors.push(r.reason?.message || String(r.reason));
    }
  }

  if (successes === 0) {
    throw new Error(
      `All Chainlink feeds failed: ${errors.slice(0, 3).join("; ")}`
    );
  }

  return { rates, pairMeta };
}
