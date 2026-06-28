'use strict';

const express = require('express');
const controller = require('../controllers/transactionController');

const router = express.Router();

router.get('/categories', controller.getCategories);
router.get('/dashboard', controller.getDashboard);

router.get('/transactions', controller.getTransactions);
router.post('/transactions', controller.createTransaction);
router.patch('/transactions/:id/category', controller.updateCategory);

router.get('/metrics', controller.getMetrics);

module.exports = router;
