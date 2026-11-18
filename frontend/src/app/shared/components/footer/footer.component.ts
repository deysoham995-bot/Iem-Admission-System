import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent {
  router = inject(Router);
  currentYear = new Date().getFullYear();

  navigateToSection(sectionId: string, event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    const currentUrl = this.router.url.split('#')[0];
    if (currentUrl === '' || currentUrl === '/') {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.pushState(null, '', `#${sectionId}`);
        return;
      }
    }
    this.router.navigate(['/'], { fragment: sectionId });
  }
}
