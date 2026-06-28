'use strict';

/**
 * Predefined corporate merchant keywords mapped to a fallback category.
 * The parser scans an incoming raw alert for any of these tokens and
 * auto-assigns the associated category so the user does not have to.
 *
 * Matching is case-insensitive and word-ish (handled in the parser).
 */
const MERCHANT_KEYWORDS = [
  // Food & Dining (multi-word entries first so longest-match wins)
  { keyword: 'Swiggy Instamart', category: 'FOOD' },
  { keyword: 'UberEats', category: 'FOOD' },
  { keyword: 'Zomato', category: 'FOOD' },
  { keyword: 'Swiggy', category: 'FOOD' },
  { keyword: 'Dominos', category: 'FOOD' },
  { keyword: 'McDonald', category: 'FOOD' },
  { keyword: 'KFC', category: 'FOOD' },
  { keyword: 'Starbucks', category: 'FOOD' },
  { keyword: 'Dunzo', category: 'FOOD' },
  { keyword: 'BigBasket', category: 'FOOD' },
  { keyword: 'Restaurant', category: 'FOOD' },
  { keyword: 'Cafe', category: 'FOOD' },

  // Travel
  { keyword: 'Uber', category: 'TRAVEL' },
  { keyword: 'Ola', category: 'TRAVEL' },
  { keyword: 'Rapido', category: 'TRAVEL' },
  { keyword: 'IRCTC', category: 'TRAVEL' },
  { keyword: 'MakeMyTrip', category: 'TRAVEL' },
  { keyword: 'Indigo', category: 'TRAVEL' },
  { keyword: 'Petrol', category: 'TRAVEL' },
  { keyword: 'Fuel', category: 'TRAVEL' },

  // Salary / Income
  { keyword: 'Salary', category: 'SALARY' },
  { keyword: 'Payroll', category: 'SALARY' },
  { keyword: 'Wages', category: 'SALARY' },
  { keyword: 'Stipend', category: 'SALARY' },
];

/**
 * Weighted directional verbs. Strong, unambiguous verbs (debited/credited)
 * outweigh weak generic ones ("txn"/"debit"/"credit" which collide with
 * "debit card" / "credit card"). `weight` is the confidence contribution.
 */
const DIRECTION_VERBS = [
  // money leaving the account (debit)
  { verb: 'debited', direction: 'debit', weight: 10 },
  { verb: 'spent', direction: 'debit', weight: 9 },
  { verb: 'withdrawn', direction: 'debit', weight: 9 },
  { verb: 'paid', direction: 'debit', weight: 8 },
  { verb: 'sent', direction: 'debit', weight: 7 },
  { verb: 'purchase', direction: 'debit', weight: 6 },
  { verb: 'debit', direction: 'debit', weight: 4 },

  // money entering the account (credit)
  { verb: 'credited', direction: 'credit', weight: 10 },
  { verb: 'deposited', direction: 'credit', weight: 9 },
  { verb: 'received', direction: 'credit', weight: 8 },
  { verb: 'refund', direction: 'credit', weight: 7 },
  { verb: 'credit', direction: 'credit', weight: 4 },
];

/**
 * Negative guard words. When a directional verb is immediately followed by
 * one of its guard words, the verb is ignored (e.g. "credit card" must not
 * flip a spend into income). Pure data so new collisions are easy to add.
 */
const DIRECTION_GUARDS = {
  credit: ['card', 'limit', 'score', 'line'],
  debit: ['card', 'limit'],
};

/**
 * Fraud / spam signals. Any match flags the alert as suspicious so the demo
 * UI can warn the user while still parsing the amount/direction/category.
 * Each entry: a human-readable `reason` and a `test` RegExp.
 */
const FRAUD_SIGNALS = [
  { reason: 'Contains a web link', test: /(https?:\/\/|www\.|bit\.ly|tinyurl|\b[a-z0-9-]+\.(?:xyz|top|link|info|click|live|buzz)\b)/i },
  { reason: 'Asks for OTP / PIN / CVV / password', test: /\b(otp|cvv|pin|password|upi\s*pin|mpin)\b/i },
  { reason: 'KYC / account-block scare tactic', test: /\b(kyc|account\s*(?:is\s*)?(?:blocked|suspended|frozen|on\s*hold)|will\s*be\s*blocked|re-?verify)\b/i },
  { reason: 'Lottery / prize / lucky-winner bait', test: /\b(lottery|jackpot|prize|lucky\s*winner|you\s*(?:have\s*)?won|congratulations)\b/i },
  { reason: 'Urgency / click-now pressure', test: /\b(urgent|immediately|act\s*now|click\s*(?:here|the\s*link|below)|last\s*chance|expir(?:e|es|ing|ed))\b/i },
  { reason: 'Asks you to call/share details', test: /\b(call\s*(?:now|us|on)|share\s*(?:your|the)|update\s*(?:your\s*)?(?:pan|aadhaar|bank|details))\b/i },
];

/**
 * Reward partners / loyalty programs. An OUTBOUND transaction whose text
 * contains the literal word "Cashback" OR any of these partners triggers
 * the simulated "Expected Savings" sub-metric.
 */
const REWARD_PARTNERS = ['CRED', 'Amazon Pay', 'PhonePe Rewards', 'Paytm First', 'GPay Rewards'];

const CASHBACK_KEYWORD = 'Cashback';

/**
 * Points are simulated as a percentage of the outbound spend.
 * e.g. 2 reward points per ₹100 spent.
 */
const REWARD_POINT_RATE = 0.02;

module.exports = {
  MERCHANT_KEYWORDS,
  DIRECTION_VERBS,
  DIRECTION_GUARDS,
  FRAUD_SIGNALS,
  REWARD_PARTNERS,
  CASHBACK_KEYWORD,
  REWARD_POINT_RATE,
};
