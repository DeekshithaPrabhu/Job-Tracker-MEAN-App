const express = require('express');
const mongoose = require('mongoose');
const Job = require('../models/Job');

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
  const { view = 'active', search, workMode, employmentType, experienceLevel, sort = 'dateSaved', order = 'desc' } = req.query;
  const filter = {};

  if (view === 'active') filter.isArchived = false;
  else if (view === 'favorites') Object.assign(filter, { isArchived: false, isFavorite: true });
  else if (view === 'archived') filter.isArchived = true;

  if (workMode) filter.workMode = workMode;
  if (employmentType) filter.employmentType = employmentType;
  if (experienceLevel) filter.experienceLevel = experienceLevel;

  if (search && String(search).trim()) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    filter.$or = [{ company: rx }, { title: rx }, { location: rx }, { skills: rx }, { 'recruiter.name': rx }];
  }

  const sortField = SORTABLE[sort] || 'dateSaved';
  const jobs = await Job.find(filter).sort({ [sortField]: order === 'asc' ? 1 : -1 }).lean();
  res.json(jobs);
}));

router.get('/:id', wrap(async (req, res) => {
  const job = await Job.findById(req.params.id).lean();
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json(job);
}));

router.post('/', wrap(async (req, res) => {
  const job = await Job.create(pick(req.body));
  res.status(201).json(job);
}));

router.put('/:id', wrap(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  job.set(pick(req.body));
  await job.save(); // runs all validators, including salary min/max
  res.json(job);
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
  res.status(204).end();
}));

module.exports = router;
