'use strict';

/**
 * Predefined corporate merchant keywords mapped to a fallback category.
 * The parser scans an incoming raw alert for any of these tokens and
 * auto-assigns the associated category so the user does not have to.
 *
 * Matching is case-insensitive and word-ish (handled in the parser).
 */
const MERCHANT_KEYWORDS = [
  // Food & Dining
  { keyword: 'Zomato', category: 'FOOD' },
  { keyword: 'Swiggy', category: 'FOOD' },
  { keyword: 'Dominos', category: 'FOOD' },
  { keyword: 'McDonald', category: 'FOOD' },
  { keyword: 'KFC', category: 'FOOD' },
  { keyword: 'Starbucks', category: 'FOOD' },
  { keyword: 'Dunzo', category: 'FOOD' },
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
  REWARD_PARTNERS,
  CASHBACK_KEYWORD,
  REWARD_POINT_RATE,
};
