import { Component, computed, inject } from '@angular/core';
import { PAGE_SIZES } from './job-query.model';
import { JobQueryStore } from './job-query.store';

/** Previous / next, numbered pages and a page size picker, shared by the board and the table. */
@Component({
  selector: 'app-pager',
  standalone: true,
  template: `
    @if (q.total() > 0) {
      <nav class="pager" aria-label="Pagination">
        <span class="muted small-text" aria-live="polite">{{ first() }} to {{ last() }} of {{ q.total() }}</span>

        @if (q.pages() > 1) {
          <div class="pager-ctrl">
            <button type="button" class="btn small" [disabled]="q.page() <= 1" (click)="q.setPage(q.page() - 1)">Previous</button>
            @for (p of numbers(); track $index) {
              @if (p === 0) {
                <span class="muted" aria-hidden="true">…</span>
              } @else {
                <button type="button" class="btn small" [class.primary]="p === q.page()"
                        [attr.aria-current]="p === q.page() ? 'page' : null" [attr.aria-label]="'Page ' + p"
                        (click)="q.setPage(p)">{{ p }}</button>
              }
            }
            <button type="button" class="btn small" [disabled]="q.page() >= q.pages()" (click)="q.setPage(q.page() + 1)">Next</button>
          </div>
        }

        <label class="pager-size muted small-text">
          Per page
          <select class="pill-select" (change)="q.setPageSize(+$any($event.target).value)">
            @for (n of sizes; track n) { <option [value]="n" [selected]="n === q.pageSize()">{{ n }}</option> }
          </select>
        </label>
      </nav>
    }
  `
})
export class PagerComponent {
  readonly q = inject(JobQueryStore);
  readonly sizes = PAGE_SIZES;

  readonly first = computed(() => (this.q.page() - 1) * this.q.pageSize() + 1);
  readonly last = computed(() => Math.min(this.q.total(), this.q.page() * this.q.pageSize()));

  /** Page numbers with 0 standing for a gap: 1 … 4 5 6 … 12. */
  readonly numbers = computed(() => {
    const total = this.q.pages();
    const current = this.q.page();
    const keep = new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total));
    const out: number[] = [];
    let prev = 0;
    for (const n of [...keep].sort((a, b) => a - b)) {
      if (prev && n - prev > 1) out.push(0);
      out.push(n);
      prev = n;
    }
    return out;
  });
}
