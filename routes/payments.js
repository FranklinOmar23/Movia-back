const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const adminAuth = require('../middleware/adminAuth');

// Solo admin puede crear sesión de checkout (aunque también podría ser pública si el link ya lleva el id)
router.post('/create-checkout-session', adminAuth, paymentController.createCheckoutSession);
// Webhook público (Stripe lo llama)
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

module.exports = router;