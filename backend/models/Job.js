const { Schema, model } = require('mongoose');

const WORK_MODES = ['Remote', 'Hybrid', 'On-site'];
const EMPLOYMENT_TYPES = ['Full-time', 'Contract', 'Internship'];
const EXPERIENCE_LEVELS = ['Entry', 'Junior', 'Mid', 'Senior', 'Lead', 'Principal'];

const isHttpUrl = (value) => {
  if (!value) return true;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeSkills = (list) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .map((s) => String(s).trim())
    .filter((s) => {
      const key = s.toLowerCase();
      if (!s || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const recruiterSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Recruiter email is not valid'
      }
    },
    phone: { type: String, trim: true, maxlength: 40 },
    linkedin: {
      type: String,
      trim: true,
      validate: { validator: isHttpUrl, message: 'Recruiter profile must be a http(s) URL' }
    }
  },
  { _id: false }
);

const jobSchema = new Schema(
  {
    company: { type: String, required: [true, 'Company name is required'], trim: true, maxlength: 150 },
    title: { type: String, required: [true, 'Job title is required'], trim: true, maxlength: 150 },
    location: { type: String, trim: true, maxlength: 150 },
    workMode: { type: String, enum: { values: WORK_MODES, message: 'Work mode must be Remote, Hybrid or On-site' }, default: 'On-site' },
    employmentType: {
      type: String,
      enum: { values: EMPLOYMENT_TYPES, message: 'Employment type must be Full-time, Contract or Internship' },
      default: 'Full-time'
    },
    experienceLevel: {
      type: String,
      enum: { values: EXPERIENCE_LEVELS, message: 'Unknown experience level' },
      default: 'Mid'
    },
    description: { type: String, trim: true, maxlength: 20000 },
    postingUrl: {
      type: String,
      trim: true,
      validate: { validator: isHttpUrl, message: 'Posting URL must start with http:// or https://' }
    },
    dateSaved: { type: Date, default: Date.now },
    salary: {
      min: { type: Number, min: [0, 'Salary cannot be negative'] },
      max: {
        type: Number,
        min: [0, 'Salary cannot be negative'],
        validate: {
          validator: function (v) {
            const min = this.salary && this.salary.min;
            return v == null || min == null || v >= min;
          },
          message: 'Maximum salary must be at least the minimum'
        }
      },
      currency: { type: String, trim: true, uppercase: true, default: 'USD', maxlength: 3 }
    },
    skills: { type: [String], set: normalizeSkills, default: [] },
    recruiter: { type: recruiterSchema, default: () => ({}) },
    isFavorite: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

jobSchema.index({ isArchived: 1, dateSaved: -1 });
jobSchema.index({ isFavorite: 1 });

module.exports = model('Job', jobSchema);
module.exports.WORK_MODES = WORK_MODES;
module.exports.EMPLOYMENT_TYPES = EMPLOYMENT_TYPES;
module.exports.EXPERIENCE_LEVELS = EXPERIENCE_LEVELS;
