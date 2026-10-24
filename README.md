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
- MongoDB Atlas connection string

## Run it

```bash
cd job-tracker
npm run install:all                 # installs root, backend and frontend dependencies
cp backend/.env.example backend/.env  # edit MONGODB_URI if needed
npm run dev                         # API on :3000, Angular on :4200
```

Open http://localhost:4200. The Angular dev server proxies `/api` to the Express API (`frontend/proxy.conf.json`).

## API

| Method | Path                     | Purpose                                                                                                                                                                                              |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/jobs`              | List jobs. Query: `view` (active, favorites, archived, all), `search`, `status`, `workMode`, `employmentType`, `experienceLevel`, `sort` (dateSaved, company, title, updatedAt), `order` (asc, desc) |
| GET    | `/api/jobs/stats`        | Counts for active, favorites, archived                                                                                                                                                               |
| GET    | `/api/jobs/:id`          | Get one job                                                                                                                                                                                          |
| POST   | `/api/jobs`              | Create a job                                                                                                                                                                                         |
| PUT    | `/api/jobs/:id`          | Update a job                                                                                                                                                                                         |
| PATCH  | `/api/jobs/:id/status`   | Move a job to a new stage and record history (`{ "status": "Applied", "note": "Applied online" }`)                                                                                                   |
| PATCH  | `/api/jobs/:id/favorite` | Set or toggle favorite (`{ "value": true }`)                                                                                                                                                         |
| PATCH  | `/api/jobs/:id/archive`  | Set or toggle archive (`{ "value": true }`)                                                                                                                                                          |
| DELETE | `/api/jobs/:id`          | Delete a job                                                                                                                                                                                         |

### Events API

| Method | Path                                            | Purpose                                                                                           |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/api/events`                                   | List events. Query: `job`, `type`, `status`, `scope` (upcoming, past, all), `from`, `to`, `order` |
| GET    | `/api/events/reminders/due`                     | Reminders whose time has come and that are not dismissed                                          |
| GET    | `/api/events/:id`                               | Get one event                                                                                     |
| POST   | `/api/events`                                   | Create an event (`reminders` is a list of minutes before; `updateJobStatus` moves the job along)  |
| PUT    | `/api/events/:id`                               | Update an event (a new `startsAt` counts as a reschedule)                                         |
| POST   | `/api/events/:id/reschedule`                    | `{ startsAt, timeZone, note }` sets a new time, sets status Rescheduled, re-arms reminders        |
| PATCH  | `/api/events/:id/status`                        | `{ status }` where status is Scheduled, Completed, Rescheduled or Cancelled                       |
| POST   | `/api/events/:id/reminders/:reminderId/dismiss` | Dismiss one reminder                                                                              |
| DELETE | `/api/events/:id`                               | Delete an event                                                                                   |

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
  "recruiter": {
    "name": "Mara Keller",
    "email": "mara@example.com",
    "phone": "+49 30 1234567",
    "linkedin": "https://…"
  },
  "status": "Interview Scheduled",
  "statusChangedAt": "2026-10-20T09:00:00.000Z",
  "statusHistory": [
    {
      "from": null,
      "to": "Saved / Interested",
      "changedAt": "2026-10-10T09:00:00.000Z",
      "note": "Job saved"
    },
    {
      "from": "Saved / Interested",
      "to": "Applied",
      "changedAt": "2026-10-12T09:00:00.000Z"
    },
    {
      "from": "Applied",
      "to": "Interview Scheduled",
      "changedAt": "2026-10-20T09:00:00.000Z",
      "note": "Intro call on Friday"
    }
  ],
  "isFavorite": false,
  "isArchived": false
}
```

## Structure

```
backend/   server.js, models/{Job,Event}.js, routes/{jobs,events}.js
frontend/  src/app/ app.component, job-*.ts (applications), schedule.component, schedule.store,
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
- Next steps if you want to extend it: email reminders, calendar (.ics) export, user accounts with JWT.
