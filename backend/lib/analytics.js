'use strict';

/**
 * Builds the dashboard payload from plain job and event documents.
 * It has no database access, so it can be tested with sample data.
 *
 * Definitions
 * - Application submitted: a job that reached Applied or any later active stage
 *   (Assessment, Interview Scheduled, Interview Completed, Offer Received).
 *   Saving a job and then rejecting or withdrawing it before applying is not an application.
 * - Interview reached: the job reached an interview stage, or it has a non-cancelled Interview event.
 * - Offers received: jobs that ever reached Offer Received. Open offers are the ones still in that stage.
 * - Rejections: jobs currently in Rejected.
 * - Overdue follow-up: a Follow-up or Check-in that is still Scheduled/Rescheduled and whose time has passed.
 * - Archived jobs count towards history (totals, charts) but never produce upcoming items or next actions.
 */

const DAY = 24 * 60 * 60 * 1000;

const SAVED = 'Saved / Interested';
const APPLIED_STAGES = ['Applied', 'Assessment', 'Interview Scheduled', 'Interview Completed', 'Offer Received'];
const INTERVIEW_STAGES = ['Interview Scheduled', 'Interview Completed', 'Offer Received'];
const CLOSED = ['Rejected', 'Withdrawn'];
const ACTIVE_EVENT = ['Scheduled', 'Rescheduled'];
const FOLLOW_UP_TYPES = ['Follow-up', 'Check-in'];

const WEEKS = 12;
const MONTHS = 6;
const SOON_DAYS = 3; // events this close become "next actions"
const STALE_APPLIED_DAYS = 14; // applied, no movement
const WAITING_DAYS = 7; // interview done, no decision
const IDLE_SAVED_DAYS = 7; // saved, never applied
const UPCOMING_LIMIT = 6;
const OVERDUE_LIMIT = 6;
const RECENT_LIMIT = 10;
const ACTIONS_LIMIT = 8;
const INSIGHTS_LIMIT = 5;

// --- Time helpers -------------------------------------------------------------------------

function resolveZone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** Returns a function that maps an instant to its calendar day in the zone, as a UTC-midnight number. */
function dayInZone(zone) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (ms) => {
    const parts = fmt.formatToParts(new Date(ms));
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    return Date.UTC(get('year'), get('month') - 1, get('day'));
  };
}

// Weeks start on Monday.
const weekStart = (dayMs) => dayMs - ((new Date(dayMs).getUTCDay() + 6) % 7) * DAY;
const monthStart = (dayMs) => {
  const d = new Date(dayMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

const time = (value) => {
  if (value == null) return null;
  const t = +new Date(value);
  return Number.isFinite(t) ? t : null;
};

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;

function describeSpan(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return plural(minutes, 'minute');
  if (minutes < 1440) return plural(Math.round(minutes / 60), 'hour');
  return plural(Math.round(minutes / 1440), 'day');
}

const eventLabel = (e) => {
  if (e.title) return e.title;
  switch (e.type) {
    case 'Interview': return e.round ? `${e.round} interview` : 'Interview';
    case 'Recruiter Call': return 'Recruiter call';
    case 'Check-in': return 'Application check-in';
    default: return e.type;
  }
};

// --- Builder ------------------------------------------------------------------------------

function buildAnalytics({ jobs = [], events = [], statuses = [], now = Date.now(), timeZone = 'UTC' }) {
  const zone = resolveZone(timeZone);
  const toDay = dayInZone(zone);
  const today = toDay(now);
  const ago = (ms) => `${describeSpan(now - ms)} ago`;
  const inFuture = (ms) => `in ${describeSpan(ms - now)}`;
  const when = (ms) => (ms >= now ? inFuture(ms) : ago(ms));
  const daysSince = (ms) => Math.floor((now - ms) / DAY);

  // Time series: one bucket per week (Monday start) and per month, zero-filled up to now.
  const blank = (ms) => ({ ms, start: isoDay(ms), saved: 0, applied: 0, interviews: 0, offers: 0, rejections: 0 });
  const weeks = [];
  const months = [];
  for (let i = WEEKS - 1; i >= 0; i -= 1) weeks.push(blank(weekStart(today) - i * 7 * DAY));
  const thisMonth = new Date(monthStart(today));
  for (let i = MONTHS - 1; i >= 0; i -= 1) {
    months.push(blank(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - i, 1)));
  }
  const weekIndex = new Map(weeks.map((b) => [b.ms, b]));
  const monthIndex = new Map(months.map((b) => [b.ms, b]));
  const bump = (ms, field) => {
    if (ms == null) return;
    const day = toDay(ms);
    const w = weekIndex.get(weekStart(day));
    const m = monthIndex.get(monthStart(day));
    if (w) w[field] += 1;
    if (m) m[field] += 1;
  };

  // Events: which jobs have had a real interview, and what is still live.
  const goodEvents = events.filter((e) => e && e.job && e.job._id && time(e.startsAt) !== null);
  const interviewJobs = new Set();
  for (const e of goodEvents) {
    if (e.type === 'Interview' && e.status !== 'Cancelled') interviewJobs.add(String(e.job._id));
    if (e.type === 'Interview' && e.status !== 'Cancelled' && (e.status === 'Completed' || time(e.startsAt) <= now)) {
      bump(time(e.startsAt), 'interviews');
    }
  }

  const slim = (e) => ({
    _id: String(e._id),
    type: e.type,
    round: e.round,
    title: e.title,
    startsAt: new Date(e.startsAt).toISOString(),
    timeZone: e.timeZone,
    status: e.status,
    job: { _id: String(e.job._id), company: e.job.company, title: e.job.title }
  });

  const live = goodEvents
    .filter((e) => !e.job.isArchived && !CLOSED.includes(e.job.status) && ACTIVE_EVENT.includes(e.status))
    .sort((a, b) => time(a.startsAt) - time(b.startsAt));
  const upcoming = live.filter((e) => time(e.startsAt) >= now);
  const passed = live.filter((e) => time(e.startsAt) < now);
  const overdueFollowUps = passed.filter((e) => FOLLOW_UP_TYPES.includes(e.type));
  const needUpdate = passed.filter((e) => !FOLLOW_UP_TYPES.includes(e.type));
  const upcomingInterviews = upcoming.filter((e) => e.type === 'Interview');
  const jobsWithLiveEvents = new Set(live.map((e) => String(e.job._id)));

  // Jobs.
  const totals = {
    saved: 0, active: 0, archived: 0, applied: 0, appliedLast7: 0, appliedPrev7: 0,
    interviewed: 0, offersReceived: 0, offersOpen: 0, rejections: 0
  };
  const counts = new Map(statuses.map((s) => [s, 0]));
  const recent = [];
  const actions = [];
  let staleApplied = 0;
  let idleSaved = 0;
  let waiting = 0;

  for (const job of jobs) {
    const id = String(job._id);
    const status = job.status || SAVED;
    const history = job.statusHistory || [];
    const savedAt = time(job.dateSaved) ?? time(job.createdAt) ?? now;
    const changedAt = time(job.statusChangedAt) ?? savedAt;
    const archived = Boolean(job.isArchived);

    const first = (stages) => {
      let best = null;
      for (const h of history) {
        const t = time(h.changedAt);
        if (stages.includes(h.to) && t !== null && (best === null || t < best)) best = t;
      }
      return best;
    };
    const last = (stage) => {
      let best = null;
      for (const h of history) {
        const t = time(h.changedAt);
        if (h.to === stage && t !== null && (best === null || t > best)) best = t;
      }
      return best;
    };

    let appliedAt = first(APPLIED_STAGES);
    let interviewAt = first(INTERVIEW_STAGES);
    if (interviewAt === null && INTERVIEW_STAGES.includes(status)) interviewAt = changedAt;
    const interviewed = interviewAt !== null || interviewJobs.has(id);
    let offerAt = first(['Offer Received']);
    if (offerAt === null && status === 'Offer Received') offerAt = changedAt;
    if (appliedAt === null && (interviewed || APPLIED_STAGES.includes(status))) appliedAt = interviewAt ?? changedAt;
    const rejected = status === 'Rejected';
    const rejectedAt = rejected ? last('Rejected') ?? changedAt : null;

    totals.saved += 1;
    totals[archived ? 'archived' : 'active'] += 1;
    counts.set(status, (counts.get(status) ?? 0) + 1);
    bump(savedAt, 'saved');

    if (appliedAt !== null) {
      totals.applied += 1;
      bump(appliedAt, 'applied');
      const age = now - appliedAt;
      if (age >= 0 && age < 7 * DAY) totals.appliedLast7 += 1;
      else if (age >= 7 * DAY && age < 14 * DAY) totals.appliedPrev7 += 1;
    }
    if (interviewed) totals.interviewed += 1;
    if (offerAt !== null) {
      totals.offersReceived += 1;
      bump(offerAt, 'offers');
      if (status === 'Offer Received') totals.offersOpen += 1;
    }
    if (rejected) {
      totals.rejections += 1;
      bump(rejectedAt, 'rejections');
    }

    // Recent activity: every status change, including the first save.
    for (const h of history) {
      const at = time(h.changedAt);
      if (at === null) continue;
      const added = h.from == null;
      recent.push({
        at,
        kind: added ? 'saved' : 'status',
        text: added
          ? h.to === SAVED ? `Saved ${job.title} at ${job.company}` : `Added ${job.title} at ${job.company} as ${h.to}`
          : `${job.company} moved to ${h.to}`,
        detail: added ? undefined : h.note || `${job.title}, from ${h.from}`,
        status: h.to,
        jobId: id,
        archived
      });
    }

    // Next actions come only from jobs still in play.
    if (archived || CLOSED.includes(status)) continue;
    const hasLive = jobsWithLiveEvents.has(id);
    if (status === 'Offer Received') {
      actions.push({
        kind: 'offer', priority: 1, at: changedAt, jobId: id,
        text: `Respond to the offer from ${job.company}`,
        detail: `${job.title}, received ${ago(offerAt ?? changedAt)}`
      });
    } else if (status === 'Applied' && !hasLive && daysSince(changedAt) >= STALE_APPLIED_DAYS) {
      staleApplied += 1;
      actions.push({
        kind: 'stale-applied', priority: 4, at: changedAt, jobId: id,
        text: `Check in on your application to ${job.company}`,
        detail: `${job.title}, applied ${plural(daysSince(changedAt), 'day')} ago with no update`
      });
    } else if (status === 'Interview Completed' && !hasLive && daysSince(changedAt) >= WAITING_DAYS) {
      waiting += 1;
      actions.push({
        kind: 'waiting', priority: 3, at: changedAt, jobId: id,
        text: `Ask ${job.company} about next steps`,
        detail: `${job.title}, interview finished ${plural(daysSince(changedAt), 'day')} ago`
      });
    } else if (status === SAVED && daysSince(changedAt) >= IDLE_SAVED_DAYS) {
      idleSaved += 1;
      actions.push({
        kind: 'saved-idle', priority: 5, at: changedAt, jobId: id,
        text: `Apply to ${job.company} or archive it`,
        detail: `${job.title}, saved ${plural(daysSince(changedAt), 'day')} ago`
      });
    }
  }

  // Event-driven actions and recent activity.
  for (const e of overdueFollowUps) {
    actions.push({
      kind: 'overdue-followup', priority: 1, at: time(e.startsAt), jobId: String(e.job._id), eventId: String(e._id),
      text: `Follow up with ${e.job.company}`,
      detail: `${eventLabel(e)} was due ${ago(time(e.startsAt))}`
    });
  }
  for (const e of needUpdate) {
    actions.push({
      kind: 'needs-update', priority: 2, at: time(e.startsAt), jobId: String(e.job._id), eventId: String(e._id),
      text: `Update ${eventLabel(e).toLowerCase()} with ${e.job.company}`,
      detail: `It was ${ago(time(e.startsAt))}. Mark it completed, reschedule or cancel it.`
    });
  }
  for (const e of upcoming) {
    const at = time(e.startsAt);
    if (at - now > SOON_DAYS * DAY) break;
    const followUp = FOLLOW_UP_TYPES.includes(e.type);
    actions.push({
      kind: followUp ? 'followup-soon' : 'prepare', priority: followUp ? 3 : 2, at,
      jobId: String(e.job._id), eventId: String(e._id),
      text: followUp ? `Follow up with ${e.job.company}` : `Prepare for ${eventLabel(e).toLowerCase()} with ${e.job.company}`,
      detail: `${followUp ? 'Due' : 'Starts'} ${inFuture(at)}`
    });
  }
  for (const e of goodEvents) {
    const at = time(e.completedAt);
    if (e.status !== 'Completed' || at === null) continue;
    recent.push({
      at, kind: 'event', text: `Completed ${eventLabel(e).toLowerCase()} with ${e.job.company}`,
      detail: e.job.title, eventType: e.type, jobId: String(e.job._id), eventId: String(e._id), archived: Boolean(e.job.isArchived)
    });
  }

  actions.sort((a, b) => a.priority - b.priority || a.at - b.at);
  recent.sort((a, b) => b.at - a.at);

  // Conversion through the funnel.
  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);
  const funnel = [
    { key: 'saved', label: 'Saved', count: totals.saved },
    { key: 'applied', label: 'Applied', count: totals.applied },
    { key: 'interviewed', label: 'Interviewed', count: totals.interviewed },
    { key: 'offers', label: 'Offers', count: totals.offersReceived }
  ];
  const rates = {
    applied: pct(totals.applied, totals.saved),
    interview: pct(totals.interviewed, totals.applied),
    offer: pct(totals.offersReceived, totals.interviewed)
  };

  // Where the search needs attention, most urgent first.
  const insights = [];
  const add = (level, title, detail) => insights.push({ level, title, detail });
  if (overdueFollowUps.length) {
    add('warn', `${plural(overdueFollowUps.length, 'overdue follow-up')}`, 'Send each one today, or reschedule if the timing changed.');
  }
  if (needUpdate.length) {
    add('info', `${plural(needUpdate.length, 'past event')} to update`, 'Mark each one completed, rescheduled or cancelled so your pipeline stays accurate.');
  }
  if (totals.offersOpen) {
    add('good', `${plural(totals.offersOpen, 'open offer')}`, 'Review each one and reply before any deadline.');
  }
  if (totals.applied === 0 && totals.saved > 0) {
    add('warn', 'No applications submitted yet', `${plural(totals.saved, 'saved job')} waiting. Apply to the best fits first.`);
  } else if (totals.applied > 0 && totals.appliedLast7 === 0) {
    add('warn', 'No applications in the last 7 days', idleSaved ? `${plural(idleSaved, 'saved job')} ready to apply to.` : 'Save a few new roles to keep the pipeline moving.');
  } else if (totals.appliedLast7 > 0 && totals.appliedLast7 >= totals.appliedPrev7) {
    add('good', `${plural(totals.appliedLast7, 'application')} in the last 7 days`, `${totals.appliedPrev7} the week before. Keep the pace.`);
  } else if (totals.appliedLast7 < totals.appliedPrev7) {
    add('info', 'Applications slowed down', `${totals.appliedLast7} in the last 7 days, ${totals.appliedPrev7} the week before.`);
  }
  if (staleApplied) add('warn', `${plural(staleApplied, 'application')} with no reply for ${STALE_APPLIED_DAYS}+ days`, 'Send a short follow-up, or move on.');
  if (waiting) add('info', `${plural(waiting, 'interview')} awaiting a decision`, `It has been ${WAITING_DAYS}+ days. Ask about next steps.`);
  if (idleSaved && totals.appliedLast7 > 0) add('info', `${plural(idleSaved, 'saved job')} untouched for ${IDLE_SAVED_DAYS}+ days`, 'Apply, or archive what you will not pursue, to keep the board focused.');
  if (totals.applied >= 10 && rates.interview !== null && rates.interview < 10) {
    add('warn', 'Few applications lead to interviews', `${rates.interview}% of applications reached an interview. Review your resume and the roles you target.`);
  }
  if (totals.interviewed >= 5 && totals.offersReceived === 0) {
    add('warn', 'Interviews are not turning into offers yet', `${plural(totals.interviewed, 'interview')} so far. Practise later rounds and ask for feedback.`);
  }
  if (totals.applied > 0 && !upcoming.length && !totals.offersOpen) {
    add('info', 'Nothing is scheduled', 'No interviews or follow-ups are on your calendar.');
  }
  const order = { warn: 0, info: 1, good: 2 };
  insights.sort((a, b) => order[a.level] - order[b.level]);

  return {
    generatedAt: new Date(now).toISOString(),
    timeZone: zone,
    totals: {
      ...totals,
      upcomingInterviews: upcomingInterviews.length,
      nextInterview: upcomingInterviews[0] ? slim(upcomingInterviews[0]) : null,
      overdueFollowUps: overdueFollowUps.length,
      needsUpdate: needUpdate.length
    },
    rates,
    funnel,
    byStatus: statuses.map((status) => ({ status, count: counts.get(status) ?? 0 })),
    series: {
      weeks: weeks.map(({ ms, ...bucket }) => bucket),
      months: months.map(({ ms, ...bucket }) => bucket)
    },
    upcoming: upcoming.slice(0, UPCOMING_LIMIT).map(slim),
    overdue: passed
      .slice(0, OVERDUE_LIMIT)
      .map((e) => ({ ...slim(e), overdueKind: FOLLOW_UP_TYPES.includes(e.type) ? 'follow-up' : 'update' })),
    nextActions: actions.slice(0, ACTIONS_LIMIT).map(({ at, ...rest }) => rest),
    nextActionsTotal: actions.length,
    insights: insights.slice(0, INSIGHTS_LIMIT),
    recent: recent.slice(0, RECENT_LIMIT).map((r) => ({ ...r, at: new Date(r.at).toISOString() }))
  };
}

module.exports = { buildAnalytics, WEEKS, MONTHS };
