const crypto = require('crypto');
const dataService = require('../services/dataService');
const { recordAudit } = require('../middleware/auditMiddleware');
const { generatePaymentReceiptPDF } = require('../utils/pdfGenerator');
const { sendEmail } = require('../utils/emailService');
const { saveApplicationToExcel } = require('../utils/excelService');

// @desc    Initialize payment (Standard/UPI/Card/NetBanking)
// @route   POST /api/payments/initialize
// @access  Private (Student)
exports.initializePayment = async (req, res, next) => {
  try {
    const { applicationId, paymentMethod = 'UPI' } = req.body;
    const userId = req.user._id || req.user.id;

    const application = await dataService.getApplicationById(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    if (application.isFeePaid) {
      return res.status(400).json({ success: false, message: 'Application fee has already been paid.' });
    }

    const amount = 2000;
    const orderId = `ORD-IEM-${Date.now()}`;
    const transactionId = `TXN-IEM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const payment = await dataService.createPayment({
      transactionId,
      orderId,
      user: userId,
      student: application.student?._id || application.student,
      application: application._id,
      amount,
      currency: 'INR',
      paymentMethod,
      status: 'PENDING',
    });

    res.status(200).json({
      success: true,
      order: {
        orderId: payment.orderId,
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: payment.currency,
        courseName: application.course?.name || 'Academic Degree Program',
        applicantName: req.user.name,
        merchantName: 'Institute of Engineering & Management (IEM) Admissions',
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create Razorpay Order
// @route   POST /api/payments/razorpay/create-order
// @access  Private (Student)
exports.createRazorpayOrder = async (req, res, next) => {
  try {
    const { applicationId } = req.body;
    const userId = req.user._id || req.user.id;

    const application = await dataService.getApplicationById(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    if (application.isFeePaid) {
      return res.status(400).json({ success: false, message: 'Application fee has already been paid.' });
    }

    const amountInPaise = 2000 * 100; // ₹2000 in paise
    const razorpayOrderId = `order_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const transactionId = `TXN-RZP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const payment = await dataService.createPayment({
      transactionId,
      orderId: razorpayOrderId,
      user: userId,
      student: application.student?._id || application.student,
      application: application._id,
      amount: 2000,
      currency: 'INR',
      paymentMethod: 'RAZORPAY',
      status: 'PENDING',
    });

    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_IEM_Kolkata_2026';

    res.status(200).json({
      success: true,
      keyId,
      order: {
        id: razorpayOrderId,
        amount: amountInPaise,
        currency: 'INR',
        transactionId,
        applicationId: application._id,
        courseName: application.course?.name || 'B.Tech Program',
        name: 'Institute of Engineering & Management',
        description: 'Admission Application & Processing Fee',
        prefill: {
          name: req.user.name,
          email: req.user.email,
          contact: req.user.phone || '+919876543210',
        },
        theme: {
          color: '#0b3b60',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Razorpay Payment
// @route   POST /api/payments/razorpay/verify
// @access  Private (Student)
exports.verifyRazorpayPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId } = req.body;
    const userId = req.user._id || req.user.id;

    // Lookup payment by orderId or transactionId
    let payment = null;
    if (razorpay_order_id) {
      const allPayments = await dataService.getAllPayments();
      payment = allPayments.find((p) => p.orderId === razorpay_order_id);
    }
    if (!payment && transactionId) {
      payment = await dataService.getPaymentByTxnId(transactionId);
    }

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found for order.' });
    }

    // Verify signature if secret configured
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    let isValid = true;
    if (keySecret && razorpay_signature) {
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      isValid = expectedSignature === razorpay_signature;
    }

    if (!isValid) {
      payment.status = 'FAILED';
      return res.status(400).json({ success: false, message: 'Razorpay signature verification failed.' });
    }

    payment.status = 'SUCCESS';
    payment.paidAt = new Date();
    payment.receiptNumber = payment.receiptNumber || `RCP-IEM-${Date.now().toString().slice(-6)}`;
    payment.paymentGatewayResponse = {
      gateway: 'Razorpay',
      razorpay_payment_id: razorpay_payment_id || `pay_${Date.now()}`,
      razorpay_order_id,
      verified: true,
    };

    // Update Application
    const updatedApp = await dataService.updateApplication(payment.application, {
      isFeePaid: true,
      timelineEntry: {
        status: 'FEE_PAID',
        actorName: req.user.name,
        role: req.user.role,
        comment: `₹${payment.amount} Application Fee paid via Razorpay (Payment ID: ${razorpay_payment_id || 'RZP-PAID'}, Receipt: ${payment.receiptNumber}).`,
        timestamp: new Date(),
      },
    });

    const student = await dataService.getStudentByUserId(userId);
    saveApplicationToExcel(updatedApp, req.user, student, payment);

    await dataService.createNotification({
      recipient: userId,
      title: 'Fee Payment Confirmed (Razorpay)',
      message: `Your payment of INR ${payment.amount} is verified. Receipt Number: ${payment.receiptNumber}.`,
      type: 'SUCCESS',
    });

    await recordAudit(req, {
      action: 'PAYMENT_RAZORPAY_SUCCESS',
      module: 'PAYMENT',
      details: { transactionId: payment.transactionId, amount: payment.amount, receipt: payment.receiptNumber },
    });

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully.',
      payment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Confirm mock payment (Instant UPI, Card, NetBanking)
// @route   POST /api/payments/confirm
// @access  Private (Student)
exports.confirmMockPayment = async (req, res, next) => {
  try {
    const { transactionId, simulateStatus = 'SUCCESS', paymentMethod } = req.body;
    const userId = req.user._id || req.user.id;

    const payment = await dataService.getPaymentByTxnId(transactionId);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    if (paymentMethod) payment.paymentMethod = paymentMethod;

    if (simulateStatus === 'SUCCESS') {
      payment.status = 'SUCCESS';
      payment.paidAt = new Date();
      payment.receiptNumber = payment.receiptNumber || `RCP-IEM-${Date.now().toString().slice(-6)}`;

      const updatedApp = await dataService.updateApplication(payment.application, {
        isFeePaid: true,
        timelineEntry: {
          status: 'FEE_PAID',
          actorName: req.user.name,
          role: 'student',
          comment: `Application fee of INR ${payment.amount} paid successfully via ${payment.paymentMethod} (Receipt: ${payment.receiptNumber}).`,
          timestamp: new Date(),
        },
      });

      const student = await dataService.getStudentByUserId(userId);
      saveApplicationToExcel(updatedApp, req.user, student, payment);

      await dataService.createNotification({
        recipient: userId,
        title: 'Application Fee Payment Successful',
        message: `Your payment of INR ${payment.amount} is confirmed via ${payment.paymentMethod}. Receipt No: ${payment.receiptNumber}.`,
        type: 'SUCCESS',
      });

      sendEmail({
        to: req.user.email,
        subject: `IEM Kolkata: Payment Receipt (${payment.receiptNumber}) - Application Fee Confirmed`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #0b3b60;">Payment Receipt Confirmation</h2>
            <p>Dear <strong>${req.user.name}</strong>,</p>
            <p>We have successfully received your admission application fee of <strong>INR ${payment.amount}.00</strong>.</p>
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 15px; margin: 15px 0;">
              <p style="margin: 4px 0;"><strong>Receipt Number:</strong> ${payment.receiptNumber}</p>
              <p style="margin: 4px 0;"><strong>Transaction ID:</strong> ${payment.transactionId}</p>
              <p style="margin: 4px 0;"><strong>Payment Method:</strong> ${payment.paymentMethod}</p>
              <p style="margin: 4px 0;"><strong>Amount Paid:</strong> ₹ ${payment.amount}.00</p>
              <p style="margin: 4px 0;"><strong>Payment Date:</strong> ${new Date(payment.paidAt).toLocaleDateString('en-IN')}</p>
            </div>
            <p>You can download your official PDF receipt anytime from your admission dashboard.</p>
            <p>Warm regards,<br><strong>Accounts Directorate, IEM Kolkata</strong></p>
          </div>
        `,
      });

      await recordAudit(req, {
        action: 'PAYMENT_SUCCESS',
        module: 'PAYMENT',
        details: { transactionId: payment.transactionId, method: payment.paymentMethod, amount: payment.amount, receipt: payment.receiptNumber },
      });

      return res.status(200).json({
        success: true,
        message: 'Payment verified and confirmed successfully.',
        payment,
      });
    } else {
      payment.status = 'FAILED';
      await recordAudit(req, {
        action: 'PAYMENT_FAILED',
        module: 'PAYMENT',
        details: { transactionId: payment.transactionId, method: payment.paymentMethod },
      });

      return res.status(400).json({
        success: false,
        message: 'Payment was declined or cancelled.',
        payment,
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get payment receipt
// @route   GET /api/payments/receipt/:receiptNumber
// @access  Private
exports.getReceipt = async (req, res, next) => {
  try {
    const payment = await dataService.getPaymentByReceipt(req.params.receiptNumber);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    res.status(200).json({
      success: true,
      receipt: payment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Download payment receipt as PDF (FR-15)
// @route   GET /api/payments/receipt/:receiptNumber/download
// @access  Private
exports.downloadReceiptPDF = async (req, res, next) => {
  try {
    const { receiptNumber } = req.params;
    let payment = await dataService.getPaymentByReceipt(receiptNumber);
    if (!payment) {
      payment = await dataService.getPaymentByTxnId(receiptNumber);
    }
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Receipt not found.' });
    }

    let application = null;
    if (payment.application) {
      application = await dataService.getApplicationById(payment.application._id || payment.application);
    }

    let user = null;
    if (payment.user) {
      user = await dataService.findUserById(payment.user._id || payment.user);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=IEM_Receipt_${payment.receiptNumber || 'Payment'}.pdf`
    );

    generatePaymentReceiptPDF({ ...payment, application, user }, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private
exports.getPaymentHistory = async (req, res, next) => {
  try {
    const role = req.user.role;
    let list;
    if (['admin', 'super_admin', 'accounts'].includes(role)) {
      list = await dataService.getAllPayments();
    } else {
      list = await dataService.getPaymentsByUserId(req.user._id || req.user.id);
    }

    res.status(200).json({
      success: true,
      count: list.length,
      payments: list,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Track transaction by ID
// @route   GET /api/payments/track/:transactionId
// @access  Public / Private
exports.trackTransaction = async (req, res, next) => {
  try {
    const payment = await dataService.getPaymentByTxnId(req.params.transactionId);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Transaction ID not found.' });
    }

    res.status(200).json({
      success: true,
      payment: {
        transactionId: payment.transactionId,
        orderId: payment.orderId,
        receiptNumber: payment.receiptNumber,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};
