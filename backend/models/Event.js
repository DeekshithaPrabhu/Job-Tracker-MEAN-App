const { Schema, model } = require('mongoose');

const TYPES = ['Interview', 'Recruiter Call', 'Assessment', 'Follow-up', 'Check-in'];
const ROUNDS = ['HR', 'Technical', 'Managerial', 'Final'];
const STATUSES = ['Scheduled', 'Completed', 'Rescheduled', 'Cancelled'];
const ACTIVE_STATUSES = ['Scheduled', 'Rescheduled'];
const CHANNELS = ['Email', 'Phone', 'LinkedIn', 'Other'];
const MAX_REMINDER_MINUTES = 14 * 24 * 60; // two weeks

const isValidTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const isHttpUrl = (value) => {
  if (!value) return true;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);

const interviewerSchema = new Schema(
  {
    name: { type: String, required: [true, 'Interviewer name is required'], trim: true, maxlength: 120 },
    role: { type: String, trim: true, maxlength: 120 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Interviewer email is not valid'
      }
    },
    phone: { type: String, trim: true, maxlength: 40 }
  },
  { _id: false }
);

const reminderSchema = new Schema({
  minutesBefore: {
    type: Number,
    required: true,
    min: [0, 'Reminder cannot be negative'],
    max: [MAX_REMINDER_MINUTES, 'Reminders can be set up to 14 days ahead'],
    validate: { validator: Number.isInteger, message: 'Reminder must be a whole number of minutes' }
  },
  dismissedAt: { type: Date }
});

const rescheduleSchema = new Schema(
  {
    startsAt: { type: Date, required: true },
    timeZone: { type: String },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 500 }
  },
  { _id: false }
);

const eventSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: [true, 'Choose the job this event belongs to'], index: true },
    type: { type: String, enum: { values: TYPES, message: 'Unknown event type' }, default: 'Interview', required: true },
    round: { type: String, enum: { values: ROUNDS, message: 'Round must be HR, Technical, Managerial or Final' }, set: blankToUndefined },
    title: { type: String, trim: true, maxlength: 150 },
    startsAt: { type: Date, required: [true, 'Date and time are required'] },
    timeZone: {
      type: String,
      default: 'UTC',
      validate: { validator: isValidTimeZone, message: 'Time zone is not recognised' }
    },
    durationMinutes: { type: Number, min: [5, 'Duration is at least 5 minutes'], max: [600, 'Duration is at most 10 hours'], default: 60 },
    meetingLink: { type: String, trim: true, validate: { validator: isHttpUrl, message: 'Meeting link must start with http:// or https://' } },
    location: { type: String, trim: true, maxlength: 200 },
    channel: { type: String, enum: { values: CHANNELS, message: 'Unknown contact channel' }, set: blankToUndefined },
    interviewers: { type: [interviewerSchema], default: [] },
    prepNotes: { type: String, trim: true, maxlength: 10000 },
    status: { type: String, enum: { values: STATUSES, message: 'Unknown event status' }, default: 'Scheduled' },
    completedAt: { type: Date },
    reminders: { type: [reminderSchema], default: [] },
    rescheduledFrom: { type: [rescheduleSchema], default: [] }
  },
  { timestamps: true }
);

eventSchema.index({ startsAt: 1 });
eventSchema.index({ job: 1, startsAt: 1 });
eventSchema.index({ status: 1, startsAt: 1 });

// Rounds only make sense for interviews.
eventSchema.pre('validate', async function clearRound() {
  if (this.type !== 'Interview') this.round = undefined;
});

// Moves the event to a new time, remembers the old one and re-arms every reminder.
eventSchema.methods.reschedule = function reschedule(startsAt, timeZone, note) {
  this.rescheduledFrom.push({ startsAt: this.startsAt, timeZone: this.timeZone, changedAt: new Date(), note: note || undefined });
  this.startsAt = startsAt;
  if (timeZone) this.timeZone = timeZone;
  this.status = 'Rescheduled';
  this.completedAt = undefined;
  this.reminders.forEach((r) => { r.dismissedAt = undefined; });
};

// Accepts a list of "minutes before" values and keeps the dismissed state of reminders that already exist.
eventSchema.methods.setReminders = function setReminders(list) {
  const wanted = [...new Set((Array.isArray(list) ? list : []).map(Number))];
  const existing = new Map(this.reminders.map((r) => [r.minutesBefore, r]));
  this.reminders = wanted.map((minutesBefore) => {
    const current = existing.get(minutesBefore);
    return current ? { _id: current._id, minutesBefore, dismissedAt: current.dismissedAt } : { minutesBefore };
  });
};

module.exports = model('Event', eventSchema);
module.exports.TYPES = TYPES;
module.exports.ROUNDS = ROUNDS;
module.exports.STATUSES = STATUSES;
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports.CHANNELS = CHANNELS;
module.exports.MAX_REMINDER_MINUTES = MAX_REMINDER_MINUTES;
