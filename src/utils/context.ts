import type { Message } from '../types/index.js';

/**
 * Very rough token estimator. When no tokenizer is available we approximate
 * 1 token ≈ 4 characters for mixed CJK / Latin text. This is only used for
 * the context progress indicator and compaction, not for billing.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content);
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.name);
        total += estimateTokens(JSON.stringify(tc.arguments));
      }
    }
  }
  return total;
}

export interface ContextStats {
  used: number;
  limit: number;
  percentage: number;
  usedText: string;
  limitText: string;
}

export function calculateContextStats(messages: Message[], limit: number): ContextStats {
  const used = estimateMessagesTokens(messages);
  const percentage = limit > 0 ? (used / limit) * 100 : 0;
  return {
    used,
    limit,
    percentage,
    usedText: formatContextSize(used),
    limitText: formatContextSize(limit),
  };
}

/**
 * Format a token count like 100600 as "100.6k", 900 as "900".
 */
export function formatContextSize(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    // Show one decimal when it is not a whole number.
    const rounded = Math.round(k * 10) / 10;
    return `${rounded}k`;
  }
  return String(n);
}

/**
 * Format the context indicator shown in the status bar.
 */
export function formatContextIndicator(stats: ContextStats): string {
  const pct = stats.percentage.toFixed(1);
  return `context: ${pct}% (${stats.usedText}/${stats.limitText})`;
}
