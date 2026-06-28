'use strict';

/**
 * Simple in-memory transaction store.
 *
 * Kept deliberately small and behind a module boundary so it could be
 * swapped for a real database (Mongo/Postgres) without touching the
 * services or controllers that depend on it.
 */
let transactions = [];
let nextId = 1;

function reset() {
  transactions = [];
  nextId = 1;
}

function getAll() {
  // newest first (chronological feed renders most-recent at the top)
  return [...transactions].sort((a, b) => b.timestamp - a.timestamp);
}

function getById(id) {
  return transactions.find((t) => t.id === id) || null;
}

function insert(parsed) {
  const record = {
    id: nextId++,
    timestamp: Date.now(),
    ...parsed,
  };
  transactions.push(record);
  return record;
}

function update(id, patch) {
  const tx = getById(id);
  if (!tx) return null;
  Object.assign(tx, patch);
  return tx;
}

module.exports = { reset, getAll, getById, insert, update };
