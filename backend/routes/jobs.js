const express = require('express');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const Event = require('../models/Event');
const { buildSearch } = require('../lib/job-search');
const { removeJobFiles } = require('../lib/uploads');

const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Only these fields can be written by clients (prevents mass assignment).
const EDITABLE = [
  'company', 'title', 'location', 'workMode', 'employmentType', 'experienceLevel',
  'description', 'postingUrl', 'dateSaved', 'salary', 'skills', 'recruiter', 'priority', 'appliedAt'
];
const pick = (body) => Object.fromEntries(EDITABLE.filter((k) => k in body).map((k) => [k, body[k]]));

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
  const user = req.user._id;
  const [active, favorites, archived] = await Promise.all([
    Job.countDocuments({ user, isArchived: false }),
    Job.countDocuments({ user, isArchived: false, isFavorite: true }),
    Job.countDocuments({ user, isArchived: true })
  ]);
  res.json({ active, favorites, archived });
}));

// GET /api/jobs?view=&search=&status=&priority=&location=&workMode=&employmentType=&experienceLevel=
//               &appliedFrom=&appliedTo=&interviewFrom=&interviewTo=&sort=&order=&page=&limit=
// Without page/limit this returns an array of every match. With them it returns one page:
// { items, total, page, pageSize, pages, statusCounts } where statusCounts covers all matches, not just the page.
// See lib/job-search.js for what each parameter does.
router.get('/', wrap(async (req, res) => {
  const search = buildSearch(req.query, { eventsCollection: Event.collection.name, user: req.user._id });
  const run = (tail) => Job.aggregate([...search.stages, ...tail]).collation({ locale: 'en', strength: 2 });

  if (!search.paged) return res.json(await run([search.cleanup]));

  const { limit } = search;
  const fetchPage = async (page) => {
    const [out] = await run([
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }, search.cleanup],
          total: [{ $count: 'n' }],
          byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }]
        }
      }
    ]);
    return out;
  };

  let page = search.page;
  let out = await fetchPage(page);
  const total = out.total[0] ? out.total[0].n : 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  if (page > pages) {
    page = pages; // e.g. the last item on the last page was deleted
    out = await fetchPage(page);
  }
  res.json({
    items: out.items,
    total,
    page,
    pageSize: limit,
    pages,
    statusCounts: Object.fromEntries(out.byStatus.map((r) => [r._id, r.n]))
  });
}));

router.get('/:id', wrap(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json(job);
}));

router.post('/', wrap(async (req, res) => {
  const job = new Job({ ...pick(req.body), user: req.user._id });
  if (req.body.status) job.status = req.body.status;
  await job.save(); // the model seeds the first history entry
  res.status(201).json(job);
}));

router.put('/:id', wrap(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
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
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  const moved = job.changeStatus(status, note);
  await job.save();
  const cancelledEvents = moved ? await cancelOpenEvents(job) : 0;
  res.json({ ...job.toJSON(), cancelledEvents });
}));

// PATCH /api/jobs/:id/favorite  { value?: boolean }  (toggles when value is omitted)
router.patch('/:id/favorite', wrap(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  job.isFavorite = typeof req.body.value === 'boolean' ? req.body.value : !job.isFavorite;
  await job.save();
  res.json(job);
}));

// PATCH /api/jobs/:id/archive  { value?: boolean }
router.patch('/:id/archive', wrap(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  job.isArchived = typeof req.body.value === 'boolean' ? req.body.value : !job.isArchived;
  await job.save();
  res.json(job);
}));

router.delete('/:id', wrap(async (req, res) => {
  const job = await Job.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  await Event.deleteMany({ job: job._id }); // interviews and follow-ups go with the job
  await removeJobFiles(req.user._id, job.documents); // so do uploaded documents
  res.status(204).end();
}));

module.exports = router;
