'use strict';

const { DEFAULT_CATEGORY } = require('../config/categories');
const {
  MERCHANT_KEYWORDS,
  DIRECTION_VERBS,
  DIRECTION_GUARDS,
  FRAUD_SIGNALS,
  REWARD_PARTNERS,
  CASHBACK_KEYWORD,
  REWARD_POINT_RATE,
} = require('../config/keywords');

/* ───────────────────────── helpers ───────────────────────── */

/** True when `ch` is a letter or digit (treats undefined edges as a boundary). */
function isWordChar(ch) {
  return ch !== undefined && /[a-z0-9]/i.test(ch);
}

/**
 * Case-insensitive whole-word-ish search. Returns the index of the first
 * occurrence of `needle` in `haystack` whose neighbours are non-alphanumeric
 * (or a string edge), or -1. Works for multi-word needles too.
 */
function boundaryIndexOf(haystack, needle, from = 0) {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let i = h.indexOf(n, from);
  while (i !== -1) {
    const before = h[i - 1];
    const after = h[i + n.length];
    if (!isWordChar(before) && !isWordChar(after)) return i;
    i = h.indexOf(n, i + 1);
  }
  return -1;
}

/* ───────────────────── stage 1: amount ───────────────────── */

/**
 * Find every currency amount in the text. Captures the raw substring, the
 * char offset, the normalized symbol and the parsed numeric value.
 * Handles "Rs. 250", "Rs.1,200", "INR 99.50", "₹500", "1,20,000" etc.
 * @returns {Array<{ raw:string, value:number, index:number, symbol:string }>}
 */
function findAmountCandidates(text) {
  const re = /(rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const value = Number.parseFloat(m[2].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    let symbol = m[1].toUpperCase().replace('.', '');
    if (symbol === 'RS') symbol = 'Rs';
    if (m[1] === '₹') symbol = '₹';
    out.push({ raw: m[0], value, index: m.index, symbol });
  }
  return out;
}

/**
 * Pick the transaction amount, not the running balance. Prefer the candidate
 * closest to the directional verb; with no verb, fall back to the largest.
 * @returns {{ amount:number|null, symbol:string|null, raw:string|null, candidateCount:number, confidence:'high'|'low'|'none' }}
 */
function selectAmount(candidates, verbIndex) {
  if (candidates.length === 0) {
    return { amount: null, symbol: null, raw: null, candidateCount: 0, confidence: 'none' };
  }
  if (candidates.length === 1) {
    const c = candidates[0];
    return { amount: c.value, symbol: c.symbol, raw: c.raw, candidateCount: 1, confidence: 'high' };
  }

  let chosen;
  let confidence;
  if (verbIndex === null) {
    chosen = candidates.reduce((a, b) => (b.value > a.value ? b : a));
    confidence = 'low';
  } else {
    const dist = (c) => Math.abs(c.index - verbIndex);
    const min = Math.min(...candidates.map(dist));
    const nearest = candidates.filter((c) => dist(c) === min);
    chosen = nearest.reduce((a, b) => (b.value > a.value ? b : a));
    confidence = nearest.length === 1 ? 'high' : 'low';
  }

  return {
    amount: chosen.value,
    symbol: chosen.symbol,
    raw: chosen.raw,
    candidateCount: candidates.length,
    confidence,
  };
}

/* ─────────────────── stage 2: direction ───────────────────── */

/**
 * Is this verb hit immediately followed by one of its guard words?
 * ("credit card", "debit limit" → guarded out).
 */
function isGuarded(text, verb, direction, hitIndex) {
  const guards = DIRECTION_GUARDS[direction] || [];
  const after = text.slice(hitIndex + verb.length);
  // next word after optional filler ("your", "the") + spaces
  const m = after.match(/^\s+(?:your\s+|the\s+|a\s+)?([a-z]+)/i);
  if (!m) return false;
  const nextWord = m[1].toLowerCase();
  return guards.includes(nextWord);
}

/**
 * Weighted, guarded, three-state direction detection. Sums verb weights per
 * polarity (ignoring guarded hits), returns the heavier side. Defaults to
 * 'debit' when there is no usable signal (conservative for a spend tracker).
 * @returns {{ direction:'credit'|'debit'|'unknown', verbIndex:number|null, verbsFired:string[], guardedOut:string[], confidence:'high'|'low'|'none' }}
 */
function detectDirection(text) {
  let creditWeight = 0;
  let debitWeight = 0;
  let creditIdx = null;
  let debitIdx = null;
  const verbsFired = [];
  const guardedOut = [];

  for (const { verb, direction, weight } of DIRECTION_VERBS) {
    const idx = boundaryIndexOf(text, verb);
    if (idx === -1) continue;
    if (isGuarded(text, verb, direction, idx)) {
      guardedOut.push(verb);
      continue;
    }
    verbsFired.push(verb);
    if (direction === 'credit') {
      creditWeight += weight;
      if (creditIdx === null) creditIdx = idx;
    } else {
      debitWeight += weight;
      if (debitIdx === null) debitIdx = idx;
    }
  }

  if (creditWeight === 0 && debitWeight === 0) {
    return { direction: 'unknown', verbIndex: null, verbsFired, guardedOut, confidence: 'none' };
  }

  const direction = creditWeight > debitWeight ? 'credit' : 'debit';
  const verbIndex = direction === 'credit' ? creditIdx : debitIdx;
  const margin = Math.abs(creditWeight - debitWeight);
  const confidence = margin > 3 ? 'high' : 'low';
  return { direction, verbIndex, verbsFired, guardedOut, confidence };
}

/* ─────────────────── stage 3: merchant ────────────────────── */

/**
 * Boundary-safe, longest-match-wins merchant detection. Order-independent;
 * "Swiggy Instamart" beats "Swiggy", "UberEats" beats "Uber".
 * @returns {{ merchant:string, category:string }|null}
 */
function detectMerchant(text) {
  let best = null;
  for (const entry of MERCHANT_KEYWORDS) {
    const idx = boundaryIndexOf(text, entry.keyword);
    if (idx === -1) continue;
    if (!best || entry.keyword.length > best.keyword.length) {
      best = { merchant: entry.keyword, category: entry.category, keyword: entry.keyword };
    }
  }
  return best ? { merchant: best.merchant, category: best.category } : null;
}

/* ─────────────────── stage 4: fraud scan ──────────────────── */

/**
 * Scan for fraud / spam signals. Returns the list of human-readable reasons
 * (empty when the message looks legitimate).
 * @returns {string[]}
 */
function detectFraud(text) {
  const reasons = [];
  for (const { reason, test } of FRAUD_SIGNALS) {
    if (test.test(text)) reasons.push(reason);
  }
  return reasons;
}

/* ───────────────────── rewards (unchanged) ────────────────── */

function detectRewardTrigger(text) {
  const lower = text.toLowerCase();
  if (lower.includes(CASHBACK_KEYWORD.toLowerCase())) {
    return { trigger: CASHBACK_KEYWORD };
  }
  const partner = REWARD_PARTNERS.find((p) => lower.includes(p.toLowerCase()));
  return partner ? { trigger: partner } : null;
}

function buildExpectedSavings(amount, trigger) {
  const points = Math.max(1, Math.round(amount * REWARD_POINT_RATE));
  return {
    trigger,
    points,
    message: `Expected Savings: +${points} reward points via ${trigger}`,
  };
}

function buildDescription(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/* ───────────────────────── orchestrator ───────────────────── */

/**
 * Parse ANY pasted SMS into a structured, categorized transaction. Designed
 * for free-text input (real bank alerts or fraud/spam), so it never throws on
 * a missing amount — it returns a flagged record instead. The only throw is
 * for non-string / empty input.
 *
 * @param {string} rawMessage
 * @returns {object} parsed transaction (without id/timestamp)
 */
function parseAlert(rawMessage) {
  if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
    throw new Error('rawMessage must be a non-empty string');
  }

  const text = rawMessage.trim();

  // direction first (it locates the verb that anchors amount selection)
  const dir = detectDirection(text);
  const amt = selectAmount(findAmountCandidates(text), dir.verbIndex);
  const merchantMatch = detectMerchant(text);
  const suspicionReasons = detectFraud(text);

  // For a spend tracker, an undetected direction falls back to 'debit'.
  const direction = dir.direction === 'unknown' ? 'debit' : dir.direction;
  const category = merchantMatch ? merchantMatch.category : DEFAULT_CATEGORY;
  const autoTagged = Boolean(merchantMatch);
  const suspicious = suspicionReasons.length > 0;

  // Reward / savings applies ONLY to outbound (debit) transactions, and we
  // never reward a suspected-fraud message.
  let expectedSavings = null;
  if (direction === 'debit' && !suspicious && amt.amount !== null) {
    const reward = detectRewardTrigger(text);
    if (reward) {
      expectedSavings = buildExpectedSavings(amt.amount, reward.trigger);
    }
  }

  const needsReview =
    amt.amount === null ||
    amt.confidence === 'low' ||
    dir.direction === 'unknown' ||
    dir.confidence === 'low' ||
    suspicious;

  return {
    rawMessage: text,
    description: buildDescription(text),
    amount: amt.amount,
    currencySymbol: amt.symbol,
    direction,
    category,
    autoTagged,
    merchant: merchantMatch ? merchantMatch.merchant : null,
    expectedSavings,
    suspicious,
    suspicionReasons,
    needsReview,
    trace: {
      amountSubstring: amt.raw,
      directionVerbs: dir.verbsFired,
      guardedOut: dir.guardedOut,
      merchantKeyword: merchantMatch ? merchantMatch.merchant : null,
    },
  };
}

module.exports = {
  parseAlert,
  findAmountCandidates,
  selectAmount,
  detectDirection,
  detectMerchant,
  detectFraud,
  detectRewardTrigger,
  buildExpectedSavings,
};
