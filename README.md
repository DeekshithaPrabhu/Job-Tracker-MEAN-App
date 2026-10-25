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

### Accounts and sign-in

- **Create an account or sign in** with an email and password. Every job, event, saved filter, note, contact and file belongs to the account that created it, and nobody else can read or change it
- **Jobs you already had** (saved before accounts existed) are given to the first person who registers
- **Passwords** are hashed with scrypt (built into Node, salted, never stored or logged in plain text). Use at least 8 characters; up to 128 are accepted, so long passphrases work
- **Sessions** are a random token kept in an `httpOnly`, `SameSite=Lax` cookie (and `Secure` in production), so scripts on the page can never read it. Only a hash of the token is stored in MongoDB. Sessions last 14 days, you can keep up to 10 devices signed in, and *Sign out* ends the session on the server
- **Sign-in protection**: attempts are rate limited per address and per email (8 failed tries per email in 15 minutes), the same message is shown whether the email exists or not, and an unknown email takes as long to reject as a wrong password
- **Other protections**: requests that change data are rejected when they come from an unexpected website origin, API responses are not cached and carry security headers, and the JSON body size is limited
- To stop strangers registering on a server you deploy, set `ALLOW_REGISTRATION=false` after creating your account
- **Forgot password**: on the sign-in page choose *Forgot password?*, enter your email, and a one-time link is sent to it. The link works once and expires in 30 minutes, only the newest link works, and using it signs out every device. The page gives the same answer whether or not the email has an account, and requests are rate limited. Reset links always go to your sign-in email, never to the optional emails on the Profile page
- **Sending the email**: set `SMTP_HOST` (and `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, see `backend/.env.example`) and run `npm install` in `backend` so the `nodemailer` package is present. Without SMTP nothing is emailed: the link is printed in the API's terminal, which is handy while developing. Set `APP_URL` to the public address of the site so the link points to it
- **Profile page** (click your name in the header): change your name, add an optional phone number, official email and personal email (clear a box to remove it), and change your password. Changing the password needs the current one and signs out your other devices. The sign-in email itself cannot be changed there

### Job details, notes and documents (job sheet tabs)

Open any application and use the tabs at the top of the sheet:

- **Overview**: status, schedule, history and the existing details
- **Notes**: private notes about the company and about the recruiter (up to 10,000 characters each), with a clear unsaved-changes state
- **People**: recruiters, hiring managers, referral contacts and others, each with email, phone, company, profile link and notes. Contacts are grouped by role, emails and phone numbers are clickable, and you can search for a contact's name from the main search box. The recruiter fields on the job form are still there as a quick place for the main recruiter
- **Documents**: attach links (job post, portfolio piece, offer letter in a shared drive) and upload files (PDF, Word, ODT, RTF, text, Markdown, PNG, JPG, up to 10 MB each, 20 per job). Titles can be renamed, and removing a file deletes it from the server

How files are kept safe: the file type is checked by name and by its first bytes, files are stored outside the web root under a random name in your own folder, downloads go through a signed-in route that checks ownership and are always sent as attachments with `nosniff`, and the content type comes from the allowed-types table, not from the upload. Deleting a job deletes its files.

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

### Search, filters and sorting (Applications page, board and table)

- **Search** by company, title, location, skill or recruiter name
- **Filters** (open the Filters panel): status (pick several), priority (High, Medium, Low), location, application date, interview date, work mode, employment type and experience level. Filters apply to both the board and the table, and a status filter hides the other columns on the board
- **Application date** is when you submitted the application. It is stamped automatically the first time a job reaches Applied or a later stage, and can be edited with the *Date applied* field on the job form. Presets: last 7, 30 or 90 days, or a custom range
- **Interview date** matches jobs that have an Interview event (not cancelled) in the range. Presets: upcoming, next 7 days, next 30 days, past, or a custom range
- **Sort** by newest or oldest saved, latest or earliest application, upcoming interview (soonest first), salary (high to low or low to high), company or job title. Jobs with no application date, no upcoming interview or no salary always come last
- **Filters button** turns blue while the panel is open or any filter is on, and shows how many filter groups are active
- **Reset** clears the search, every filter, the sorting and any applied saved filter, returns to the Active tab and page 1, and shows the default board or table (whichever layout you are in)
- **Pagination** under both the board and the table: previous and next, numbered pages and a page size of 10, 25, 50 or 100 (remembered in your browser). Column counts on the board cover all pages, not just the one on screen
- **Saved filters**: choose *Save filter* to store the current filters and sorting under a name, then pick it from the *Saved filters* menu. After tweaking an applied filter you can *Update* it or *Delete* it. Saved filters live in the database, so they survive reloads and browsers. Relative presets such as "last 7 days" stay relative, so a saved filter keeps working next week
- **Priority** is a new field on every job (default Medium), set on the job form and shown on cards, rows and the job sheet

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
cp backend/.env.example backend/.env  # edit MONGODB_URI if needed; other options are explained inside
npm run dev                         # API on :3000, Angular on :4200
```

Open http://localhost:4200 and create an account. If you already had jobs from an earlier version, they become yours when you register first. The Angular dev server proxies `/api` to the Express API (`frontend/proxy.conf.json`).

To run the pieces separately: `npm --prefix backend run dev` and `npm --prefix frontend start`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/jobs` | List jobs. Query: `view` (active, favorites, archived, all), `search`, `status` and `priority` (one value or comma separated), `location`, `workMode`, `employmentType`, `experienceLevel`, `appliedFrom` / `appliedTo` and `interviewFrom` / `interviewTo` (ISO date-times, inclusive), `sort` (dateSaved, company, title, updatedAt, appliedAt, salary, interview), `order` (asc, desc), `page`, `limit` (max 100). Without `page` or `limit` it returns an array of every match; with them it returns `{ items, total, page, pageSize, pages, statusCounts }`. Each job includes `nextInterviewAt` |
| GET | `/api/jobs/stats` | Counts for active, favorites, archived |
| GET | `/api/jobs/:id` | Get one job |
| POST | `/api/jobs` | Create a job |
| PUT | `/api/jobs/:id` | Update a job |
| PATCH | `/api/jobs/:id/status` | Move a job to a new stage and record history (`{ "status": "Applied", "note": "Applied online" }`) |
| PATCH | `/api/jobs/:id/favorite` | Set or toggle favorite (`{ "value": true }`) |
| PATCH | `/api/jobs/:id/archive` | Set or toggle archive (`{ "value": true }`) |
| DELETE | `/api/jobs/:id` | Delete a job |

### Account API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ name, email, password }` creates an account and signs in |
| POST | `/api/auth/login` | `{ email, password }` signs in |
| POST | `/api/auth/logout` | Ends this session |
| POST | `/api/auth/logout-all` | Ends every session of the signed-in user |
| GET | `/api/auth/me` | The signed-in user, or 401 |
| POST | `/api/auth/forgot` | `{ email }` sends a reset link. Always answers the same way |
| POST | `/api/auth/reset` | `{ token, password }` sets a new password from a reset link and signs out all devices |
| PATCH | `/api/auth/profile` | `{ name?, phone?, officialEmail?, personalEmail? }`; send `""` to clear an optional field |
| POST | `/api/auth/password` | `{ currentPassword, newPassword }` changes the password and signs out other devices |

Every other `/api` route (except `/api/health`) answers 401 without a valid session cookie.

### Job details API (all under `/api/jobs/:id`, each returns the updated job)

| Method | Path | Purpose |
| --- | --- | --- |
| PATCH | `/notes` | `{ companyNotes?, recruiterNotes? }` |
| POST | `/contacts` | `{ name, role, company?, email?, phone?, linkedin?, notes? }` where role is Recruiter, Hiring manager, Referral or Other |
| PUT / DELETE | `/contacts/:contactId` | Change or remove a contact |
| POST | `/documents` | `{ url, title? }` adds a link |
| POST | `/documents/upload` | The file is the request body (`Content-Type: application/octet-stream`); send its name in `X-File-Name` and an optional title in `X-Doc-Title`, both URL-encoded |
| GET | `/documents/:docId/file` | Downloads a stored file |
| PUT / DELETE | `/documents/:docId` | Rename, or remove (also deletes the stored file) |

### Saved filters API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/filters` | List saved filters |
| POST | `/api/filters` | Save one: `{ "name": "Remote, high priority", "filters": { ... }, "sort": "appliedAt", "order": "desc" }` (names are unique, up to 30 filters) |
| PUT | `/api/filters/:id` | Replace what a saved filter applies (and rename it when `name` is sent) |
| DELETE | `/api/filters/:id` | Delete a saved filter |

The filter body is cleaned on the server: unknown fields and invalid values are dropped. The search itself is built in `backend/lib/job-search.js`. Salary sorting uses the top of the range (maximum, else minimum) and does not convert currencies. On start-up the API gives existing jobs a Medium priority and an application date taken from their status history.

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
  "priority": "High",
  "companyNotes": "Series B, strong platform team. Ask about on-call.",
  "contacts": [{ "name": "Dana Lee", "role": "Recruiter", "email": "dana@example.com" }],
  "documents": [{ "kind": "link", "title": "Job post", "url": "https://example.com/jobs/123" }],
  "appliedAt": "2026-10-12T09:00:00.000Z",
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
backend/   server.js, models/{User,Session,Job,Event,SavedFilter}.js, routes/{auth,jobs,job-details,events,analytics,filters}.js,
           middleware/{auth,security}.js, lib/{passwords,rate-limit,cookies,uploads,mailer}.js, models/PasswordReset.js,
           lib/analytics.js (metrics builder), lib/job-search.js (filter, sort and paging pipeline)
frontend/  src/app/ app.component, job-*.ts (applications), schedule.component, schedule.store,
           root.component (sign-in gate), auth-page.component (sign in, register, forgot, reset), profile.component,
           auth.{service,interceptor}.ts,
           job-notes / job-contacts / job-documents components, job-details.service.ts,
           dashboard.component, analytics.{model,service}.ts,
           job-filters.component, pager.component, job-query.{model,store}.ts (filters, sorting, paging, saved filters),
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
