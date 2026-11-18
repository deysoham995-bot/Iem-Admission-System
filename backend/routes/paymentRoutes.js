const express = require('express');
const router = express.Router();
const {
  initializePayment,
  createRazorpayOrder,
  verifyRazorpayPayment,
  confirmMockPayment,
  getReceipt,
  downloadReceiptPDF,
  getPaymentHistory,
  trackTransaction,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Public route for tracking transactions
router.get('/track/:transactionId', trackTransaction);

// Protected routes
router.use(protect);

router.post('/initialize', authorize('student'), initializePayment);
router.post('/razorpay/create-order', authorize('student'), createRazorpayOrder);
router.post('/razorpay/verify', authorize('student'), verifyRazorpayPayment);
router.post('/confirm', authorize('student'), confirmMockPayment);
router.get('/receipt/:receiptNumber', getReceipt);
router.get('/receipt/:receiptNumber/download', downloadReceiptPDF);
router.get('/:id/download-receipt', downloadReceiptPDF);
router.get('/history', getPaymentHistory);

module.exports = router;
