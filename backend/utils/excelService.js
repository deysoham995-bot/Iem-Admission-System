const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

// Path to store the applications spreadsheet
const excelDir = path.join(__dirname, '../uploads/excel');
const excelFilePath = path.join(excelDir, 'IEM_Admission_Applications.xlsx');

// Ensure directory exists
if (!fs.existsSync(excelDir)) {
  fs.mkdirSync(excelDir, { recursive: true });
}

/**
 * Format an application record into a flattened row for Excel
 * @param {Object} application
 * @param {Object} user
 * @param {Object} student
 * @param {Object} payment
 * @returns {Object} Flattened key-value record
 */
const formatApplicationForExcel = (application, user = {}, student = {}, payment = {}) => {
  const form = application.formData || {};
  const addr = student.address?.present || {};
  const acad = student.academics?.class12 || {};

  return {
    'Application ID': application._id ? String(application._id) : '',
    'ARN / Application Number': application.arn || application.applicationNumber || 'DRAFT',
    'Application Status': application.status || 'DRAFT',
    'Submission Date': application.submissionDate
      ? new Date(application.submissionDate).toLocaleString('en-IN')
      : 'Incomplete / Draft',
    'Full Name': form.fullName || user.name || student.user?.name || '',
    'Email Address': form.email || user.email || student.user?.email || '',
    'Mobile Number': form.phone || user.phone || student.user?.phone || '',
    'Date of Birth': form.dob
      ? new Date(form.dob).toISOString().split('T')[0]
      : (student.dob ? new Date(student.dob).toISOString().split('T')[0] : ''),
    'Gender': form.gender || student.gender || '',
    'Nationality': form.nationality || student.nationality || 'Indian',
    'Category': form.category || student.category || 'General',
    'Address': form.address || addr.street || '',
    'City': form.city || addr.city || '',
    'State': form.state || addr.state || '',
    'PIN Code': form.pincode || addr.pincode || '',
    'Course Preference': form.coursePreference || application.course?.name || '',
    'Course Code': application.course?.courseCode || '',
    'Department': application.course?.department || '',
    'Qualification Level': form.qualification || '10+2 / Higher Secondary',
    'Board / University': form.board || acad.board || '',
    'Passing Year': form.passingYear || acad.passingYear || '',
    'Percentage / Marks (%)': form.percentage !== undefined ? form.percentage : (acad.percentage || ''),
    'Discipline / Stream': form.stream || acad.stream || 'Science',
    'Entrance Exam': form.entranceExam || student.academics?.entranceExam?.examType || 'IEMJEE',
    'Entrance Rank': form.entranceRank || student.academics?.entranceExam?.rank || '',
    'Fee Paid Status': application.isFeePaid ? 'Paid (₹ 2,000)' : 'Pending',
    'Transaction ID': payment.transactionId || application.payment?.transactionId || (application.isFeePaid ? 'TXN_CONFIRMED' : ''),
    'Receipt Number': payment.receiptNumber || application.payment?.receiptNumber || '',
    'Last Updated At': new Date().toLocaleString('en-IN'),
  };
};

/**
 * Save or update an application row in the Excel (.xlsx) spreadsheet
 * @param {Object} applicationData
 * @returns {string} File path of the written excel file
 */
const saveApplicationToExcel = (application, user = {}, student = {}, payment = {}) => {
  try {
    const rowData = formatApplicationForExcel(application, user, student, payment);
    const identifier = rowData['Application ID'] || rowData['ARN / Application Number'];

    let workbook;
    let rows = [];

    if (fs.existsSync(excelFilePath)) {
      try {
        workbook = xlsx.readFile(excelFilePath);
        const firstSheetName = workbook.SheetNames[0];
        if (firstSheetName) {
          rows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName]);
        }
      } catch (readErr) {
        console.warn('Could not parse existing Excel file, creating fresh workbook:', readErr.message);
        rows = [];
      }
    }

    if (!workbook) {
      workbook = xlsx.utils.book_new();
    }

    // Check if this application already exists in the rows
    const existingIndex = rows.findIndex(
      (r) =>
        (identifier && (r['Application ID'] === identifier || r['ARN / Application Number'] === identifier)) ||
        (rowData['Email Address'] && r['Email Address'] === rowData['Email Address'] && r['Course Preference'] === rowData['Course Preference'])
    );

    if (existingIndex !== -1) {
      // Update existing row
      rows[existingIndex] = { ...rows[existingIndex], ...rowData };
    } else {
      // Append new row
      rows.push(rowData);
    }

    // Generate sheet from JSON
    const worksheet = xlsx.utils.json_to_sheet(rows);

    // Auto-fit column widths
    if (rows.length > 0) {
      const colWidths = Object.keys(rows[0]).map((key) => {
        let maxLen = key.length;
        rows.forEach((r) => {
          const valStr = r[key] ? String(r[key]) : '';
          if (valStr.length > maxLen) maxLen = valStr.length;
        });
        return { wch: Math.min(Math.max(maxLen + 2, 12), 45) };
      });
      worksheet['!cols'] = colWidths;
    }

    // Replace or add sheet
    const sheetName = 'Admissions_2026';
    if (workbook.SheetNames.includes(sheetName)) {
      workbook.Sheets[sheetName] = worksheet;
    } else {
      xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    // Write to disk
    xlsx.writeFile(workbook, excelFilePath);
    console.log(`[Excel Sync]: Application ${identifier} saved to ${excelFilePath}`);
    return excelFilePath;
  } catch (error) {
    console.error('[Excel Sync Error]: Failed to write application to Excel:', error.message);
    return null;
  }
};

/**
 * Get all applications in an Excel buffer for download
 * @param {Array} applicationsList
 * @returns {Buffer}
 */
const exportApplicationsToExcelBuffer = (applicationsList = []) => {
  const rows = applicationsList.map((app) =>
    formatApplicationForExcel(app, app.user || {}, app.student || {}, app.payment || {})
  );

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Message': 'No applications available' }]);

  if (rows.length > 0) {
    worksheet['!cols'] = Object.keys(rows[0]).map((key) => {
      let maxLen = key.length;
      rows.forEach((r) => {
        const valStr = r[key] ? String(r[key]) : '';
        if (valStr.length > maxLen) maxLen = valStr.length;
      });
      return { wch: Math.min(Math.max(maxLen + 2, 12), 45) };
    });
  }

  xlsx.utils.book_append_sheet(workbook, worksheet, 'Applications');
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = {
  saveApplicationToExcel,
  exportApplicationsToExcelBuffer,
  getExcelFilePath: () => excelFilePath,
};

