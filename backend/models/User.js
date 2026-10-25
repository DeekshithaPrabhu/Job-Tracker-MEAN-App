const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    name: { type: String, required: [true, 'Enter your name'], trim: true, maxlength: [80, 'Use 80 characters or fewer'] },
    email: { type: String, required: [true, 'Enter your email address'], trim: true, lowercase: true, maxlength: 254, unique: true },
    passwordHash: { type: String, required: true },
    // Optional contact details, edited on the Profile page. The sign-in email above never changes from there.
    phone: { type: String, trim: true, maxlength: 25 },
    officialEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    personalEmail: { type: String, trim: true, lowercase: true, maxlength: 254 }
  },
  {
    timestamps: true,
    toJSON: {
      // Only these fields ever leave the server.
      transform: (doc, ret) => ({
        id: String(ret._id), name: ret.name, email: ret.email,
        phone: ret.phone ?? '', officialEmail: ret.officialEmail ?? '', personalEmail: ret.personalEmail ?? ''
      })
    }
  }
);

module.exports = model('User', userSchema);
