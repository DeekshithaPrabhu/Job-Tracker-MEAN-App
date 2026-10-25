const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const Job = require('../models/Job');
const uploads = require('../lib/uploads');

// Mounted at /api/jobs/:jobId. Everything here belongs to one of the signed-in user's jobs.
const router = express.Router({ mergeParams: true });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const CONTACT_FIELDS = ['name', 'role', 'company', 'email', 'phone', 'linkedin', 'notes'];
const pick = (body, fields) => Object.fromEntries(fields.filter((k) => k in body).map((k) => [k, body[k]]));
const text = (v) => (typeof v === 'string' ? v : undefined);

// Loads req.job, but only when it belongs to the signed-in user. Other /api/jobs/... paths fall through to routes/jobs.js.
router.use(['/notes', '/contacts', '/documents'], wrap(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.jobId)) return res.status(400).json({ message: 'Invalid job id' });
  const job = await Job.findOne({ _id: req.params.jobId, user: req.user._id });
  if (!job) return res.status(404).json({ message: 'Job not found' });
  req.job = job;
  next();
}));

const bad = (res, field, message, status = 400) => res.status(status).json({ message, errors: { [field]: message } });

// --- Notes ---------------------------------------------------------------------------------

// PATCH /api/jobs/:jobId/notes  { companyNotes?, recruiterNotes? }
router.patch('/notes', wrap(async (req, res) => {
  for (const key of ['companyNotes', 'recruiterNotes']) {
    if (key in req.body) {
      if (text(req.body[key]) === undefined) return bad(res, key, 'Notes must be text');
      req.job[key] = req.body[key];
    }
  }
  await req.job.save();
  res.json(req.job);
}));

// --- Contacts ------------------------------------------------------------------------------

router.post('/contacts', wrap(async (req, res) => {
  req.job.contacts.push(pick(req.body, CONTACT_FIELDS));
  await req.job.save();
  res.status(201).json(req.job);
}));

router.put('/contacts/:contactId', wrap(async (req, res) => {
  const contact = req.job.contacts.id(req.params.contactId);
  if (!contact) return res.status(404).json({ message: 'Contact not found' });
  contact.set(pick(req.body, CONTACT_FIELDS));
  await req.job.save();
  res.json(req.job);
}));

router.delete('/contacts/:contactId', wrap(async (req, res) => {
  const contact = req.job.contacts.id(req.params.contactId);
  if (!contact) return res.status(404).json({ message: 'Contact not found' });
  contact.deleteOne();
  await req.job.save();
  res.json(req.job);
}));

// --- Documents and links -------------------------------------------------------------------

const checkRoom = (job, res) => {
  if (job.documents.length >= Job.MAX_DOCUMENTS) {
    bad(res, 'documents', `You can attach up to ${Job.MAX_DOCUMENTS} documents or links per job. Remove one first.`);
    return false;
  }
  return true;
};

// POST /api/jobs/:jobId/documents  { title?, url }  -> adds a link
router.post('/documents', wrap(async (req, res) => {
  if (!checkRoom(req.job, res)) return;
  const url = text(req.body.url) ? req.body.url.trim() : '';
  if (!url) return bad(res, 'url', 'Enter the link.');
  let title = text(req.body.title) ? req.body.title.trim() : '';
  if (!title) {
    try {
      title = new URL(url).hostname;
    } catch {
      return bad(res, 'url', 'Link must start with http:// or https://');
    }
  }
  req.job.documents.push({ kind: 'link', title, url });
  await req.job.save();
  res.status(201).json(req.job);
}));

// POST /api/jobs/:jobId/documents/upload
// The file is the request body (Content-Type: application/octet-stream), its name is in X-File-Name
// (URL-encoded) and an optional title in X-Doc-Title. No multipart parser is needed.
router.post(
  '/documents/upload',
  express.raw({ type: 'application/octet-stream', limit: uploads.MAX_FILE_BYTES }),
  wrap(async (req, res) => {
    if (!checkRoom(req.job, res)) return;
    if (!Buffer.isBuffer(req.body)) return bad(res, 'file', 'Choose a file to upload.', 415);

    const check = uploads.validateUpload(req.get('x-file-name'), req.body);
    if (!check.ok) return bad(res, 'file', check.message);

    let title = req.get('x-doc-title') || '';
    try {
      title = decodeURIComponent(title);
    } catch {
      /* keep as sent */
    }
    title = title.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 150) || check.fileName;

    const storageKey = crypto.randomBytes(16).toString('hex');
    await uploads.saveFile(req.user._id, storageKey, req.body);
    try {
      req.job.documents.push({ kind: 'file', title, fileName: check.fileName, mimeType: check.mime, size: req.body.length, storageKey });
      await req.job.save();
    } catch (err) {
      await uploads.removeFile(req.user._id, storageKey); // do not leave a file behind that nothing points to
      throw err;
    }
    res.status(201).json(req.job);
  })
);

// GET /api/jobs/:jobId/documents/:docId/file  -> downloads a stored file
router.get('/documents/:docId/file', wrap(async (req, res) => {
  const doc = req.job.documents.id(req.params.docId);
  if (!doc || doc.kind !== 'file' || !doc.storageKey) return res.status(404).json({ message: 'File not found' });

  const stream = fs.createReadStream(uploads.filePath(req.user._id, doc.storageKey));
  stream.on('error', (err) => {
    if (res.headersSent) return res.destroy();
    res.status(err.code === 'ENOENT' ? 404 : 500).json({ message: 'The file could not be read' });
  });
  stream.on('open', () => {
    res.set({
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Disposition': uploads.attachmentHeader(doc.fileName || doc.title),
      'Content-Length': String(doc.size),
      'X-Content-Type-Options': 'nosniff'
    });
    stream.pipe(res);
  });
}));

// PUT /api/jobs/:jobId/documents/:docId  { title?, url? }  -> rename (and re-point a link)
router.put('/documents/:docId', wrap(async (req, res) => {
  const doc = req.job.documents.id(req.params.docId);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  if (text(req.body.title) !== undefined) doc.title = req.body.title;
  if (doc.kind === 'link' && text(req.body.url) !== undefined) doc.url = req.body.url;
  await req.job.save();
  res.json(req.job);
}));

router.delete('/documents/:docId', wrap(async (req, res) => {
  const doc = req.job.documents.id(req.params.docId);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const key = doc.storageKey;
  doc.deleteOne();
  await req.job.save();
  if (key) await uploads.removeFile(req.user._id, key);
  res.json(req.job);
}));

module.exports = router;
