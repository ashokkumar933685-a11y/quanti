'use strict';

const transactionService = require('../services/transactionService');
const { listCategories } = require('../config/categories');

/** GET /api/categories - list of selectable category tags. */
function getCategories(_req, res) {
  res.json({ categories: listCategories() });
}

/** GET /api/dashboard - transactions + aggregated metrics in one payload. */
function getDashboard(_req, res) {
  res.json(transactionService.getDashboard());
}

/** GET /api/transactions - chronological transaction feed. */
function getTransactions(_req, res) {
  res.json({ transactions: transactionService.listTransactions() });
}

/** GET /api/metrics - aggregated category sums + totals. */
function getMetrics(_req, res) {
  res.json({ metrics: transactionService.getMetrics() });
}

/** POST /api/transactions - ingest a raw transaction alert. */
function createTransaction(req, res, next) {
  try {
    const { rawMessage } = req.body || {};
    const transaction = transactionService.ingestAlert(rawMessage);
    res.status(201).json({
      transaction,
      metrics: transactionService.getMetrics(),
    });
  } catch (err) {
    err.statusCode = err.statusCode || 400;
    next(err);
  }
}

/** PATCH /api/transactions/:id/category - manual category override. */
function updateCategory(req, res, next) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const { category } = req.body || {};
    const updated = transactionService.recategorize(id, category);
    if (!updated) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({
      transaction: updated,
      metrics: transactionService.getMetrics(),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCategories,
  getDashboard,
  getTransactions,
  getMetrics,
  createTransaction,
  updateCategory,
};
