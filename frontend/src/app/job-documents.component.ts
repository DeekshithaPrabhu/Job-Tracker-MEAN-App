import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, output, signal } from '@angular/core';
import { JobDetailsService } from './job-details.service';
import { Job, JobDocument } from './job.model';

const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'png', 'jpg', 'jpeg']; // the server checks again

const formatSize = (bytes = 0) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Links and files for one application: resume version sent, cover letter, offer letter, job post copy. */
@Component({
  selector: 'app-job-documents',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="panel">
      <h3>Add a link</h3>
      <div class="grid two">
        <label class="field">
          <span>Link</span>
          <input type="url" placeholder="https://" [value]="url()" (input)="url.set($any($event.target).value)" (keydown.enter)="addLink()" />
        </label>
        <label class="field">
          <span>Title <small class="hint">(optional)</small></span>
          <input type="text" maxlength="150" [value]="linkTitle()" (input)="linkTitle.set($any($event.target).value)" (keydown.enter)="addLink()" />
        </label>
      </div>
      <div class="row-end"><button type="button" class="btn" [disabled]="busy() || !url().trim()" (click)="addLink()">Add link</button></div>
    </section>

    <section class="panel">
      <h3>Upload a file</h3>
      <div class="grid two">
        <label class="field">
          <span>File</span>
          <input #picker type="file" [accept]="accept" (change)="file.set($any($event.target).files?.[0] ?? null)" />
          <small class="hint">PDF, Word, text or image, up to 10 MB.</small>
        </label>
        <label class="field">
          <span>Title <small class="hint">(optional)</small></span>
          <input type="text" maxlength="150" [value]="fileTitle()" (input)="fileTitle.set($any($event.target).value)" />
        </label>
      </div>
      <div class="row-end">
        <button type="button" class="btn" [disabled]="busy() || !file()" (click)="upload(picker)">{{ busy() && file() ? 'Uploading…' : 'Upload' }}</button>
      </div>
    </section>

    @if (error()) { <p class="banner err" role="alert">{{ error() }}</p> }

    <section class="panel">
      <h3>Attached</h3>
      @if (job().documents?.length) {
        <ul class="doc-list">
          @for (d of job().documents; track d._id) {
            <li class="doc">
              <span class="doc-kind" [attr.data-kind]="d.kind" aria-hidden="true">{{ d.kind === 'link' ? 'Link' : ext(d) }}</span>
              <div class="doc-main">
                @if (renamingId() === d._id) {
                  <input type="text" maxlength="150" [value]="draft()" aria-label="Title" (input)="draft.set($any($event.target).value)"
                         (keydown.enter)="saveName(d)" (keydown.escape)="renamingId.set(null)" />
                } @else if (d.kind === 'link') {
                  <a [href]="d.url" target="_blank" rel="noopener noreferrer"><strong>{{ d.title }}</strong></a>
                } @else {
                  <a [href]="downloadUrl(d)" download><strong>{{ d.title }}</strong></a>
                }
                <span class="muted small-text">
                  {{ d.kind === 'link' ? host(d) : d.fileName + ', ' + size(d) }}, added {{ d.addedAt | date: 'd MMM y' }}
                </span>
              </div>
              <div class="doc-actions">
                @if (renamingId() === d._id) {
                  <button type="button" class="btn small" (click)="saveName(d)">Save</button>
                  <button type="button" class="btn small ghost" (click)="renamingId.set(null)">Cancel</button>
                } @else {
                  <button type="button" class="btn small ghost" (click)="rename(d)">Rename</button>
                  <button type="button" class="btn small ghost danger" (click)="remove(d)">Remove</button>
                }
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="muted">Nothing attached yet. Keep the posting, your tailored resume, a cover letter or an offer letter here.</p>
      }
    </section>
  `
})
export class JobDocumentsComponent {
  private readonly api = inject(JobDetailsService);

  readonly job = input.required<Job>();
  readonly updated = output<Job>();

  readonly accept = EXTENSIONS.map((e) => `.${e}`).join(',');
  readonly url = signal('');
  readonly linkTitle = signal('');
  readonly file = signal<File | null>(null);
  readonly fileTitle = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly renamingId = signal<string | null>(null);
  readonly draft = signal('');

  ext(d: JobDocument): string {
    return (d.fileName?.split('.').pop() ?? 'file').slice(0, 4).toUpperCase();
  }

  size(d: JobDocument): string {
    return formatSize(d.size);
  }

  host(d: JobDocument): string {
    try {
      return new URL(d.url ?? '').hostname;
    } catch {
      return d.url ?? '';
    }
  }

  downloadUrl(d: JobDocument): string {
    return this.api.downloadUrl(this.job()._id, d);
  }

  addLink(): void {
    if (this.busy() || !this.url().trim()) return;
    this.run(this.api.addLink(this.job()._id, { url: this.url().trim(), title: this.linkTitle().trim() }), () => {
      this.url.set('');
      this.linkTitle.set('');
    });
  }

  upload(picker: HTMLInputElement): void {
    const file = this.file();
    if (!file || this.busy()) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!EXTENSIONS.includes(ext)) return this.error.set(`That file type is not allowed. Use one of: ${EXTENSIONS.join(', ')}.`);
    if (file.size > MAX_BYTES) return this.error.set('The file is too large. The limit is 10 MB.');
    if (file.size === 0) return this.error.set('The file is empty.');
    this.run(this.api.uploadFile(this.job()._id, file, this.fileTitle()), () => {
      this.file.set(null);
      this.fileTitle.set('');
      picker.value = '';
    });
  }

  rename(d: JobDocument): void {
    this.draft.set(d.title);
    this.renamingId.set(d._id);
  }

  saveName(d: JobDocument): void {
    const title = this.draft().trim();
    if (!title) return;
    this.run(this.api.renameDocument(this.job()._id, d._id, title), () => this.renamingId.set(null));
  }

  remove(d: JobDocument): void {
    if (!confirm(`Remove "${d.title}"? ${d.kind === 'file' ? 'The stored file is deleted too.' : ''}`.trim())) return;
    this.run(this.api.deleteDocument(this.job()._id, d._id));
  }

  private run(request: ReturnType<JobDetailsService['addLink']>, after?: () => void): void {
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (job) => {
        this.busy.set(false);
        after?.();
        this.updated.emit(job);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(
          err.status === 0 ? 'Could not reach the server.'
            : err.status === 413 ? 'The file is too large. The limit is 10 MB.'
            : err.error?.message ?? 'That did not work. Try again.'
        );
      }
    });
  }
}
