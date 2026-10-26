import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Analytics } from './analytics.model';
import { localTimeZone } from './time.util';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  /** Weeks and months are cut in the viewer's own time zone. */
  load(): Observable<Analytics> {
    return this.http.get<Analytics>(`${environment.apiUrl}/api/analytics`, { params: new HttpParams().set('tz', localTimeZone()) });
  }
}
