'use strict';

const { createApp } = require('./src/app');
const transactionService = require('./src/services/transactionService');

const PORT = process.env.PORT || 3000;

// Seed demo data so the dashboard isn't empty on first load.
transactionService.seed();

const app = createApp();

app.listen(PORT, () => {
  console.log(`Quanti money manager running at http://localhost:${PORT}`);
});
