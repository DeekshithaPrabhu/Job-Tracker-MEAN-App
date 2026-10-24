# Job Application Tracker (MEAN stack)

MongoDB + Express + Angular 18 + Node.js. Save every job opportunity in one place, with favorites and an archive.

## Features

- Company, job title, location, work mode (Remote, Hybrid, On-site)
- Job description, posting URL, date saved
- Salary range (with currency), experience level, required skills
- Employment type: Full-time, Contract, Internship
- Recruiter name, email, phone and profile link
- Edit, delete, archive/restore, and favorite
- Search, filters (work mode, type, level), sorting, and Active / Favorites / Archived lists

## Prerequisites

- Node.js 18.19+ (20+ recommended)
- MongoDB running locally (`mongodb://127.0.0.1:27017`) or a MongoDB Atlas connection string

## Run it

```bash
cd job-tracker
npm run install:all                 # installs root, backend and frontend dependencies
cp backend/.env.example backend/.env  # edit MONGODB_URI if needed
npm run seed                        # optional: load 3 sample jobs
npm run dev                         # API on :3000, Angular on :4200
```

Open http://localhost:4200. The Angular dev server proxies `/api` to the Express API (`frontend/proxy.conf.json`).

To run the pieces separately: `npm --prefix backend run dev` and `npm --prefix frontend start`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/jobs` | List jobs. Query: `view` (active, favorites, archived, all), `search`, `workMode`, `employmentType`, `experienceLevel`, `sort` (dateSaved, company, title, updatedAt), `order` (asc, desc) |
| GET | `/api/jobs/stats` | Counts for active, favorites, archived |
| GET | `/api/jobs/:id` | Get one job |
| POST | `/api/jobs` | Create a job |
| PUT | `/api/jobs/:id` | Update a job |
| PATCH | `/api/jobs/:id/favorite` | Set or toggle favorite (`{ "value": true }`) |
| PATCH | `/api/jobs/:id/archive` | Set or toggle archive (`{ "value": true }`) |
| DELETE | `/api/jobs/:id` | Delete a job |

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
  "isFavorite": false,
  "isArchived": false
}
```

## Structure

```
backend/   server.js, models/Job.js, routes/jobs.js, seed.js
frontend/  src/app/{app.component, job-form.component, job.service, job.model}.ts, src/styles.css
```

## Notes

- Clients can only write whitelisted fields; validation (required fields, enums, URL and email format, salary min <= max) lives in the Mongoose model and is surfaced in the form.
- Searches are regex-escaped, and invalid ids return 400 instead of crashing.
- Next steps if you want to extend it: application status pipeline (Applied, Interview, Offer), reminders, user accounts with JWT.
