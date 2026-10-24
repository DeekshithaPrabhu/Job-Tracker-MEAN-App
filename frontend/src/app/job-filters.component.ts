import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  DATE_LABELS, DATE_PRESETS, DEFAULT_SORT, DateRangeKey, SORT_OPTIONS
} from './job-query.model';
import { JobQueryStore } from './job-query.store';
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, PRIORITIES, PRIORITY_COLORS, STATUSES, WORK_MODES } from './job.model';

/** Search box, sorting, the filter panel and saved filters for the Applications page. */
@Component({
  selector: 'app-job-filters',
  standalone: true,
  template: `
    <section class="filterbar" aria-label="Search, filter and sort">
      <div class="fb-row">
        <input class="pill-input" type="search" placeholder="Search company, title, skill" aria-label="Search applications"
               [value]="q.filters().search" (input)="q.setText('search', $any($event.target).value)" />

        <button type="button" class="btn" [class.primary]="q.activeCount() > 0" [attr.aria-expanded]="open()"
                aria-controls="filter-panel" (click)="open.set(!open())">
          Filters
          @if (q.activeCount() > 0) { <span class="count-badge">{{ q.activeCount() }}</span> }
        </button>

        <select class="pill-select" aria-label="Sort by" (change)="q.setSort($any($event.target).value)">
          @for (o of sortOptions; track o.value) {
            <option [value]="o.value" [selected]="o.value === q.sortValue()">{{ o.label }}</option>
          }
        </select>

        <span class="fb-spacer"></span>

        @if (q.saved().length) {
          <select class="pill-select" aria-label="Saved filters" (change)="q.apply($any($event.target).value)">
            <option value="" [selected]="!q.activeSavedId()">Saved filters</option>
            @for (s of q.saved(); track s._id) {
              <option [value]="s._id" [selected]="s._id === q.activeSavedId()">{{ s.name }}</option>
            }
          </select>
        }
        @if (q.activeSaved(); as active) {
          @if (q.savedChanged()) {
            <button type="button" class="btn small" (click)="updateSaved()">Update “{{ active.name }}”</button>
          }
          <button type="button" class="btn small danger" (click)="deleteSaved(active._id, active.name)">Delete</button>
        }
        @if (canSave()) {
          <button type="button" class="btn small" (click)="startSave()">Save filter</button>
        }
        @if (q.activeCount() > 0) {
          <button type="button" class="btn small ghost" (click)="q.clear()">Clear</button>
        }
      </div>

      @if (saving()) {
        <div class="fb-row save-row">
          <input class="pill-input" type="text" placeholder="Name this filter, for example “Remote, high priority”"
                 aria-label="Filter name" maxlength="60" [value]="name()"
                 (input)="name.set($any($event.target).value)" (keydown.enter)="confirmSave()" />
          <button type="button" class="btn small primary" (click)="confirmSave()">Save</button>
          <button type="button" class="btn small ghost" (click)="saving.set(false)">Cancel</button>
        </div>
      }
      @if (message()) { <p class="banner err" role="alert">{{ message() }}</p> }

      @if (open()) {
        <div id="filter-panel" class="fb-panel" role="group" aria-label="Filters">
          <fieldset class="fb-group wide">
            <legend>Status</legend>
            <div class="chip-row">
              @for (s of statuses; track s) {
                <button type="button" class="chip-toggle" [class.on]="q.filters().statuses.includes(s)"
                        [attr.aria-pressed]="q.filters().statuses.includes(s)" (click)="q.toggleStatus(s)">{{ s }}</button>
              }
            </div>
          </fieldset>

          <fieldset class="fb-group">
            <legend>Priority</legend>
            <div class="chip-row">
              @for (p of priorities; track p) {
                <button type="button" class="chip-toggle" [class.on]="q.filters().priorities.includes(p)"
                        [attr.aria-pressed]="q.filters().priorities.includes(p)" (click)="q.togglePriority(p)">
                  <span class="prio-dot" [style.background]="priorityColor(p)"></span>{{ p }}
                </button>
              }
            </div>
          </fieldset>

          <div class="fb-group">
            <label class="fb-label" for="f-location">Location</label>
            <input id="f-location" class="pill-input" type="text" placeholder="City or country"
                   [value]="q.filters().location" (input)="q.setText('location', $any($event.target).value)" />
          </div>

          @for (g of dateGroups; track g.key) {
            <div class="fb-group">
              <label class="fb-label" [attr.for]="'f-' + g.key">{{ g.label }}</label>
              <select class="pill-select" [id]="'f-' + g.key" (change)="q.setDatePreset(g.key, $any($event.target).value)">
                <option value="" [selected]="!q.filters()[g.key].preset">Any date</option>
                @for (p of g.presets; track p.id) {
                  <option [value]="p.id" [selected]="q.filters()[g.key].preset === p.id">{{ p.label }}</option>
                }
              </select>
              @if (q.filters()[g.key].preset === 'custom') {
                <div class="fb-dates">
                  <input type="date" class="pill-input" [attr.aria-label]="g.label + ' from'"
                         [value]="q.filters()[g.key].from" [attr.max]="q.filters()[g.key].to || null"
                         (change)="q.setDateBound(g.key, 'from', $any($event.target).value)" />
                  <span class="muted small-text">to</span>
                  <input type="date" class="pill-input" [attr.aria-label]="g.label + ' to'"
                         [value]="q.filters()[g.key].to" [attr.min]="q.filters()[g.key].from || null"
                         (change)="q.setDateBound(g.key, 'to', $any($event.target).value)" />
                </div>
              }
            </div>
          }

          <div class="fb-group">
            <label class="fb-label" for="f-mode">Work mode</label>
            <select id="f-mode" class="pill-select" (change)="q.setField('workMode', $any($event.target).value)">
              <option value="" [selected]="!q.filters().workMode">Any work mode</option>
              @for (m of workModes; track m) { <option [value]="m" [selected]="q.filters().workMode === m">{{ m }}</option> }
            </select>
          </div>
          <div class="fb-group">
            <label class="fb-label" for="f-type">Employment type</label>
            <select id="f-type" class="pill-select" (change)="q.setField('employmentType', $any($event.target).value)">
              <option value="" [selected]="!q.filters().employmentType">Any type</option>
              @for (t of employmentTypes; track t) { <option [value]="t" [selected]="q.filters().employmentType === t">{{ t }}</option> }
            </select>
          </div>
          <div class="fb-group">
            <label class="fb-label" for="f-level">Experience level</label>
            <select id="f-level" class="pill-select" (change)="q.setField('experienceLevel', $any($event.target).value)">
              <option value="" [selected]="!q.filters().experienceLevel">Any level</option>
              @for (l of levels; track l) { <option [value]="l" [selected]="q.filters().experienceLevel === l">{{ l }}</option> }
            </select>
          </div>
        </div>
      }
    </section>
  `
})
export class JobFiltersComponent {
  readonly q = inject(JobQueryStore);

  readonly statuses = STATUSES;
  readonly priorities = PRIORITIES;
  readonly workModes = WORK_MODES;
  readonly employmentTypes = EMPLOYMENT_TYPES;
  readonly levels = EXPERIENCE_LEVELS;
  readonly sortOptions = SORT_OPTIONS;
  readonly dateGroups: { key: DateRangeKey; label: string; presets: { id: string; label: string }[] }[] = [
    { key: 'applied', label: DATE_LABELS.applied, presets: DATE_PRESETS.applied },
    { key: 'interview', label: DATE_LABELS.interview, presets: DATE_PRESETS.interview }
  ];

  readonly open = signal(false);
  readonly saving = signal(false);
  readonly name = signal('');
  readonly message = signal('');

  priorityColor(p: (typeof PRIORITIES)[number]): string {
    return PRIORITY_COLORS[p];
  }

  /** Offer "Save filter" when something is switched on, unless the applied saved filter already matches. */
  canSave(): boolean {
    const something = this.q.activeCount() > 0 || this.q.sortValue() !== DEFAULT_SORT;
    return something && !this.saving() && (!this.q.activeSaved() || this.q.savedChanged());
  }

  startSave(): void {
    this.message.set('');
    this.name.set('');
    this.saving.set(true);
  }

  confirmSave(): void {
    const name = this.name().trim();
    if (!name) {
      this.message.set('Enter a name for this filter.');
      return;
    }
    this.message.set('');
    this.q.save(name).subscribe({
      next: () => this.saving.set(false),
      error: (err: HttpErrorResponse) => this.fail(err, 'The filter could not be saved.')
    });
  }

  updateSaved(): void {
    this.message.set('');
    this.q.update().subscribe({ error: (err: HttpErrorResponse) => this.fail(err, 'The filter could not be updated.') });
  }

  deleteSaved(id: string, name: string): void {
    if (!confirm(`Delete the saved filter “${name}”? Your jobs are not affected.`)) return;
    this.message.set('');
    this.q.remove(id).subscribe({ error: (err: HttpErrorResponse) => this.fail(err, 'The filter could not be deleted.') });
  }

  private fail(err: HttpErrorResponse, fallback: string): void {
    this.message.set(
      err.status === 0
        ? 'Could not reach the server. Check that the API is running on port 3000.'
        : err.error?.errors?.name ?? err.error?.message ?? fallback
    );
  }
}
