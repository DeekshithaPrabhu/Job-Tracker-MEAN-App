import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Job, JobInput, JobQuery, JobStats, JobStatus } from './job.model';

@Injectable({ providedIn: 'root' })
export class JobService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/jobs';

  list(query: JobQuery): Observable<Job[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params = params.set(key, value);
    }
    return this.http.get<Job[]>(this.base, { params });
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
