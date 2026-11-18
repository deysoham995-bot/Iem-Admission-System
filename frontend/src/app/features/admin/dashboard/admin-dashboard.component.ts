import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminService } from '../../../core/services/admin.service';
import { ApplicationService } from '../../../core/services/application.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss'],
})
export class AdminDashboardComponent implements OnInit {
  adminService = inject(AdminService);
  applicationService = inject(ApplicationService);

  stats: any = null;
  courseStats: any[] = [];
  monthlyTrends: any[] = [];
  recentActivity: any[] = [];
  isLoading = true;

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    this.isLoading = true;
    this.adminService.getDashboardStats().subscribe({
      next: (res) => {
        this.stats = res.stats;
        this.courseStats = res.courseStats || [];
        this.monthlyTrends = res.monthlyTrends || [];
        this.recentActivity = res.recentActivity || [];
        this.isLoading = false;
      },
      error: () => (this.isLoading = false),
    });
  }

  downloadMasterSpreadsheet(): void {
    this.applicationService.downloadMasterSpreadsheet().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'IEM_Admission_Applications.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => alert('Could not download master spreadsheet.'),
    });
  }

  getMaxMonthlyTotal(): number {
    if (!this.monthlyTrends.length) return 100;
    return Math.max(...this.monthlyTrends.map((m) => m.total || 0), 10);
  }
}
