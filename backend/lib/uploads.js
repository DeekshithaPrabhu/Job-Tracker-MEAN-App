'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Stored documents. Files live on disk under UPLOAD_DIR/<userId>/<random key>.
 * The key is random and never taken from the client, the original name is kept only as metadata,
 * and every download goes through an authenticated route that checks ownership.
 */

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_NAME_LENGTH = 150;
const KEY_PATTERN = /^[a-f0-9]{32}$/;

const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);
const isPdf = (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const isPng = (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]);
const isJpeg = (b) => startsWith(b, [0xff, 0xd8, 0xff]);
const isZip = (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]); // docx, odt
const isOle = (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0]); // doc
const isRtf = (b) => startsWith(b, [0x7b, 0x5c, 0x72, 0x74, 0x66]); // {\rtf
const isText = (b) => !b.subarray(0, 8192).includes(0); // plain text has no NUL bytes

// Allowed types. The content type sent to the browser comes from this table, never from the upload.
const TYPES = {
  pdf: { mime: 'application/pdf', check: isPdf },
  doc: { mime: 'application/msword', check: isOle },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', check: isZip },
  odt: { mime: 'application/vnd.oasis.opendocument.text', check: isZip },
  rtf: { mime: 'application/rtf', check: isRtf },
  txt: { mime: 'text/plain; charset=utf-8', check: isText },
  md: { mime: 'text/plain; charset=utf-8', check: isText },
  png: { mime: 'image/png', check: isPng },
  jpg: { mime: 'image/jpeg', check: isJpeg },
  jpeg: { mime: 'image/jpeg', check: isJpeg }
};
const ALLOWED_EXTENSIONS = Object.keys(TYPES);

/** Removes path parts, control characters and quotes from a client-supplied file name. */
function cleanFileName(raw) {
  let name = String(raw || '');
  try {
    name = decodeURIComponent(name);
  } catch {
    /* keep the raw value */
  }
  name = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').replace(/^\.+/, '').trim();
  if (name.length > MAX_NAME_LENGTH) {
    const ext = path.extname(name);
    name = name.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
  }
  return name;
}

/** Checks the name, size and first bytes. Returns { ok: true, fileName, ext, mime } or { ok: false, message }. */
function validateUpload(rawName, buffer) {
  const fileName = cleanFileName(rawName);
  if (!fileName) return { ok: false, message: 'The file needs a name.' };
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const type = TYPES[ext];
  if (!type) return { ok: false, message: `That file type is not allowed. Use one of: ${ALLOWED_EXTENSIONS.join(', ')}.` };
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, message: 'The file is empty.' };
  if (buffer.length > MAX_FILE_BYTES) return { ok: false, message: 'The file is too large. The limit is 10 MB.' };
  if (!type.check(buffer)) return { ok: false, message: `The file does not look like a real .${ext} file.` };
  return { ok: true, fileName, ext, mime: type.mime };
}

function filePath(userId, storageKey) {
  if (!KEY_PATTERN.test(String(storageKey))) throw new Error('Invalid storage key');
  const file = path.join(UPLOAD_ROOT, String(userId), storageKey);
  if (!file.startsWith(UPLOAD_ROOT + path.sep)) throw new Error('Invalid storage path');
  return file;
}

async function saveFile(userId, storageKey, buffer) {
  const file = filePath(userId, storageKey);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, buffer, { flag: 'wx', mode: 0o600 });
}

async function removeFile(userId, storageKey) {
  try {
    await fs.promises.unlink(filePath(userId, storageKey));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('Could not delete stored file:', err.message);
  }
}

/** Deletes every stored file of a job (used when the job is deleted). */
async function removeJobFiles(userId, documents = []) {
  await Promise.all(documents.filter((d) => d.storageKey).map((d) => removeFile(userId, d.storageKey)));
}

/** Content-Disposition value with an ASCII fallback and the full UTF-8 name. */
function attachmentHeader(fileName) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

module.exports = {
  UPLOAD_ROOT, MAX_FILE_BYTES, ALLOWED_EXTENSIONS, KEY_PATTERN,
  cleanFileName, validateUpload, filePath, saveFile, removeFile, removeJobFiles, attachmentHeader
};
