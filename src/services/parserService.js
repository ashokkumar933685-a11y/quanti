'use strict';

const { DEFAULT_CATEGORY } = require('../config/categories');
const {
  MERCHANT_KEYWORDS,
  REWARD_PARTNERS,
  CASHBACK_KEYWORD,
  REWARD_POINT_RATE,
} = require('../config/keywords');

/**
 * Words that indicate money LEAVING the account (outbound / debit).
 */
const DEBIT_HINTS = ['paid', 'sent', 'debited', 'spent', 'withdrawn', 'purchase', 'debit'];

/**
 * Words that indicate money ENTERING the account (inbound / credit).
 */
const CREDIT_HINTS = ['received', 'credited', 'refund', 'deposited', 'credit'];

/**
 * Extract the numeric amount from a raw alert.
 * Handles formats like "Rs. 250", "Rs.1,200", "INR 99.50", "₹500".
 * @returns {number|null}
 */
function extractAmount(text) {
  const match = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const cleaned = match[1].replace(/,/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Find the position of the first whole-word hint from `hints` in `text`,
 * or Infinity if none match. Word boundaries stop false positives like
 * "credit" matching inside "credit card".
 */
function firstHintIndex(text, hints) {
  let best = Infinity;
  for (const hint of hints) {
    const match = text.match(new RegExp(`\\b${hint}\\b`, 'i'));
    if (match && match.index < best) best = match.index;
  }
  return best;
}

/**
 * Determine whether a transaction is a 'credit' (incoming) or 'debit'
 * (outbound). The directional keyword that appears EARLIEST in the alert
 * wins (UPI alerts lead with the action verb, e.g. "Paid ... credit card").
 * Defaults to 'debit' when ambiguous (conservative for a spend tracker).
 * @returns {'credit'|'debit'}
 */
function detectDirection(text) {
  const creditAt = firstHintIndex(text, CREDIT_HINTS);
  const debitAt = firstHintIndex(text, DEBIT_HINTS);
  if (creditAt === Infinity && debitAt === Infinity) return 'debit';
  return creditAt < debitAt ? 'credit' : 'debit';
}

/**
 * Scan the alert for a known corporate merchant keyword and return the
 * matched merchant + its fallback category.
 * @returns {{ merchant: string, category: string }|null}
 */
function detectMerchant(text) {
  const lower = text.toLowerCase();
  for (const entry of MERCHANT_KEYWORDS) {
    if (lower.includes(entry.keyword.toLowerCase())) {
      return { merchant: entry.keyword, category: entry.category };
    }
  }
  return null;
}

/**
 * Detect whether an OUTBOUND alert qualifies for the simulated rewards
 * sub-metric: it must contain the word "Cashback" or a known reward partner.
 * @returns {{ trigger: string }|null}
 */
function detectRewardTrigger(text) {
  const lower = text.toLowerCase();
  if (lower.includes(CASHBACK_KEYWORD.toLowerCase())) {
    return { trigger: CASHBACK_KEYWORD };
  }
  const partner = REWARD_PARTNERS.find((p) => lower.includes(p.toLowerCase()));
  return partner ? { trigger: partner } : null;
}

/**
 * Build the green "Expected Savings" sub-metric for a qualifying outbound
 * transaction. Points are simulated as a fixed percentage of the spend.
 */
function buildExpectedSavings(amount, trigger) {
  const points = Math.max(1, Math.round(amount * REWARD_POINT_RATE));
  return {
    trigger,
    points,
    message: `Expected Savings: +${points} reward points via ${trigger}`,
  };
}

/**
 * Produce a clean, human-readable description from the raw alert.
 * Falls back to the trimmed raw message.
 */
function buildDescription(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parse a raw transaction alert string into a structured, categorized
 * transaction object. This is the single source of truth for all
 * automated tagging and reward detection.
 *
 * @param {string} rawMessage
 * @returns {object} parsed transaction (without id/timestamp)
 */
function parseAlert(rawMessage) {
  if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
    throw new Error('rawMessage must be a non-empty string');
  }

  const text = rawMessage.trim();
  const amount = extractAmount(text);

  if (amount === null) {
    throw new Error('Could not detect a transaction amount in the alert');
  }

  const direction = detectDirection(text);
  const merchantMatch = detectMerchant(text);

  // Auto-tagging: a detected merchant wins; otherwise income defaults to
  // SALARY only when explicitly matched, else everything is MISC.
  const category = merchantMatch ? merchantMatch.category : DEFAULT_CATEGORY;
  const autoTagged = Boolean(merchantMatch);

  // Reward / savings rule applies ONLY to outbound (debit) transactions.
  let expectedSavings = null;
  if (direction === 'debit') {
    const reward = detectRewardTrigger(text);
    if (reward) {
      expectedSavings = buildExpectedSavings(amount, reward.trigger);
    }
  }

  return {
    rawMessage: text,
    description: buildDescription(text),
    amount,
    direction,
    category,
    autoTagged,
    merchant: merchantMatch ? merchantMatch.merchant : null,
    expectedSavings,
  };
}

module.exports = {
  parseAlert,
  extractAmount,
  detectDirection,
  detectMerchant,
  detectRewardTrigger,
  buildExpectedSavings,
};
