const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Job = require('../models/Job');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EDITABLE = [
  'job', 'type', 'round', 'title', 'startsAt', 'timeZone', 'durationMinutes',
  'meetingLink', 'location', 'channel', 'interviewers', 'prepNotes'
];
const pick = (body) => Object.fromEntries(EDITABLE.filter((k) => k in body).map((k) => [k, body[k]]));

const JOB_FIELDS = 'company title status isArchived';
const GRACE_MS = 6 * 60 * 60 * 1000; // keep reminding for 6 hours after the start time
const MAX_LEAD_MS = Event.MAX_REMINDER_MINUTES * 60 * 1000;

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid event id' });
  next();
});

// When an event is scheduled or completed, the job can move along the pipeline automatically.
const SAVED = Job.STATUSES[0];
const PIPELINE_RULES = {
  scheduled: {
    Interview: { from: [SAVED, 'Applied', 'Assessment'], to: 'Interview Scheduled' },
    Assessment: { from: [SAVED, 'Applied'], to: 'Assessment' }
  },
  completed: {
    Interview: { from: ['Interview Scheduled'], to: 'Interview Completed' }
  }
};

async function advanceJob(event, trigger) {
  const rule = PIPELINE_RULES[trigger][event.type];
  if (!rule) return null;
  const job = await Job.findOne({ _id: event.job._id || event.job, user: event.user });
  if (!job || !rule.from.includes(job.status)) return null;
  const what = event.round ? `${event.round} ${event.type.toLowerCase()}` : event.type.toLowerCase();
  job.changeStatus(rule.to, `${what.charAt(0).toUpperCase()}${what.slice(1)} ${trigger}`);
  await job.save();
  return rule.to;
}

const withJob = (query) => query.populate({ path: 'job', select: JOB_FIELDS });

// GET /api/events/reminders/due -> reminders whose time has come and that have not been dismissed
router.get('/reminders/due', wrap(async (req, res) => {
  const now = Date.now();
  const events = await withJob(
    Event.find({
      user: req.user._id,
      status: { $in: Event.ACTIVE_STATUSES },
      startsAt: { $gte: new Date(now - GRACE_MS), $lte: new Date(now + MAX_LEAD_MS) },
      'reminders.dismissedAt': null
    })
  );

  const due = [];
  for (const event of events) {
    if (!event.job || event.job.isArchived) continue;
    for (const reminder of event.reminders) {
      if (reminder.dismissedAt) continue;
      if (event.startsAt.getTime() - reminder.minutesBefore * 60000 <= now) {
        due.push({ eventId: event.id, reminderId: reminder.id, minutesBefore: reminder.minutesBefore, event });
      }
    }
  }
  // Closest event first; if one event has several due reminders, show the tightest one first.
  due.sort((a, b) => a.event.startsAt - b.event.startsAt || a.minutesBefore - b.minutesBefore);
  res.json(due);
}));

// GET /api/events?job=&type=&status=&scope=upcoming|past|all&from=&to=&order=asc|desc
router.get('/', wrap(async (req, res) => {
  const { job, type, status, scope = 'all', from, to, order } = req.query;
  const filter = { user: req.user._id };
  if (job) {
    if (!mongoose.isValidObjectId(job)) return res.status(400).json({ message: 'Invalid job id' });
    filter.job = job;
  }
  if (type) filter.type = type;
  if (status) filter.status = status;

  const range = {};
  if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) range.$lte = new Date(to);

  if (scope === 'upcoming') {
    filter.status = { $in: Event.ACTIVE_STATUSES };
    range.$gte = new Date(Math.max(range.$gte ? range.$gte.getTime() : 0, Date.now()));
  } else if (scope === 'past') {
    filter.status = { $in: ['Completed', 'Cancelled'] };
  }
  if (Object.keys(range).length) filter.startsAt = range;

  const sortDir = order === 'desc' || scope === 'past' ? -1 : 1;
  const events = await withJob(Event.find(filter).sort({ startsAt: sortDir }));
  res.json(events.filter((e) => e.job)); // events whose job no longer exists are skipped
}));

router.get('/:id', wrap(async (req, res) => {
  const event = await withJob(Event.findOne({ _id: req.params.id, user: req.user._id }));
  if (!event) return res.status(404).json({ message: 'Event not found' });
  res.json(event);
}));

router.post('/', wrap(async (req, res) => {
  const data = pick(req.body);
  if (!data.job || !mongoose.isValidObjectId(data.job)) {
    return res.status(400).json({ message: 'Choose the job this event belongs to', errors: { job: 'Choose the job this event belongs to' } });
  }
  if (!(await Job.exists({ _id: data.job, user: req.user._id }))) return res.status(404).json({ message: 'Job not found' });

  const event = new Event({ ...data, user: req.user._id });
  if (Array.isArray(req.body.reminders)) event.setReminders(req.body.reminders);
  await event.save();

  const jobStatusChanged = req.body.updateJobStatus ? await advanceJob(event, 'scheduled') : null;
  await event.populate({ path: 'job', select: JOB_FIELDS });
  res.status(201).json({ ...event.toJSON(), jobStatusChanged });
}));

router.put('/:id', wrap(async (req, res) => {
  const event = await Event.findOne({ _id: req.params.id, user: req.user._id });
  if (!event) return res.status(404).json({ message: 'Event not found' });

  const data = pick(req.body);
  if (data.job && String(data.job) !== String(event.job)) {
    if (!mongoose.isValidObjectId(data.job) || !(await Job.exists({ _id: data.job, user: req.user._id }))) {
      return res.status(404).json({ message: 'Job not found' });
    }
  }

  // A new time counts as a reschedule: the old time is kept and reminders fire again.
  if (data.startsAt) {
    const next = new Date(data.startsAt);
    if (!Number.isNaN(next.getTime()) && next.getTime() !== event.startsAt.getTime()) {
      event.reschedule(next, data.timeZone);
      delete data.startsAt;
    }
  }

  event.set(data);
  if (Array.isArray(req.body.reminders)) event.setReminders(req.body.reminders);
  await event.save();
  await event.populate({ path: 'job', select: JOB_FIELDS });
  res.json(event);
}));

// POST /api/events/:id/reschedule  { startsAt, timeZone?, note? }
router.post('/:id/reschedule', wrap(async (req, res) => {
  const event = await Event.findOne({ _id: req.params.id, user: req.user._id });
  if (!event) return res.status(404).json({ message: 'Event not found' });

  const next = new Date(req.body.startsAt);
  if (!req.body.startsAt || Number.isNaN(next.getTime())) {
    return res.status(400).json({ message: 'Choose a new date and time', errors: { startsAt: 'Choose a new date and time' } });
  }
  event.reschedule(next, req.body.timeZone, req.body.note);
  await event.save();
  await event.populate({ path: 'job', select: JOB_FIELDS });
  res.json(event);
}));

// PATCH /api/events/:id/status  { status, updateJobStatus? }
router.patch('/:id/status', wrap(async (req, res) => {
  const { status, updateJobStatus } = req.body;
  if (!Event.STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Unknown event status', errors: { status: 'Unknown event status' } });
  }
  const event = await Event.findOne({ _id: req.params.id, user: req.user._id });
  if (!event) return res.status(404).json({ message: 'Event not found' });

  event.status = status;
  event.completedAt = status === 'Completed' ? new Date() : undefined;
  await event.save();

  const jobStatusChanged = status === 'Completed' && updateJobStatus ? await advanceJob(event, 'completed') : null;
  await event.populate({ path: 'job', select: JOB_FIELDS });
  res.json({ ...event.toJSON(), jobStatusChanged });
}));

// POST /api/events/:id/reminders/:reminderId/dismiss
router.post('/:id/reminders/:reminderId/dismiss', wrap(async (req, res) => {
  const event = await Event.findOne({ _id: req.params.id, user: req.user._id });
  if (!event) return res.status(404).json({ message: 'Event not found' });
  const reminder = event.reminders.id(req.params.reminderId);
  if (!reminder) return res.status(404).json({ message: 'Reminder not found' });
  reminder.dismissedAt = new Date();
  await event.save();
  res.status(204).end();
}));

router.delete('/:id', wrap(async (req, res) => {
  const event = await Event.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!event) return res.status(404).json({ message: 'Event not found' });
  res.status(204).end();
}));

module.exports = router;
