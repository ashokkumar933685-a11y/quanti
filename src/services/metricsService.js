'use strict';

const { CATEGORIES, CATEGORY_ORDER } = require('../config/categories');

/**
 * Cumulative Metric Reducer.
 *
 * Processes the full collection of transaction rows, isolates positive
 * incoming values (credits) from negative outbound values (debits), and
 * builds per-category sums plus headline totals for the frontend.
 *
 * @param {Array<object>} transactions
 * @returns {object} aggregated metrics
 */
function computeMetrics(transactions) {
  // Seed every known category at zero so the UI always has full tracks.
  const categorySums = {};
  for (const id of CATEGORY_ORDER) {
    categorySums[id] = 0;
  }

  let totalIncome = 0;
  let totalSpend = 0;
  let totalExpectedPoints = 0;
  let needsReviewCount = 0;
  let suspiciousCount = 0;

  for (const tx of transactions) {
    if (tx.needsReview) needsReviewCount += 1;
    if (tx.suspicious) suspiciousCount += 1;

    // Records with no detectable amount (e.g. pasted fraud/spam) and
    // 'unknown'-direction records contribute to neither income nor spend.
    const hasAmount = tx.amount !== null && Number.isFinite(Number(tx.amount));
    if (!hasAmount || tx.direction === 'unknown') {
      continue;
    }

    const signedReducerStep = reduceTransaction(tx);

    if (signedReducerStep.direction === 'credit') {
      totalIncome += signedReducerStep.amount;
    } else {
      totalSpend += signedReducerStep.amount;
    }

    // Accumulate the absolute amount against its category track.
    if (categorySums[tx.category] === undefined) {
      categorySums[tx.category] = 0;
    }
    categorySums[tx.category] += signedReducerStep.amount;

    if (tx.expectedSavings && typeof tx.expectedSavings.points === 'number') {
      totalExpectedPoints += tx.expectedSavings.points;
    }
  }

  const balance = totalIncome - totalSpend;

  // The progress tracks fill relative to the largest single category value.
  const maxCategoryValue = Math.max(0, ...Object.values(categorySums));

  const categories = CATEGORY_ORDER.map((id) => {
    const amount = categorySums[id] || 0;
    const percent = maxCategoryValue > 0 ? Math.round((amount / maxCategoryValue) * 100) : 0;
    return {
      id,
      label: CATEGORIES[id].label,
      type: CATEGORIES[id].type,
      color: CATEGORIES[id].color,
      amount,
      percent,
    };
  });

  return {
    categories,
    totals: {
      income: round2(totalIncome),
      spend: round2(totalSpend),
      balance: round2(balance),
      expectedPoints: totalExpectedPoints,
      transactionCount: transactions.length,
      needsReviewCount,
      suspiciousCount,
    },
  };
}

/**
 * Normalize a single transaction into a signed reducer step.
 * Credits are positive incoming; debits are outbound.
 */
function reduceTransaction(tx) {
  const amount = Math.abs(Number(tx.amount) || 0);
  return {
    direction: tx.direction === 'credit' ? 'credit' : 'debit',
    amount,
    signed: tx.direction === 'credit' ? amount : -amount,
  };
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = { computeMetrics, reduceTransaction };
