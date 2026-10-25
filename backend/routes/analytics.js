const express = require('express');
const Job = require('../models/Job');
const Event = require('../models/Event');
const { buildAnalytics } = require('../lib/analytics');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/analytics?tz=Asia/Kolkata
// One payload for the dashboard: totals, funnel, status counts, weekly and monthly series,
// upcoming and overdue events, next actions, insights and recent activity.
// `tz` (an IANA zone) decides which calendar day an event falls on for the weekly and monthly charts.
router.get('/', wrap(async (req, res) => {
  const [jobs, events] = await Promise.all([
    Job.find({ user: req.user._id })
      .select('company title status statusChangedAt statusHistory dateSaved createdAt isArchived')
      .lean(),
    Event.find({ user: req.user._id })
      .select('job type round title startsAt timeZone status completedAt')
      .populate({ path: 'job', select: 'company title status isArchived' })
      .lean()
  ]);
  res.json(buildAnalytics({ jobs, events, statuses: Job.STATUSES, timeZone: req.query.tz }));
}));

module.exports = router;
