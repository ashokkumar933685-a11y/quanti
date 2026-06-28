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
  return store.update(id, { category, autoTagged: false });
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
    'Paid Rs. 250 to Zomato for lunch order',
    'Paid Rs. 180 to Uber for ride to office',
    'Paid Rs. 1,200 to Amazon Pay - Cashback offer applied',
    'Received Rs. 1,200 from Private Company Ltd',
    'Paid Rs. 99 to Swiggy Instamart',
    'Paid Rs. 540 to BigBasket groceries',
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
