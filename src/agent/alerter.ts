import { RiskAssessment, RiskLevel } from "./types";

/**
 * 风险告警通知
 * HIGH/CRITICAL时通过Webhook通知运营团队
 */

const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || "";

interface AlertPayload {
  pair: string;
  level: string;
  rate: number;
  reasoning: string;
  recommendation: string;
  confidence: number;
  timestamp: string;
}

/**
 * 判断是否需要告警并发送通知
 * @returns true 如果发送了告警
 */
export async function checkAndAlert(assessment: RiskAssessment): Promise<boolean> {
  if (assessment.level < RiskLevel.HIGH) {
    return false;
  }

  const levelLabel = RiskLevel[assessment.level];
  const payload: AlertPayload = {
    pair: assessment.currencyPair,
    level: levelLabel,
    rate: assessment.spotRate,
    reasoning: assessment.reasoning,
    recommendation: assessment.recommendation,
    confidence: assessment.confidence,
    timestamp: new Date().toISOString(),
  };

  console.log(`[Alert] ${levelLabel} risk detected for ${assessment.currencyPair}!`);

  // Webhook通知
  if (WEBHOOK_URL) {
    try {
      const resp = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: {
            title: `FX Alert: ${assessment.currencyPair} ${levelLabel}`,
            text: formatAlertMessage(payload),
          },
          // 通用JSON格式（兼容Slack/自定义Webhook）
          text: formatAlertMessage(payload),
          ...payload,
        }),
      });
      console.log(`[Alert] Webhook sent, status: ${resp.status}`);
    } catch (err: any) {
      console.error(`[Alert] Webhook failed: ${err.message}`);
    }
  } else {
    console.log("[Alert] No ALERT_WEBHOOK_URL configured, skipping webhook");
  }

  // 始终在终端输出醒目告警
  console.log(`\n  *** ${levelLabel} ALERT: ${assessment.currencyPair} ***`);
  console.log(`  Rate: ${assessment.spotRate}`);
  console.log(`  Action: ${assessment.recommendation}\n`);

  return true;
}

function formatAlertMessage(p: AlertPayload): string {
  return [
    `## FX Risk Alert: ${p.pair}`,
    `- **Level**: ${p.level}`,
    `- **Rate**: ${p.rate}`,
    `- **Confidence**: ${(p.confidence * 100).toFixed(0)}%`,
    `- **Analysis**: ${p.reasoning}`,
    `- **Recommendation**: ${p.recommendation}`,
    `- **Time**: ${p.timestamp}`,
  ].join("\n");
}
