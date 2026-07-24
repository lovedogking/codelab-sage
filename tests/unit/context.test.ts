import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessagesTokens,
  calculateContextStats,
  formatContextSize,
  formatContextIndicator,
} from '../../src/utils/context.js';
import type { Message } from '../../src/types/index.js';

describe('context utils', () => {
  it('estimateTokens approximates by character count', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('estimateMessagesTokens sums message contents', () => {
    const messages: Message[] = [
      { role: 'system', content: 'abcd' },
      { role: 'user', content: 'abcdefgh' },
    ];
    expect(estimateMessagesTokens(messages)).toBe(3);
  });

  it('calculateContextStats returns percentage and formatted text', () => {
    const messages: Message[] = [{ role: 'user', content: 'a'.repeat(4000) }];
    const stats = calculateContextStats(messages, 128000);
    expect(stats.used).toBe(1000);
    expect(stats.limit).toBe(128000);
    expect(stats.percentage).toBeCloseTo(0.78125, 4);
    expect(stats.usedText).toBe('1k');
    expect(stats.limitText).toBe('128k');
  });

  it('formatContextSize formats thousands', () => {
    expect(formatContextSize(900)).toBe('900');
    expect(formatContextSize(1000)).toBe('1k');
    expect(formatContextSize(100600)).toBe('100.6k');
    expect(formatContextSize(128000)).toBe('128k');
  });

  it('formatContextIndicator renders the status text', () => {
    const stats = {
      used: 100600,
      limit: 262100,
      percentage: 38.4,
      usedText: '100.6k',
      limitText: '262.1k',
    };
    expect(formatContextIndicator(stats)).toBe('context: 38.4% (100.6k/262.1k)');
  });
});
