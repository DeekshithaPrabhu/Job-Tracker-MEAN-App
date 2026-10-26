import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Job, JobInput, JobPage, JobQuery, JobStats, JobStatus } from './job.model';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class JobService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/jobs`;

  private params(query: JobQuery): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return params;
  }

  /** Every matching job, no paging. */
  list(query: JobQuery): Observable<Job[]> {
    return this.http.get<Job[]>(this.base, { params: this.params(query) });
  }

  /** One page of matches (send page and limit). */
  search(query: JobQuery): Observable<JobPage> {
    return this.http.get<JobPage>(this.base, { params: this.params(query) });
  }

  get(id: string): Observable<Job> {
    return this.http.get<Job>(`${this.base}/${id}`);
  }

  stats(): Observable<JobStats> {
    return this.http.get<JobStats>(`${this.base}/stats`);
  }

  create(job: JobInput): Observable<Job> {
    return this.http.post<Job>(this.base, job);
  }

  update(id: string, job: JobInput): Observable<Job> {
    return this.http.put<Job>(`${this.base}/${id}`, job);
  }

  setStatus(id: string, status: JobStatus, note = ''): Observable<Job> {
    return this.http.patch<Job>(`${this.base}/${id}/status`, { status, note });
  }

  setFavorite(id: string, value: boolean): Observable<Job> {
    return this.http.patch<Job>(`${this.base}/${id}/favorite`, { value });
  }

  setArchived(id: string, value: boolean): Observable<Job> {
    return this.http.patch<Job>(`${this.base}/${id}/archive`, { value });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
