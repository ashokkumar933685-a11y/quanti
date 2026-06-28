'use strict';

/**
 * Canonical category definitions.
 *
 * `type` describes whether a category typically represents money flowing
 * IN (income) or OUT (expense). This is used by the metrics reducer to
 * present sensible aggregates on the analytics blocks.
 */
const CATEGORIES = {
  FOOD: { id: 'FOOD', label: 'Food & Dining', type: 'expense', color: '#f97316' },
  TRAVEL: { id: 'TRAVEL', label: 'Travel', type: 'expense', color: '#3b82f6' },
  SALARY: { id: 'SALARY', label: 'Salary', type: 'income', color: '#22c55e' },
  MISC: { id: 'MISC', label: 'Miscellaneous', type: 'expense', color: '#a855f7' },
};

const DEFAULT_CATEGORY = 'MISC';

/** Ordered list of categories shown on the analytics row. */
const CATEGORY_ORDER = ['FOOD', 'TRAVEL', 'SALARY', 'MISC'];

function isValidCategory(id) {
  return Object.prototype.hasOwnProperty.call(CATEGORIES, id);
}

function listCategories() {
  return CATEGORY_ORDER.map((id) => ({ ...CATEGORIES[id] }));
}

module.exports = {
  CATEGORIES,
  CATEGORY_ORDER,
  DEFAULT_CATEGORY,
  isValidCategory,
  listCategories,
};
