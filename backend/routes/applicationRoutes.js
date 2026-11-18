const express = require('express');
const router = express.Router();
const {
  createOrUpdateDraft,
  submitApplication,
  getMyApplications,
  getApplicationById,
  downloadApplicationPDF,
  trackStatus,
  exportApplicationsExcel,
  exportSingleApplicationExcel,
  getMasterExcelSheet,
} = require('../controllers/applicationController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Public tracking
router.get('/track/:applicationNumber', trackStatus);

// Authenticated application endpoints
router.use(protect);

router.get('/export/excel', exportApplicationsExcel);
router.get('/master-spreadsheet', getMasterExcelSheet);
router.get('/my', authorize('student'), getMyApplications);
router.post('/draft', authorize('student'), createOrUpdateDraft);
router.post('/:id/submit', authorize('student'), submitApplication);
router.get('/:id/download-pdf', downloadApplicationPDF);
router.get('/:id/export-excel', exportSingleApplicationExcel);
router.get('/:id', getApplicationById);

module.exports = router;
