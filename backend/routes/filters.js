const express = require('express');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const SavedFilter = require('../models/SavedFilter');
const { cleanFilters, SORTS } = require('../lib/job-search');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MAX_SAVED = 30;
const ENUMS = {
  STATUSES: Job.STATUSES,
  PRIORITIES: Job.PRIORITIES,
  WORK_MODES: Job.WORK_MODES,
  EMPLOYMENT_TYPES: Job.EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS: Job.EXPERIENCE_LEVELS
};

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid filter id' });
  next();
});

const fields = (body) => ({
  filters: cleanFilters(body.filters, ENUMS),
  sort: SORTS.includes(body.sort) ? body.sort : 'dateSaved',
  order: body.order === 'asc' ? 'asc' : 'desc'
});

const duplicate = (res) =>
  res.status(400).json({ message: 'A saved filter with that name already exists', errors: { name: 'A saved filter with that name already exists' } });

// GET /api/filters
router.get('/', wrap(async (req, res) => {
  res.json(await SavedFilter.find({ user: req.user._id }).sort({ name: 1 }).collation({ locale: 'en', strength: 2 }));
}));

// POST /api/filters  { name, filters, sort, order }
router.post('/', wrap(async (req, res) => {
  if ((await SavedFilter.countDocuments({ user: req.user._id })) >= MAX_SAVED) {
    return res.status(400).json({ message: `You can keep up to ${MAX_SAVED} saved filters. Delete one first.` });
  }
  try {
    res.status(201).json(await SavedFilter.create({ user: req.user._id, name: req.body.name, ...fields(req.body) }));
  } catch (err) {
    if (err.code === 11000) return duplicate(res);
    throw err;
  }
}));

// PUT /api/filters/:id  { name?, filters, sort, order }  -> replaces what the filter applies (and renames it when name is sent)
router.put('/:id', wrap(async (req, res) => {
  const saved = await SavedFilter.findOne({ _id: req.params.id, user: req.user._id });
  if (!saved) return res.status(404).json({ message: 'Saved filter not found' });
  if (req.body.name !== undefined) saved.name = req.body.name;
  saved.set(fields(req.body));
  try {
    await saved.save();
  } catch (err) {
    if (err.code === 11000) return duplicate(res);
    throw err;
  }
  res.json(saved);
}));

router.delete('/:id', wrap(async (req, res) => {
  const removed = await SavedFilter.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!removed) return res.status(404).json({ message: 'Saved filter not found' });
  res.status(204).end();
}));

module.exports = router;
