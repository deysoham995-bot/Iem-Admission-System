import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CourseService } from '../../core/services/course.service';
import { AuthService } from '../../core/services/auth.service';
import { Course } from '../../core/models/course.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  courseService = inject(CourseService);
  authService = inject(AuthService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  http = inject(HttpClient);

  courses: Course[] = [];
  selectedDepartment: string = '';
  searchQuery: string = '';
  trackNumber: string = '';
  isLoading = true;

  // Contact form state
  inquiryForm = {
    name: '',
    email: '',
    phone: '',
    courseInterested: 'B.Tech in Computer Science & Engineering',
    message: '',
  };
  isSubmittingInquiry = false;
  inquirySuccessMsg = '';
  inquiryErrorMsg = '';

  departments: string[] = [
    'Department of Computer Science & Engineering',
    'Department of Information Technology',
    'Department of Electronics & Communication',
    'Department of Computer Applications',
    'School of Management',
  ];

  ngOnInit(): void {
    this.loadCourses();

    // Scroll to fragment when accessed via URL with #about or #contact
    this.route.fragment.subscribe((fragment) => {
      if (fragment) {
        setTimeout(() => {
          this.scrollToElement(fragment);
        }, 150);
      }
    });
  }

  scrollToElement(elementId: string): void {
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.pushState(null, '', `#${elementId}`);
    }
  }

  loadCourses(): void {
    this.isLoading = true;
    this.courseService
      .getCourses({
        department: this.selectedDepartment || undefined,
        search: this.searchQuery || undefined,
      })
      .subscribe({
        next: (res) => {
          this.courses = res.courses || [];
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        },
      });
  }

  filterByDepartment(dept: string): void {
    this.selectedDepartment = this.selectedDepartment === dept ? '' : dept;
    this.loadCourses();
  }

  trackApplication(): void {
    if (this.trackNumber.trim()) {
      this.router.navigate(['/track'], {
        queryParams: { appNo: this.trackNumber.trim().toUpperCase() },
      });
    }
  }

  applyForCourse(course: Course): void {
    if (this.authService.isAuthenticated()) {
      if (this.authService.isStudent()) {
        this.router.navigate(['/student/apply'], { queryParams: { courseId: course._id } });
      } else {
        alert('Please log in with a Student account to submit admission applications.');
      }
    } else {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: `/student/apply?courseId=${course._id}` } });
    }
  }

  getEligibilityText(course: Course): string {
    return 'Min 60% in PCM, Valid WBJEE / JEE Main Rank';
  }

  getSemesterFee(course: Course): number {
    return course.feesStructure?.semesterFee || course.feesStructure?.perSemesterTuition || 85000;
  }

  submitInquiry(): void {
    if (!this.inquiryForm.name.trim() || !this.inquiryForm.email.trim() || !this.inquiryForm.phone.trim() || !this.inquiryForm.message.trim()) {
      this.inquiryErrorMsg = 'Please complete all required fields.';
      return;
    }

    this.isSubmittingInquiry = true;
    this.inquiryErrorMsg = '';
    this.inquirySuccessMsg = '';

    this.http.post<any>(`${environment.apiUrl}/helpdesk/contact`, this.inquiryForm).subscribe({
      next: (res) => {
        this.isSubmittingInquiry = false;
        this.inquirySuccessMsg = res.message || 'Thank you! Your inquiry has been sent to the IEM Admissions Directorate.';
        this.inquiryForm = {
          name: '',
          email: '',
          phone: '',
          courseInterested: 'B.Tech in Computer Science & Engineering',
          message: '',
        };
      },
      error: (err) => {
        this.isSubmittingInquiry = false;
        this.inquiryErrorMsg = err.error?.message || 'Could not submit inquiry. Please try calling our helpline directly.';
      },
    });
  }
}
