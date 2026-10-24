const { Schema, model } = require('mongoose');

// A named combination of filters and sorting that can be re-applied with one click.
// `filters` is validated and cleaned by lib/job-search.js (cleanFilters) before it is saved.
const savedFilterSchema = new Schema(
  {
    name: { type: String, required: [true, 'Give the filter a name'], trim: true, maxlength: [60, 'Use 60 characters or fewer'] },
    filters: { type: Schema.Types.Mixed, default: {} },
    sort: { type: String, default: 'dateSaved' },
    order: { type: String, enum: ['asc', 'desc'], default: 'desc' }
  },
  { timestamps: true }
);

// Names are unique regardless of upper or lower case.
savedFilterSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = model('SavedFilter', savedFilterSchema);
