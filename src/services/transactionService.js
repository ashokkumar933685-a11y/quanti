'use strict';

const store = require('../data/store');
const { parseAlert } = require('./parserService');
const { computeMetrics } = require('./metricsService');
const { isValidCategory } = require('../config/categories');

/**
 * Ingest a raw transaction alert: parse + auto-categorize + persist.
 * @param {string} rawMessage
 * @returns {object} the stored transaction record
 */
function ingestAlert(rawMessage) {
  const parsed = parseAlert(rawMessage);
  return store.insert(parsed);
}

/**
 * Manually override the category chosen by the auto-tagger.
 * @returns {object|null} updated record, or null if not found
 */
function recategorize(id, category) {
  if (!isValidCategory(category)) {
    const err = new Error(`Unknown category: ${category}`);
    err.statusCode = 400;
    throw err;
  }
  return store.update(id, { category, autoTagged: false, needsReview: false });
}

function listTransactions() {
  return store.getAll();
}

function getMetrics() {
  return computeMetrics(store.getAll());
}

/**
 * Build the full dashboard payload in one shot so the frontend can render
 * the feed and the analytics blocks from a single source of truth.
 */
function getDashboard() {
  const transactions = store.getAll();
  return {
    transactions,
    metrics: computeMetrics(transactions),
  };
}

/** Seed a handful of realistic alerts for first load. */
function seed() {
  store.reset();
  const samples = [
    'Received Rs. 45,000 from Acme Corp Payroll Salary for June',
    'Rs.250 debited at Swiggy Instamart. Avl Bal Rs.45,300',
    'Paid Rs. 180 to Uber for ride to office',
    'Rs. 1,200 spent on your HDFC credit card at Amazon Pay - Cashback offer applied',
    'Received Rs. 1,200 from Private Company Ltd',
    'Paid Rs. 99 to Swiggy Instamart',
    'URGENT: Your account KYC is blocked. Click http://hdfc-kyc-verify.xyz and share OTP to unblock and claim Rs.10,000',
  ];
  for (const msg of samples) {
    try {
      ingestAlert(msg);
    } catch (_) {
      /* skip unparseable seeds */
    }
  }
}

module.exports = {
  ingestAlert,
  recategorize,
  listTransactions,
  getMetrics,
  getDashboard,
  seed,
};
