'use strict';

/**
 * Builds the MongoDB aggregation behind GET /api/jobs: filters, sorting and pagination in one place.
 * No database access here, so the pipeline can be inspected and tested on its own.
 *
 * Query parameters (all optional)
 *   view            active | favorites | archived | all
 *   search          text, matched against company, title, location, skills and recruiter name
 *   status          one status or a comma separated list
 *   priority        High, Medium, Low (comma separated)
 *   location        text contained in the location
 *   workMode, employmentType, experienceLevel   one value or a comma separated list
 *   appliedFrom, appliedTo       ISO date-times, inclusive, applied to jobs' appliedAt
 *   interviewFrom, interviewTo   ISO date-times; jobs with an Interview event (not cancelled) in that range
 *   sort            dateSaved | company | title | updatedAt | appliedAt | salary | interview
 *   order           asc | desc
 *   page, limit     pagination (limit is capped at MAX_LIMIT). Without page/limit every match is returned.
 *
 * Sorting by appliedAt, salary or interview always puts jobs that have no value last.
 * Salary sorts on the top of the range (max, else min); currencies are not converted.
 * "interview" sorts by the next upcoming Interview event that is still Scheduled or Rescheduled.
 */

const ACTIVE_EVENT = ['Scheduled', 'Rescheduled'];
const SORTS = ['dateSaved', 'company', 'title', 'updatedAt', 'appliedAt', 'salary', 'interview'];
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const list = (v) => (v == null ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));
const toDate = (v) => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
};
const toRange = (from, to) => {
  const range = {};
  const f = toDate(from);
  const t = toDate(to);
  if (f) range.$gte = f;
  if (t) range.$lte = t;
  return Object.keys(range).length ? range : null;
};
const hasType = (field, types) => ({ $cond: [{ $in: [{ $type: field }, types] }, 1, 0] });

function buildSearch(q = {}, { now = new Date(), eventsCollection = 'events' } = {}) {
  const clauses = [];

  const view = q.view || 'active';
  if (view === 'active') clauses.push({ isArchived: false });
  else if (view === 'favorites') clauses.push({ isArchived: false, isFavorite: true });
  else if (view === 'archived') clauses.push({ isArchived: true });

  const statuses = list(q.status);
  if (statuses.length) clauses.push({ status: { $in: statuses } });

  for (const key of ['workMode', 'employmentType', 'experienceLevel']) {
    const values = list(q[key]);
    if (values.length) clauses.push({ [key]: { $in: values } });
  }

  const priorities = list(q.priority);
  if (priorities.length) {
    // Jobs saved before priorities existed count as Medium.
    clauses.push(
      priorities.includes('Medium')
        ? { $or: [{ priority: { $in: priorities } }, { priority: { $exists: false } }] }
        : { priority: { $in: priorities } }
    );
  }

  if (q.location && String(q.location).trim()) {
    clauses.push({ location: new RegExp(escapeRegex(String(q.location).trim()), 'i') });
  }

  const applied = toRange(q.appliedFrom, q.appliedTo);
  if (applied) clauses.push({ appliedAt: applied });

  if (q.search && String(q.search).trim()) {
    const rx = new RegExp(escapeRegex(String(q.search).trim()), 'i');
    clauses.push({ $or: [{ company: rx }, { title: rx }, { location: rx }, { skills: rx }, { 'recruiter.name': rx }] });
  }

  const stages = [];
  if (clauses.length) stages.push({ $match: { $and: clauses } });

  // Attach each job's non-cancelled interviews, then work out the next upcoming one.
  stages.push(
    {
      $lookup: {
        from: eventsCollection,
        let: { jobId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$job', '$$jobId'] }, type: 'Interview', status: { $ne: 'Cancelled' } } },
          { $project: { _id: 0, startsAt: 1, status: 1 } }
        ],
        as: 'interviews'
      }
    },
    {
      $addFields: {
        nextInterviewAt: {
          $min: {
            $map: {
              input: {
                $filter: {
                  input: '$interviews',
                  as: 'i',
                  cond: { $and: [{ $in: ['$$i.status', ACTIVE_EVENT] }, { $gte: ['$$i.startsAt', now] }] }
                }
              },
              as: 'i',
              in: '$$i.startsAt'
            }
          }
        },
        salaryTop: { $ifNull: ['$salary.max', '$salary.min'] }
      }
    }
  );

  const interview = toRange(q.interviewFrom, q.interviewTo);
  if (interview) stages.push({ $match: { interviews: { $elemMatch: { startsAt: interview } } } });

  const sortKey = SORTS.includes(q.sort) ? q.sort : 'dateSaved';
  const dir = q.order === 'asc' ? 1 : q.order === 'desc' ? -1 : sortKey === 'interview' ? 1 : -1;
  if (sortKey === 'appliedAt') {
    stages.push({ $addFields: { hasApplied: hasType('$appliedAt', ['date']) } });
    stages.push({ $sort: { hasApplied: -1, appliedAt: dir, dateSaved: -1, _id: 1 } });
  } else if (sortKey === 'salary') {
    stages.push({ $addFields: { hasSalary: hasType('$salaryTop', ['double', 'int', 'long', 'decimal']) } });
    stages.push({ $sort: { hasSalary: -1, salaryTop: dir, dateSaved: -1, _id: 1 } });
  } else if (sortKey === 'interview') {
    stages.push({ $addFields: { hasNext: hasType('$nextInterviewAt', ['date']) } });
    stages.push({ $sort: { hasNext: -1, nextInterviewAt: dir, dateSaved: -1, _id: 1 } });
  } else {
    stages.push({ $sort: { [sortKey]: dir, _id: 1 } });
  }

  const paged = q.page !== undefined || q.limit !== undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.limit, 10) || DEFAULT_LIMIT));
  const page = Math.max(1, parseInt(q.page, 10) || 1);

  return {
    stages,
    // Helper fields used only for filtering and sorting are removed from the response.
    cleanup: { $project: { interviews: 0, salaryTop: 0, hasApplied: 0, hasSalary: 0, hasNext: 0 } },
    paged,
    page,
    limit
  };
}

// --- Saved filters -------------------------------------------------------------------------

const DATE_PRESETS = {
  applied: ['7d', '30d', '90d', 'custom'],
  interview: ['upcoming', 'next7d', 'next30d', 'past', 'custom']
};
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

const pickFrom = (value, allowed) => (typeof value === 'string' && allowed.includes(value) ? value : '');
const pickAll = (value, allowed) => (Array.isArray(value) ? [...new Set(value.filter((v) => allowed.includes(v)))] : []);

function cleanDate(value, kind) {
  const v = value && typeof value === 'object' ? value : {};
  const preset = pickFrom(v.preset, DATE_PRESETS[kind]);
  const custom = preset === 'custom';
  return {
    preset,
    from: custom && DAY_RX.test(v.from) ? v.from : '',
    to: custom && DAY_RX.test(v.to) ? v.to : ''
  };
}

/** Keeps only known fields with valid values, so a saved filter can never hold arbitrary data. */
function cleanFilters(input, enums) {
  const f = input && typeof input === 'object' ? input : {};
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    search: text(f.search, 100),
    statuses: pickAll(f.statuses, enums.STATUSES),
    priorities: pickAll(f.priorities, enums.PRIORITIES),
    location: text(f.location, 100),
    workMode: pickFrom(f.workMode, enums.WORK_MODES),
    employmentType: pickFrom(f.employmentType, enums.EMPLOYMENT_TYPES),
    experienceLevel: pickFrom(f.experienceLevel, enums.EXPERIENCE_LEVELS),
    applied: cleanDate(f.applied, 'applied'),
    interview: cleanDate(f.interview, 'interview')
  };
}

module.exports = { buildSearch, cleanFilters, SORTS, DEFAULT_LIMIT, MAX_LIMIT };
