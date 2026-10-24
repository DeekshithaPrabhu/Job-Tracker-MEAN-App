# Job Application Tracker (MEAN stack)

MongoDB + Express + Angular 18 + Node.js. Save every job opportunity, move it through your hiring pipeline, and keep a history of every change.

## Features

- Company, job title, location, work mode (Remote, Hybrid, On-site)
- Job description, posting URL, date saved
- Salary range (with currency), experience level, required skills
- Employment type: Full-time, Contract, Internship
- Recruiter name, email, phone and profile link
- Edit, delete, archive/restore, and favorite
- Search, filters (work mode, type, level), sorting, and Active / Favorites / Archived lists

### Dashboard and job search analytics (Dashboard page, the landing page)

- **Summary cards**: saved jobs, applications submitted (and how many in the last 7 days), upcoming interviews (with the next one), overdue follow-ups, offers received (and how many are still open), and rejections
- **Progress over time**: grouped bar chart of jobs saved, applications submitted and interviews, by week (last 12) or by month (last 6). Hover a group for the exact numbers
- **Applications by status**: one bar per pipeline stage, plus a conversion strip (Saved, Applied, Interviewed, Offers) with the percentage that moves on from each step
- **Where to focus**: plain-language hints that point at the weak spots, for example no applications this week, applications with no reply for 14+ days, saved jobs left untouched, overdue follow-ups, few interviews per application, or interviews that are not turning into offers
- **Next actions**: a prioritised list (reply to offers, late follow-ups, events to update, interview prep, check-ins on silent applications, saved jobs to apply to or archive). Click an item to open the event or job
- **Interviews and follow-ups**: overdue items first, then what is coming up
- **Recent activity**: the latest status changes, new jobs and completed events
- The page refreshes itself when jobs or events change. Weeks start on Monday and are cut in your own time zone

### Interviews and follow-ups (Schedule page)

- Five event types: Interview, Recruiter Call, Assessment, Follow-up, Check-in
- Interview date, time and **time zone** (any IANA zone; shown in the event's zone and in yours), length, meeting link and location
- Interview round: HR, Technical, Managerial, Final
- Interviewer or contact details (name, role, email, phone) and preparation notes
- Recruiter follow-ups and application check-ins with a due date, a contact channel, and recruiter details prefilled from the job
- **Upcoming** agenda grouped by day (with a "Needs an update" group for events that have passed), a month **Calendar** with a day panel, and a **Past** list
- Mark an event **Completed**, **Rescheduled** (new date and time, old ones are kept in a history) or **Cancelled**, and reopen it later
- **Reminders** before each event (at the time, 15 or 30 minutes, 1 or 3 hours, 1 or 2 days). They show as notifications in the app and, if you allow it on the Schedule page, as desktop alerts. Dismissing a reminder is saved on the server; rescheduling re-arms them
- Each job's sheet lists its events and has an Add event button
- Moving a job to **Withdrawn** automatically cancels its upcoming events (anything Scheduled or Rescheduled), whether you drag the card, use a dropdown, or edit the job. Completed events are left alone, and you can reopen a cancelled event from its detail sheet
- Scheduling an interview or assessment can move the job along the pipeline (a checkbox on the form), and completing an interview moves "Interview Scheduled" to "Interview Completed"

### Application status and pipeline

- Eight stages: Saved / Interested, Applied, Assessment, Interview Scheduled, Interview Completed, Offer Received, Rejected, Withdrawn
- **Board view**: one column per stage; drag a card to another column to update its status (works with mouse and touch)
- **Table view**: sortable by the toolbar, filterable by status, with an inline status dropdown on every row
- **Status history**: every change is stored with the previous stage, a timestamp and an optional note, and shown as a timeline in the job's detail sheet
- Moves update instantly on screen and roll back with a message if the server rejects them
- Apple-inspired interface: frosted navigation, soft depth, springy hover and press motion, light and dark mode, reduced-motion support

## Prerequisites

- Node.js 18.19+ (20+ recommended)
- MongoDB running locally (`mongodb://127.0.0.1:27017`) or a MongoDB Atlas connection string

## Run it

```bash
cd job-tracker
npm run install:all                 # installs root, backend and frontend dependencies
cp backend/.env.example backend/.env  # edit MONGODB_URI if needed
npm run dev                         # API on :3000, Angular on :4200
```

Open http://localhost:4200. The Angular dev server proxies `/api` to the Express API (`frontend/proxy.conf.json`).

To run the pieces separately: `npm --prefix backend run dev` and `npm --prefix frontend start`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/jobs` | List jobs. Query: `view` (active, favorites, archived, all), `search`, `status`, `workMode`, `employmentType`, `experienceLevel`, `sort` (dateSaved, company, title, updatedAt), `order` (asc, desc) |
| GET | `/api/jobs/stats` | Counts for active, favorites, archived |
| GET | `/api/jobs/:id` | Get one job |
| POST | `/api/jobs` | Create a job |
| PUT | `/api/jobs/:id` | Update a job |
| PATCH | `/api/jobs/:id/status` | Move a job to a new stage and record history (`{ "status": "Applied", "note": "Applied online" }`) |
| PATCH | `/api/jobs/:id/favorite` | Set or toggle favorite (`{ "value": true }`) |
| PATCH | `/api/jobs/:id/archive` | Set or toggle archive (`{ "value": true }`) |
| DELETE | `/api/jobs/:id` | Delete a job |

### Analytics API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/analytics` | Everything the dashboard shows in one response. Query: `tz` (IANA time zone used to cut weeks and months, default UTC) |

The response holds `totals`, `rates`, `funnel`, `byStatus`, `series.weeks` / `series.months` (zero-filled), `upcoming`, `overdue`, `nextActions`, `insights` and `recent`.

How the numbers are counted:

- **Application submitted**: a job that reached Applied or any later active stage (Assessment, Interview Scheduled, Interview Completed, Offer Received). A job rejected or withdrawn before it was applied to is not an application. The date used for the charts is the first time it reached one of those stages.
- **Interviewed**: the job reached an interview stage, or it has an Interview event that was not cancelled.
- **Offers received**: jobs that ever reached Offer Received; **open offers** are those still in that stage. **Rejections** are jobs currently in Rejected.
- **Overdue follow-up**: a Follow-up or Check-in that is still Scheduled or Rescheduled and whose time has passed. Other events that have passed but were never closed are counted separately as "events to update".
- Archived jobs stay in the totals and charts (they are part of your history) but never create upcoming items or next actions. Jobs in Rejected or Withdrawn are left out of upcoming items and next actions too.
- Thresholds (14 days without a reply, 7 days for saved jobs, and so on) are constants at the top of `backend/lib/analytics.js`.

### Events API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/events` | List events. Query: `job`, `type`, `status`, `scope` (upcoming, past, all), `from`, `to`, `order` |
| GET | `/api/events/reminders/due` | Reminders whose time has come and that are not dismissed |
| GET | `/api/events/:id` | Get one event |
| POST | `/api/events` | Create an event (`reminders` is a list of minutes before; `updateJobStatus` moves the job along) |
| PUT | `/api/events/:id` | Update an event (a new `startsAt` counts as a reschedule) |
| POST | `/api/events/:id/reschedule` | `{ startsAt, timeZone, note }` sets a new time, sets status Rescheduled, re-arms reminders |
| PATCH | `/api/events/:id/status` | `{ status }` where status is Scheduled, Completed, Rescheduled or Cancelled |
| POST | `/api/events/:id/reminders/:reminderId/dismiss` | Dismiss one reminder |
| DELETE | `/api/events/:id` | Delete an event |

Times are stored as UTC instants together with the event's time zone, so the same moment is shown correctly wherever you open the app. Deleting a job deletes its events.

### Job document

```json
{
  "company": "Northwind Labs",
  "title": "Senior Frontend Engineer",
  "location": "Berlin, Germany",
  "workMode": "Hybrid",
  "employmentType": "Full-time",
  "experienceLevel": "Senior",
  "description": "…",
  "postingUrl": "https://example.com/jobs/1",
  "dateSaved": "2026-10-24T00:00:00.000Z",
  "salary": { "min": 75000, "max": 95000, "currency": "EUR" },
  "skills": ["Angular", "TypeScript"],
  "recruiter": { "name": "Mara Keller", "email": "mara@example.com", "phone": "+49 30 1234567", "linkedin": "https://…" },
  "status": "Interview Scheduled",
  "statusChangedAt": "2026-10-20T09:00:00.000Z",
  "statusHistory": [
    { "from": null, "to": "Saved / Interested", "changedAt": "2026-10-10T09:00:00.000Z", "note": "Job saved" },
    { "from": "Saved / Interested", "to": "Applied", "changedAt": "2026-10-12T09:00:00.000Z" },
    { "from": "Applied", "to": "Interview Scheduled", "changedAt": "2026-10-20T09:00:00.000Z", "note": "Intro call on Friday" }
  ],
  "isFavorite": false,
  "isArchived": false
}
```

## Structure

```
backend/   server.js, models/{Job,Event}.js, routes/{jobs,events,analytics}.js, lib/analytics.js (pure metrics builder)
frontend/  src/app/ app.component, job-*.ts (applications), schedule.component, schedule.store,
           dashboard.component, analytics.{model,service}.ts,
           event-form / event-detail / event-row / reminders components, time.util.ts, src/styles.css
```

## Notes

- Clients can only write whitelisted fields; validation (required fields, enums, URL and email format, salary min <= max) lives in the Mongoose model and is surfaced in the form.
- Searches are regex-escaped, and invalid ids return 400 instead of crashing.
- Jobs saved before the pipeline existed are given the "Saved / Interested" status and a first history entry automatically when the API starts.
- Drag and drop uses Angular CDK. For keyboard users, the status dropdown (table view) and the "Move to" control in the detail sheet do the same thing.
- Cards keep their order by date saved (or the sort you pick); dragging only changes the column.
- Reminders work while the app is open in a browser tab: it checks every minute, and the server remembers which ones you dismissed. There is no email or push delivery when the app is closed; that would need a mail service or push provider.
- The Schedule page loads all of your events at once and builds the calendar in the browser, which is plenty for a personal job search.
- The dashboard charts are drawn with plain SVG, so there is no charting library to install. All metrics are computed on the server in `lib/analytics.js` from the jobs' status history and the events, so they can be tested without a database.
- Next steps if you want to extend it: email reminders, calendar (.ics) export, user accounts with JWT.
