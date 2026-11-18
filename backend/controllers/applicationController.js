const dataService = require('../services/dataService');
const { generateApplicationPDF } = require('../utils/pdfGenerator');
const { sendEmail } = require('../utils/emailService');
const { recordAudit } = require('../middleware/auditMiddleware');
const {
  saveApplicationToExcel,
  exportApplicationsToExcelBuffer,
  getExcelFilePath,
} = require('../utils/excelService');

// @desc    Create or update application draft (FR-8)
// @route   POST /api/applications/draft
// @access  Private (Student)
exports.createOrUpdateDraft = async (req, res, next) => {
  try {
    const { applicationId, courseId, currentStep, formData } = req.body;
    const userId = req.user._id || req.user.id;

    let student = await dataService.getStudentByUserId(userId);
    if (!student) {
      student = await dataService.createStudentProfile(userId);
    }

    // Sync form data with student profile & user if provided
    if (formData) {
      const studentUpdate = {};
      if (formData.dob) studentUpdate.dob = formData.dob;
      if (formData.gender) studentUpdate.gender = formData.gender;
      if (formData.nationality) studentUpdate.nationality = formData.nationality;
      if (formData.category) studentUpdate.category = formData.category;

      if (formData.address || formData.city || formData.state || formData.pincode) {
        studentUpdate.address = student.address || {};
        studentUpdate.address.present = {
          ...(student.address?.present || {}),
          ...(formData.address && { street: formData.address }),
          ...(formData.city && { city: formData.city }),
          ...(formData.state && { state: formData.state }),
          ...(formData.pincode && { pincode: formData.pincode }),
        };
      }

      if (formData.board || formData.passingYear || formData.percentage || formData.qualification) {
        studentUpdate.academics = student.academics || {};
        studentUpdate.academics.class12 = {
          ...(student.academics?.class12 || {}),
          ...(formData.board && { board: formData.board }),
          ...(formData.passingYear && { passingYear: Number(formData.passingYear) }),
          ...(formData.percentage && { percentage: Number(formData.percentage) }),
        };
      }

      await dataService.updateStudentProfile(userId, studentUpdate);

      if (formData.fullName || formData.phone) {
        await dataService.updateUser(userId, {
          ...(formData.fullName && { name: formData.fullName }),
          ...(formData.phone && { phone: formData.phone }),
        });
      }
    }

    let application;
    if (applicationId) {
      application = await dataService.getApplicationById(applicationId);
      if (!application) {
        return res.status(404).json({ success: false, message: 'Application draft not found.' });
      }
      application = await dataService.updateApplication(applicationId, {
        ...(courseId && { course: courseId }),
        ...(currentStep && { currentStep }),
        ...(formData && { formData }),
        status: 'DRAFT',
      });
    } else {
      if (!courseId) {
        return res.status(400).json({ success: false, message: 'Course ID is required.' });
      }

      application = await dataService.createApplication({
        user: userId,
        student: student._id || student.id,
        course: courseId,
        currentStep: currentStep || 1,
        formData: formData || {},
        status: 'DRAFT',
      });
    }

    const populated = await dataService.getApplicationById(application._id);

    // Automatically store / sync data to Excel (.xlsx) sheet
    const user = await dataService.findUserById(userId);
    saveApplicationToExcel(populated || application, user || req.user, student);

    res.status(200).json({
      success: true,
      message: 'Draft application saved successfully.',
      application: populated || application,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Submit application (FR-6, FR-7, FR-12)
// @route   POST /api/applications/:id/submit
// @access  Private (Student)
exports.submitApplication = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const application = await dataService.getApplicationById(req.params.id);

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    if (application.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: `Application has already been submitted (Current status: ${application.status}).`,
      });
    }

    const student = await dataService.getStudentByUserId(userId);
    const user = await dataService.findUserById(userId);
    const form = application.formData || {};

    // Validate mandatory fields as per FR-6 & FR-7
    const fullName = form.fullName || user?.name || '';
    const email = form.email || user?.email || '';
    const phone = form.phone || user?.phone || '';
    const dob = form.dob || student?.dob;
    const gender = form.gender || student?.gender;
    const nationality = form.nationality || student?.nationality;
    const category = form.category || student?.category;
    const address = form.address || student?.address?.present?.street;
    const city = form.city || student?.address?.present?.city;
    const state = form.state || student?.address?.present?.state;
    const pincode = form.pincode || student?.address?.present?.pincode;
    const qualification = form.qualification || '10+2 / Higher Secondary';
    const board = form.board || student?.academics?.class12?.board;
    const passingYear = form.passingYear || student?.academics?.class12?.passingYear;
    const percentage = form.percentage !== undefined ? form.percentage : student?.academics?.class12?.percentage;

    const validationErrors = [];
    if (!fullName || fullName.trim().length < 2 || fullName.trim().length > 100) {
      validationErrors.push('Full Name must be between 2 and 100 characters.');
    }
    if (!/^[a-zA-Z\s]+$/.test(fullName)) {
      validationErrors.push('Full Name must contain only alphabets and spaces.');
    }
    if (!dob) {
      validationErrors.push('Valid Date of Birth is required.');
    }
    if (!gender) {
      validationErrors.push('Gender selection is required.');
    }
    if (!nationality) {
      validationErrors.push('Nationality is required.');
    }
    if (!category) {
      validationErrors.push('Category selection is required.');
    }
    if (!address || address.trim().length < 10 || address.trim().length > 500) {
      validationErrors.push('Address must be between 10 and 500 characters.');
    }
    if (!city || city.trim().length < 2 || city.trim().length > 50) {
      validationErrors.push('City must be between 2 and 50 characters.');
    }
    if (!state) {
      validationErrors.push('State is required.');
    }
    if (!pincode || !/^\d{6}$/.test(String(pincode).trim())) {
      validationErrors.push('PIN Code must be exactly 6 numeric digits.');
    }
    if (phone && !/^\d{10}$/.test(String(phone).replace(/\D/g, '').slice(-10))) {
      validationErrors.push('Phone number must contain exactly 10 digits.');
    }
    if (!board || board.trim().length < 2 || board.trim().length > 150) {
      validationErrors.push('Board / University name must be between 2 and 150 characters.');
    }
    if (!passingYear || !/^\d{4}$/.test(String(passingYear).trim())) {
      validationErrors.push('Passing Year must be a 4-digit number.');
    }
    if (percentage === undefined || isNaN(percentage) || percentage < 0 || percentage > 100) {
      validationErrors.push('Percentage / CGPA must be between 0 and 100.');
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Mandatory field validation failed: ' + validationErrors.join(' '),
        errors: validationErrors,
      });
    }

    // Document Validation (FR-9, FR-11)
    const docs = await dataService.getDocuments({ user: userId });
    const hasPhoto = docs.some((d) => d.documentType === 'PHOTO');
    const hasMarksheet = docs.some((d) =>
      ['CLASS_12_MARKSHEET', 'CLASS_10_MARKSHEET', 'MARKSHEET'].includes(d.documentType)
    );
    const hasIdProof = docs.some((d) => ['AADHAAR_CARD', 'ID_PROOF'].includes(d.documentType));
    const hasCategoryCert = docs.some((d) => d.documentType === 'CATEGORY_CERTIFICATE');

    if (!hasPhoto) {
      return res.status(400).json({
        success: false,
        message: 'Candidate Photograph is mandatory for submission.',
      });
    }
    if (!hasMarksheet) {
      return res.status(400).json({
        success: false,
        message: 'Academic Mark Sheet is mandatory for submission.',
      });
    }
    if (!hasIdProof) {
      return res.status(400).json({
        success: false,
        message: 'Valid Government ID Proof (Aadhaar/Passport/Voter ID) is mandatory for submission.',
      });
    }
    if (['OBC', 'SC', 'ST', 'EWS', 'OBC-A', 'OBC-B'].includes(category) && !hasCategoryCert) {
      return res.status(400).json({
        success: false,
        message: `Category Certificate is mandatory for ${category} category candidates.`,
      });
    }

    // FR-12: Generate unique Application Reference Number (ARN) after submission
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const arn = `ARN-${new Date().getFullYear()}-${randomSuffix}`;
    const arnGeneratedDate = new Date();

    let meritScore = Number(percentage) || 0;

    const timelineEntry = {
      status: 'SUBMITTED',
      actorName: req.user.name,
      role: 'student',
      comment: `Application officially submitted with ARN: ${arn}.`,
      timestamp: new Date(),
    };

    const updated = await dataService.updateApplication(application._id, {
      status: 'SUBMITTED',
      currentStep: 6,
      submissionDate: new Date(),
      arn,
      arnGeneratedDate,
      applicationNumber: arn,
      meritScore,
      timelineEntry,
    });

    await dataService.createNotification({
      recipient: userId,
      title: 'Application Submitted Successfully',
      message: `Your application (${updated.applicationNumber}) has been submitted for scrutiny.`,
      type: 'SUCCESS',
      link: `/applications/${updated._id}`,
    });

    sendEmail({
      to: req.user.email,
      subject: `IEM Kolkata: Application Received (${updated.applicationNumber})`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #0b3b60;">Application Submission Confirmation</h2>
          <p>Dear <strong>${req.user.name}</strong>,</p>
          <p>We are pleased to inform you that your admission application for <strong>${application.course?.name || 'IEM Degree Program'}</strong> has been received.</p>
          <p><strong>Application Number:</strong> ${updated.applicationNumber}</p>
          <p>Our scrutiny committee will verify your uploaded certificates shortly.</p>
          <p>Warm regards,<br><strong>IEM Admission Directorate</strong></p>
        </div>
      `,
    });

    await recordAudit(req, {
      action: 'APPLICATION_SUBMITTED',
      module: 'APPLICATION',
      details: { applicationId: updated._id, applicationNumber: updated.applicationNumber },
    });

    // Auto-update Excel (.xlsx) sheet with submitted status & ARN
    saveApplicationToExcel(updated, req.user, student);

    res.status(200).json({
      success: true,
      message: 'Application submitted successfully.',
      application: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all applications of current student
// @route   GET /api/applications/my
// @access  Private (Student)
exports.getMyApplications = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const allApps = await dataService.getApplications();
    const myApps = allApps.filter((a) => (a.user?._id || a.user)?.toString() === userId.toString());

    res.status(200).json({
      success: true,
      count: myApps.length,
      applications: myApps,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single application by ID
// @route   GET /api/applications/:id
// @access  Private
exports.getApplicationById = async (req, res, next) => {
  try {
    const application = await dataService.getApplicationById(req.params.id);

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    const userId = req.user._id || req.user.id;
    const appUserId = (application.user?._id || application.user)?.toString();

    if (req.user.role === 'student' && appUserId !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this application.' });
    }

    const documents = await dataService.getDocuments({ user: appUserId });

    res.status(200).json({
      success: true,
      application,
      documents,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Download Application Form as PDF
// @route   GET /api/applications/:id/download-pdf
// @access  Private
exports.downloadApplicationPDF = async (req, res, next) => {
  try {
    const application = await dataService.getApplicationById(req.params.id);

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=IEM_Application_${application.applicationNumber || application._id}.pdf`
    );

    generateApplicationPDF(application, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Track application status publicly
// @route   GET /api/applications/track/:applicationNumber
// @access  Public
exports.trackStatus = async (req, res, next) => {
  try {
    const allApps = await dataService.getApplications();
    const query = req.params.applicationNumber?.trim()?.toUpperCase();
    const app = allApps.find(
      (a) =>
        a.applicationNumber?.toUpperCase() === query ||
        a.arn?.toUpperCase() === query
    );

    if (!app) {
      return res.status(404).json({
        success: false,
        message: `No application found with reference number: ${req.params.applicationNumber}`,
      });
    }

    res.status(200).json({
      success: true,
      application: {
        applicationNumber: app.arn || app.applicationNumber,
        arn: app.arn || app.applicationNumber,
        status: app.status,
        submissionDate: app.submissionDate,
        course: app.course,
        timeline: app.timeline,
        officerRemarks: app.officerRemarks,
        decisionDate: app.decisionDate,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export student or all applications as Excel (.xlsx) file
// @route   GET /api/applications/export/excel
// @access  Private
exports.exportApplicationsExcel = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    let apps;

    if (req.user.role === 'student') {
      const allApps = await dataService.getApplications();
      apps = allApps.filter((a) => (a.user?._id || a.user)?.toString() === userId.toString());
    } else {
      apps = await dataService.getApplications();
    }

    const excelBuffer = exportApplicationsToExcelBuffer(apps);
    const filename = `IEM_Admission_Applications_${Date.now()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(excelBuffer);
  } catch (error) {
    next(error);
  }
};

// @desc    Export single application as Excel (.xlsx) file
// @route   GET /api/applications/:id/export-excel
// @access  Private
exports.exportSingleApplicationExcel = async (req, res, next) => {
  try {
    const application = await dataService.getApplicationById(req.params.id);

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    const userId = req.user._id || req.user.id;
    const appUserId = (application.user?._id || application.user)?.toString();

    if (req.user.role === 'student' && appUserId !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to download this application.' });
    }

    const excelBuffer = exportApplicationsToExcelBuffer([application]);
    const identifier = application.arn || application.applicationNumber || application._id;
    const filename = `IEM_Application_${identifier}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(excelBuffer);
  } catch (error) {
    next(error);
  }
};

// @desc    Download the live master Excel sheet
// @route   GET /api/applications/master-spreadsheet
// @access  Private
exports.getMasterExcelSheet = async (req, res, next) => {
  try {
    const fs = require('fs');
    const filePath = getExcelFilePath();

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'No applications spreadsheet recorded yet.' });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="IEM_Admission_Applications.xlsx"');
    return res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
};
