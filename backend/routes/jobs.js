const express = require('express');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const Event = require('../models/Event');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Only these fields can be written by clients (prevents mass assignment).
const EDITABLE = [
  'company', 'title', 'location', 'workMode', 'employmentType', 'experienceLevel',
  'description', 'postingUrl', 'dateSaved', 'salary', 'skills', 'recruiter'
];
const pick = (body) => Object.fromEntries(EDITABLE.filter((k) => k in body).map((k) => [k, body[k]]));

const SORTABLE = { dateSaved: 'dateSaved', company: 'company', title: 'title', updatedAt: 'updatedAt' };

// Withdrawing from a job means its upcoming interviews, calls and follow-ups no longer apply.
async function cancelOpenEvents(job) {
  if (job.status !== 'Withdrawn') return 0;
  const result = await Event.updateMany(
    { job: job._id, status: { $in: Event.ACTIVE_STATUSES } },
    { $set: { status: 'Cancelled' }, $unset: { completedAt: '' } }
  );
  return result.modifiedCount;
}

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid job id' });
  next();
});

// GET /api/jobs/stats  ->  counts for each view
router.get('/stats', wrap(async (req, res) => {
  const [active, favorites, archived] = await Promise.all([
    Job.countDocuments({ isArchived: false }),
    Job.countDocuments({ isArchived: false, isFavorite: true }),
    Job.countDocuments({ isArchived: true })
  ]);
  res.json({ active, favorites, archived });
}));

// GET /api/jobs?view=active|favorites|archived|all&search=&workMode=&employmentType=&experienceLevel=&sort=&order=
router.get('/', wrap(async (req, res) => {
  const { view = 'active', search, status, workMode, employmentType, experienceLevel, sort = 'dateSaved', order = 'desc' } = req.query;
  const filter = {};

  if (view === 'active') filter.isArchived = false;
  else if (view === 'favorites') Object.assign(filter, { isArchived: false, isFavorite: true });
  else if (view === 'archived') filter.isArchived = true;

  if (status) filter.status = status;
  if (workMode) filter.workMode = workMode;
  if (employmentType) filter.employmentType = employmentType;
  if (experienceLevel) filter.experienceLevel = experienceLevel;

  if (search && String(search).trim()) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    filter.$or = [{ company: rx }, { title: rx }, { location: rx }, { skills: rx }, { 'recruiter.name': rx }];
  }

  const sortField = SORTABLE[sort] || 'dateSaved';
  const jobs = await Job.find(filter).sort({ [sortField]: order === 'asc' ? 1 : -1 });
  res.json(jobs);
}));

router.get('/:id', wrap(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json(job);
}));

router.post('/', wrap(async (req, res) => {
  const job = new Job(pick(req.body));
  if (req.body.status) job.status = req.body.status;
  await job.save(); // the model seeds the first history entry
  res.status(201).json(job);
}));

router.put('/:id', wrap(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  job.set(pick(req.body));
  const moved = req.body.status !== undefined && job.changeStatus(req.body.status, req.body.statusNote);
  await job.save(); // runs all validators, including salary min/max
  const cancelledEvents = moved ? await cancelOpenEvents(job) : 0;
  res.json({ ...job.toJSON(), cancelledEvents });
}));

// PATCH /api/jobs/:id/status  { status: string, note?: string }  -> moves the job and records history
router.patch('/:id/status', wrap(async (req, res) => {
  const { status, note } = req.body;
  if (!status) return res.status(400).json({ message: 'Status is required', errors: { status: 'Status is required' } });
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  const moved = job.changeStatus(status, note);
  await job.save();
  const cancelledEvents = moved ? await cancelOpenEvents(job) : 0;
  res.json({ ...job.toJSON(), cancelledEvents });
}));

// PATCH /api/jobs/:id/favorite  { value?: boolean }  (toggles when value is omitted)
router.patch('/:id/favorite', wrap(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  job.isFavorite = typeof req.body.value === 'boolean' ? req.body.value : !job.isFavorite;
  await job.save();
  res.json(job);
}));

// PATCH /api/jobs/:id/archive  { value?: boolean }
router.patch('/:id/archive', wrap(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  job.isArchived = typeof req.body.value === 'boolean' ? req.body.value : !job.isArchived;
  await job.save();
  res.json(job);
}));

router.delete('/:id', wrap(async (req, res) => {
  const job = await Job.findByIdAndDelete(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  await Event.deleteMany({ job: job._id }); // interviews and follow-ups go with the job
  res.status(204).end();
}));

module.exports = router;
