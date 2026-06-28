'use strict';

const path = require('path');
const express = require('express');
const apiRoutes = require('./routes');

function createApp() {
  const app = express();

  app.use(express.json());

  // API
  app.use('/api', apiRoutes);

  // Static frontend
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // Centralized error handler — keeps controllers thin.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Internal Server Error' });
  });

  return app;
}

module.exports = { createApp };
