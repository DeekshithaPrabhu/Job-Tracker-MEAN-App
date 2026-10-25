import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ContactInput, Job, JobDocument } from './job.model';

/** Notes, contacts, links and files for one job. Every call returns the updated job. */
@Injectable({ providedIn: 'root' })
export class JobDetailsService {
  private readonly http = inject(HttpClient);
  private readonly base = (jobId: string) => `/api/jobs/${jobId}`;

  saveNotes(jobId: string, notes: { companyNotes: string; recruiterNotes: string }): Observable<Job> {
    return this.http.patch<Job>(`${this.base(jobId)}/notes`, notes);
  }

  addContact(jobId: string, contact: ContactInput): Observable<Job> {
    return this.http.post<Job>(`${this.base(jobId)}/contacts`, contact);
  }

  updateContact(jobId: string, contactId: string, contact: ContactInput): Observable<Job> {
    return this.http.put<Job>(`${this.base(jobId)}/contacts/${contactId}`, contact);
  }

  deleteContact(jobId: string, contactId: string): Observable<Job> {
    return this.http.delete<Job>(`${this.base(jobId)}/contacts/${contactId}`);
  }

  addLink(jobId: string, link: { title: string; url: string }): Observable<Job> {
    return this.http.post<Job>(`${this.base(jobId)}/documents`, link);
  }

  /** The file is sent as the request body; its name and title travel in headers. */
  uploadFile(jobId: string, file: File, title: string): Observable<Job> {
    let headers = new HttpHeaders({
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name)
    });
    if (title.trim()) headers = headers.set('X-Doc-Title', encodeURIComponent(title.trim()));
    return this.http.post<Job>(`${this.base(jobId)}/documents/upload`, file, { headers });
  }

  renameDocument(jobId: string, docId: string, title: string): Observable<Job> {
    return this.http.put<Job>(`${this.base(jobId)}/documents/${docId}`, { title });
  }

  deleteDocument(jobId: string, docId: string): Observable<Job> {
    return this.http.delete<Job>(`${this.base(jobId)}/documents/${docId}`);
  }

  downloadUrl(jobId: string, doc: JobDocument): string {
    return `${this.base(jobId)}/documents/${doc._id}/file`;
  }
}
