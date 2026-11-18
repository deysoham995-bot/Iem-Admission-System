import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CourseService } from '../../../core/services/course.service';
import { StudentService } from '../../../core/services/student.service';
import { ApplicationService } from '../../../core/services/application.service';
import { DocumentService } from '../../../core/services/document.service';
import { PaymentService } from '../../../core/services/payment.service';
import { AuthService } from '../../../core/services/auth.service';
import { Course } from '../../../core/models/course.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-apply-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './apply-wizard.component.html',
  styleUrls: ['./apply-wizard.component.scss'],
})
export class ApplyWizardComponent implements OnInit {
  fb = inject(FormBuilder);
  route = inject(ActivatedRoute);
  router = inject(Router);
  courseService = inject(CourseService);
  studentService = inject(StudentService);
  applicationService = inject(ApplicationService);
  documentService = inject(DocumentService);
  paymentService = inject(PaymentService);
  authService = inject(AuthService);

  currentStep = 1; // 1: Course, 2: Personal, 3: Academic, 4: Documents, 5: Review, 6: Payment
  courses: Course[] = [];
  selectedCourse: Course | null = null;
  studentProfile: any = null;
  applicationId: string | null = null;
  applicationNumber: string = '';
  arn: string = '';
  arnGeneratedDate: string | Date | null = null;

  // Reactive Form for FR-6 & FR-7
  form!: FormGroup;

  // Documents State (FR-9, FR-10, FR-11)
  uploadedDocs: { [key: string]: any } = {};
  selectedPreviewDoc: any = null;
  showPreviewModal = false;
  uploadError: string = '';

  // Draft Autosave state (FR-8)
  lastSavedTime: Date | null = null;
  draftStatus: string = 'Draft';
  draftNotification: string = '';

  // Declaration & Review
  declarationAccepted = false;

  // Payment State (FR-13, FR-14, FR-15)
  applicationFee = environment.applicationFee || 2000;
  paymentMethod: 'DEBIT_CARD' | 'CREDIT_CARD' | 'UPI' | 'NET_BANKING' = 'UPI';
  isProcessingPayment = false;
  paymentSuccess = false;
  paymentReceipt: any = null;

  // Payment mock fields
  cardDetails = {
    cardNumber: '',
    cardholderName: '',
    expiryDate: '',
    cvv: '',
  };
  upiId = '';
  selectedBank = 'State Bank of India';

  banksList = [
    'State Bank of India',
    'HDFC Bank',
    'ICICI Bank',
    'Axis Bank',
    'Punjab National Bank',
    'Kotak Mahindra Bank',
    'Bank of Baroda',
    'Canara Bank',
  ];

  isLoading = true;
  isSaving = false;
  errorMessage = '';

  ngOnInit(): void {
    this.initForm();
    this.loadInitialData();
  }

  // Initialize FR-6 Reactive Form with validations as per FR-6 & FR-7
  initForm(): void {
    const today = new Date().toISOString().split('T')[0];

    this.form = this.fb.group({
      // Personal Details (FR-6)
      fullName: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
          Validators.pattern(/^[a-zA-Z\s]+$/),
        ],
      ],
      dob: ['', [Validators.required]],
      gender: ['Male', [Validators.required]],
      nationality: ['Indian', [Validators.required, Validators.maxLength(50)]],
      category: ['General', [Validators.required]],
      address: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
      city: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      state: ['West Bengal', [Validators.required, Validators.maxLength(50)]],
      pincode: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],

      // Academic Details (FR-6)
      qualification: ['10+2 / Higher Secondary', [Validators.required]],
      board: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
      passingYear: [
        new Date().getFullYear(),
        [Validators.required, Validators.pattern(/^[0-9]{4}$/), Validators.min(1980), Validators.max(2027)],
      ],
      percentage: [
        null,
        [Validators.required, Validators.min(0), Validators.max(100), Validators.pattern(/^\d+(\.\d{1,2})?$/)],
      ],
      stream: ['Science'],
      entranceExam: ['IEMJEE'],
      entranceRank: [''],

      // Course Preference (FR-6)
      coursePreference: ['', [Validators.required]],
    });
  }

  loadInitialData(): void {
    this.isLoading = true;

    this.courseService.getCourses({}).subscribe({
      next: (res) => {
        this.courses = res.courses || [];

        this.studentService.getProfile().subscribe({
          next: (sRes) => {
            this.studentProfile = sRes.student;
            const user = this.authService.currentUserValue;

            // Prepopulate form from current user and student profile
            this.form.patchValue({
              fullName: user?.name || '',
              email: user?.email || '',
              phone: user?.phone ? String(user.phone).replace(/\D/g, '').slice(-10) : '',
              dob: this.studentProfile?.dob ? new Date(this.studentProfile.dob).toISOString().split('T')[0] : '',
              gender: this.studentProfile?.gender || 'Male',
              nationality: this.studentProfile?.nationality || 'Indian',
              category: this.studentProfile?.category?.includes('OBC')
                ? 'OBC'
                : this.studentProfile?.category || 'General',
              address: this.studentProfile?.address?.present?.street || '',
              city: this.studentProfile?.address?.present?.city || '',
              state: this.studentProfile?.address?.present?.state || 'West Bengal',
              pincode: this.studentProfile?.address?.present?.pincode || '',
              qualification: '10+2 / Higher Secondary',
              board: this.studentProfile?.academics?.class12?.board || 'WBCHSE',
              passingYear: this.studentProfile?.academics?.class12?.passingYear || 2025,
              percentage: this.studentProfile?.academics?.class12?.percentage || 85.0,
              stream: this.studentProfile?.academics?.class12?.stream || 'Science',
              entranceExam: this.studentProfile?.academics?.entranceExam?.examType || 'IEMJEE',
              entranceRank: this.studentProfile?.academics?.entranceExam?.rank || '',
            });

            // Check if there is an existing DRAFT to resume (FR-8)
            this.checkAndResumeDraft();
            this.loadMyDocuments();
          },
          error: () => {
            this.isLoading = false;
          },
        });
      },
      error: () => {
        this.isLoading = false;
      },
    });
  }

  checkAndResumeDraft(): void {
    const queryAppId = this.route.snapshot.queryParams['appId'];

    this.applicationService.getMyApplications().subscribe({
      next: (res) => {
        const myApps = res.applications || [];
        let targetApp: any = null;

        if (queryAppId) {
          targetApp = myApps.find((a: any) => a._id === queryAppId);
        } else {
          // Look for latest DRAFT application
          targetApp = myApps.find((a: any) => a.status === 'DRAFT');
        }

        if (targetApp) {
          this.applicationId = targetApp._id;
          this.applicationNumber = targetApp.applicationNumber;
          this.draftStatus = 'Draft';
          this.lastSavedTime = new Date(targetApp.updatedAt || targetApp.createdAt);

          // Find selected course
          const crsId = targetApp.course?._id || targetApp.course;
          const matchedCourse = this.courses.find((c) => c._id === crsId);
          if (matchedCourse) {
            this.selectCourse(matchedCourse);
          }

          // Populate saved form data if available
          if (targetApp.formData) {
            this.form.patchValue(targetApp.formData);
            if (targetApp.formData.dob) {
              const dStr = new Date(targetApp.formData.dob).toISOString().split('T')[0];
              this.form.get('dob')?.setValue(dStr);
            }
          }

          if (targetApp.currentStep && targetApp.currentStep > 1) {
            this.currentStep = targetApp.currentStep;
          }
        } else {
          // Check queryCourseId
          const queryCourseId = this.route.snapshot.queryParams['courseId'];
          if (queryCourseId) {
            const matched = this.courses.find((c) => c._id === queryCourseId);
            if (matched) this.selectCourse(matched);
          }
        }

        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      },
    });
  }

  loadMyDocuments(): void {
    this.documentService.getMyDocuments().subscribe({
      next: (res) => {
        (res.documents || []).forEach((doc: any) => {
          this.uploadedDocs[doc.documentType] = doc;
          // Map aliases if any
          if (doc.documentType === 'AADHAAR_CARD') this.uploadedDocs['ID_PROOF'] = doc;
          if (doc.documentType === 'CLASS_12_MARKSHEET') this.uploadedDocs['MARKSHEET'] = doc;
        });
      },
    });
  }

  selectCourse(course: Course): void {
    this.selectedCourse = course;
    this.form.get('coursePreference')?.setValue(`${course.name} (${course.courseCode})`);
  }

  onCourseDropdownChange(courseId: string): void {
    const matched = this.courses.find((c) => c._id === courseId);
    if (matched) {
      this.selectCourse(matched);
    }
  }

  isPdf(doc: any): boolean {
    if (!doc) return false;
    return (
      doc.mimeType === 'application/pdf' ||
      doc.fileName?.toLowerCase().endsWith('.pdf') ||
      doc.originalFileName?.toLowerCase().endsWith('.pdf')
    );
  }

  isImage(doc: any): boolean {
    if (!doc) return false;
    const name = (doc.fileName || doc.originalFileName || '').toLowerCase();
    return (
      doc.mimeType?.startsWith('image/') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.png')
    );
  }

  // FR-8: Save Application as Draft (Incomplete fields explicitly allowed)
  saveDraft(showToast: boolean = true): void {
    if (!this.selectedCourse) {
      if (showToast) alert('Please select a degree program first before saving draft.');
      return;
    }

    this.isSaving = true;
    const formData = this.form.getRawValue();

    this.applicationService
      .saveDraft({
        applicationId: this.applicationId || undefined,
        courseId: this.selectedCourse._id,
        currentStep: this.currentStep,
        formData,
      })
      .subscribe({
        next: (res) => {
          this.isSaving = false;
          this.applicationId = res.application._id;
          this.applicationNumber = res.application.applicationNumber || res.application.arn || 'DRAFT';
          this.lastSavedTime = new Date();
          this.draftStatus = 'Draft';

          if (showToast) {
            this.draftNotification = `Application draft saved successfully at ${this.lastSavedTime.toLocaleTimeString()} (Status: Draft). You can resume anytime.`;
            setTimeout(() => (this.draftNotification = ''), 6000);
          }
        },
        error: (err) => {
          this.isSaving = false;
          if (showToast) {
            alert(err.error?.message || 'Could not save draft. Please check connection.');
          }
        },
      });
  }

  // Navigation between steps with validation checks (FR-6, FR-7)
  goToStep(step: number): void {
    // When moving past Step 1, must have selected a course
    if (step > 1 && !this.selectedCourse) {
      alert('Please select a course to continue.');
      return;
    }

    // Step 2 Validation (Personal Details) when proceeding to Step 3
    if (this.currentStep === 2 && step > 2) {
      const personalFields = ['fullName', 'dob', 'gender', 'nationality', 'category', 'address', 'city', 'state', 'pincode', 'email', 'phone'];
      let hasError = false;
      for (const field of personalFields) {
        const ctrl = this.form.get(field);
        if (ctrl && ctrl.invalid) {
          ctrl.markAsTouched();
          hasError = true;
        }
      }
      if (hasError) {
        alert('Please complete all mandatory personal fields with valid data before proceeding.');
        return;
      }
      // Autosave draft on step completion (FR-8)
      this.saveDraft(false);
    }

    // Step 3 Validation (Academics) when proceeding to Step 4
    if (this.currentStep === 3 && step > 3) {
      const academicFields = ['qualification', 'board', 'passingYear', 'percentage'];
      let hasError = false;
      for (const field of academicFields) {
        const ctrl = this.form.get(field);
        if (ctrl && ctrl.invalid) {
          ctrl.markAsTouched();
          hasError = true;
        }
      }
      if (hasError) {
        alert('Please complete all mandatory academic fields with valid data before proceeding.');
        return;
      }
      this.saveDraft(false);
    }

    // If first time leaving Step 1, create draft on backend
    if (step === 2 && !this.applicationId && this.selectedCourse) {
      this.saveDraft(false);
    }

    this.currentStep = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // FR-9 & FR-10: File Upload with Format & Size Validation
  onFileUpload(event: any, documentType: string): void {
    this.uploadError = '';
    const file: File = event.target.files[0];
    if (!file) return;

    // FR-10: Validate file size (Maximum 5 MB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB in bytes
    if (file.size > MAX_SIZE) {
      this.uploadError = `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 5 MB.`;
      alert(this.uploadError);
      event.target.value = '';
      return;
    }

    // FR-9: Validate file format (PDF, JPEG, JPG, PNG)
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExtensions = ['pdf', 'jpeg', 'jpg', 'png'];

    if (documentType === 'PHOTO') {
      if (!['jpeg', 'jpg', 'png'].includes(ext)) {
        this.uploadError = 'Passport Photograph must strictly be in JPEG or PNG format.';
        alert(this.uploadError);
        event.target.value = '';
        return;
      }
    } else {
      if (!validExtensions.includes(ext)) {
        this.uploadError = 'Invalid file format. Uploaded documents must strictly be in PDF, JPEG, or PNG formats.';
        alert(this.uploadError);
        event.target.value = '';
        return;
      }
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    if (this.applicationId) formData.append('applicationId', this.applicationId);

    this.isSaving = true;
    this.documentService.uploadDocument(formData).subscribe({
      next: (res) => {
        this.isSaving = false;
        const savedDoc = res.document;
        this.uploadedDocs[documentType] = savedDoc;
        if (documentType === 'PHOTO') this.uploadedDocs['PHOTO'] = savedDoc;
        if (documentType === 'CLASS_12_MARKSHEET' || documentType === 'MARKSHEET') {
          this.uploadedDocs['CLASS_12_MARKSHEET'] = savedDoc;
          this.uploadedDocs['MARKSHEET'] = savedDoc;
        }
        if (documentType === 'AADHAAR_CARD' || documentType === 'ID_PROOF') {
          this.uploadedDocs['AADHAAR_CARD'] = savedDoc;
          this.uploadedDocs['ID_PROOF'] = savedDoc;
        }
        if (documentType === 'CATEGORY_CERTIFICATE') {
          this.uploadedDocs['CATEGORY_CERTIFICATE'] = savedDoc;
        }
        event.target.value = '';
      },
      error: (err) => {
        this.isSaving = false;
        event.target.value = '';
        alert(err.error?.message || 'File upload failed. Please try again.');
      },
    });
  }

  // FR-11: Manage Uploaded Documents: View Document
  viewDocument(doc: any): void {
    if (!doc) return;
    this.selectedPreviewDoc = doc;
    this.showPreviewModal = true;
  }

  closePreviewModal(): void {
    this.showPreviewModal = false;
    this.selectedPreviewDoc = null;
  }

  // FR-11: Manage Uploaded Documents: Replace Document
  triggerFileInput(inputId: string): void {
    const el = document.getElementById(inputId) as HTMLInputElement;
    if (el) el.click();
  }

  // FR-11: Manage Uploaded Documents: Delete Document
  deleteDocument(documentType: string): void {
    const doc = this.uploadedDocs[documentType];
    if (!doc) return;

    if (!confirm(`Are you sure you want to delete ${doc.originalFileName || 'this document'}?`)) {
      return;
    }

    if (doc._id) {
      this.documentService.deleteDocument(doc._id).subscribe({
        next: () => {
          delete this.uploadedDocs[documentType];
          if (documentType === 'CLASS_12_MARKSHEET' || documentType === 'MARKSHEET') {
            delete this.uploadedDocs['CLASS_12_MARKSHEET'];
            delete this.uploadedDocs['MARKSHEET'];
          }
          if (documentType === 'AADHAAR_CARD' || documentType === 'ID_PROOF') {
            delete this.uploadedDocs['AADHAAR_CARD'];
            delete this.uploadedDocs['ID_PROOF'];
          }
          if (documentType === 'CATEGORY_CERTIFICATE') {
            delete this.uploadedDocs['CATEGORY_CERTIFICATE'];
          }
        },
        error: () => {
          alert('Could not delete document.');
        },
      });
    } else {
      delete this.uploadedDocs[documentType];
    }
  }

  // Check if category certificate is required (FR-9 conditional requirement)
  isCategoryCertificateRequired(): boolean {
    const cat = this.form.get('category')?.value;
    return ['OBC', 'SC', 'ST', 'EWS'].includes(cat);
  }

  // Validate all mandatory documents are present (FR-9, FR-11)
  isAllMandatoryDocsUploaded(): boolean {
    const hasPhoto = !!this.uploadedDocs['PHOTO'];
    const hasMarksheet = !!this.uploadedDocs['MARKSHEET'] || !!this.uploadedDocs['CLASS_12_MARKSHEET'];
    const hasIdProof = !!this.uploadedDocs['ID_PROOF'] || !!this.uploadedDocs['AADHAAR_CARD'];

    if (!hasPhoto || !hasMarksheet || !hasIdProof) return false;

    if (this.isCategoryCertificateRequired()) {
      return !!this.uploadedDocs['CATEGORY_CERTIFICATE'];
    }
    return true;
  }

  // FR-12: Submit Application & ARN Generation
  submitApplication(): void {
    if (!this.applicationId) {
      alert('Application record not found. Please save as draft first.');
      return;
    }

    if (this.form.invalid) {
      alert('Mandatory form fields are invalid or incomplete. Please review steps 2 and 3.');
      return;
    }

    if (!this.isAllMandatoryDocsUploaded()) {
      alert('Please upload all mandatory documents before final submission (Step 4).');
      return;
    }

    if (!this.declarationAccepted) {
      alert('Please accept the undertaking declaration before submitting.');
      return;
    }

    this.isSaving = true;

    // Save final draft data first
    const formData = this.form.getRawValue();
    this.applicationService
      .saveDraft({
        applicationId: this.applicationId,
        courseId: this.selectedCourse!._id,
        currentStep: 5,
        formData,
      })
      .subscribe({
        next: () => {
          // Officially submit application -> Backend generates ARN (FR-12)
          this.applicationService.submitApplication(this.applicationId!).subscribe({
            next: (res) => {
              this.isSaving = false;
              this.arn = res.application?.arn || res.application?.applicationNumber || `ARN-2026-${Math.floor(100000 + Math.random() * 900000)}`;
              this.applicationNumber = this.arn;
              this.arnGeneratedDate = res.application?.arnGeneratedDate || new Date();
              this.currentStep = 6; // Move to Online Payment step (FR-13)
              window.scrollTo({ top: 0, behavior: 'smooth' });
            },
            error: (err) => {
              this.isSaving = false;
              alert(err.error?.message || 'Submission failed. Please verify required fields.');
            },
          });
        },
        error: () => {
          this.isSaving = false;
          alert('Could not synchronize draft data before submission.');
        },
      });
  }

  // FR-13, FR-14, FR-15: Online Payment & Receipt Generation
  payFee(): void {
    if (!this.applicationId) return;

    // Validate payment method inputs
    if (this.paymentMethod === 'DEBIT_CARD' || this.paymentMethod === 'CREDIT_CARD') {
      const cardNum = this.cardDetails.cardNumber.replace(/\s/g, '');
      if (cardNum.length < 16) {
        alert('Please enter a valid 16-digit card number.');
        return;
      }
      if (!this.cardDetails.expiryDate || !this.cardDetails.cvv) {
        alert('Please enter valid Expiry Date (MM/YY) and CVV.');
        return;
      }
      if (!this.cardDetails.cardholderName.trim()) {
        alert('Please enter the cardholder name.');
        return;
      }
    }

    if (this.paymentMethod === 'UPI' && !this.upiId.trim()) {
      // Default mock UPI ID if empty
      this.upiId = `${this.authService.currentUserValue?.email?.split('@')[0] || 'applicant'}@okaxis`;
    }

    this.isProcessingPayment = true;

    this.paymentService.initializePayment(this.applicationId, this.paymentMethod).subscribe({
      next: (initRes) => {
        // Complete mock gateway authorization
        setTimeout(() => {
          this.paymentService.confirmPayment(initRes.order.transactionId, 'SUCCESS').subscribe({
            next: (confRes) => {
              this.isProcessingPayment = false;
              this.paymentSuccess = true;
              this.paymentReceipt = confRes.payment;
            },
            error: () => {
              this.isProcessingPayment = false;
              alert('Payment processing failed. Please try again.');
            },
          });
        }, 1400);
      },
      error: () => {
        this.isProcessingPayment = false;
        alert('Could not initiate payment session.');
      },
    });
  }

  // Download PDF Application Form
  downloadForm(): void {
    if (!this.applicationId) return;
    this.applicationService.downloadPDF(this.applicationId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `IEM_Admission_${this.arn || this.applicationNumber || 'Application'}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => alert('Could not generate PDF. Please try again.'),
    });
  }

  // FR-15: Download Payment Receipt PDF
  downloadReceiptPDF(): void {
    const rcpNo = this.paymentReceipt?.receiptNumber;
    if (!rcpNo) {
      alert('Receipt number not found.');
      return;
    }

    this.paymentService.downloadReceiptPDF(rcpNo).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `IEM_Receipt_${rcpNo}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        alert('Could not download payment receipt PDF.');
      },
    });
  }

  // Download Application Excel (.xlsx) Sheet
  downloadApplicationExcel(): void {
    if (!this.applicationId) return;
    this.applicationService.downloadExcel(this.applicationId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `IEM_Admission_${this.arn || this.applicationNumber || 'Application'}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => alert('Could not export Excel spreadsheet. Please try again.'),
    });
  }
}
