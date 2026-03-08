const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  specialty:    { type: String, required: true, trim: true },
  email:        { type: String, trim: true, default: '' },
  phone:        { type: String, trim: true, default: '' },
  experience:   { type: Number, default: 0 },        // years
  bio:          { type: String, maxlength: 500, default: '' },
  availability: [{ type: String }],                   // ['Monday', 'Tuesday', ...]
  slots:        [{ type: String }],                   // ['09:00 AM', '09:30 AM', ...]
  active:       { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON:    { virtuals: true },
  toObject:  { virtuals: true },
});

// Virtual 'id' already provided by Mongoose via toJSON: { virtuals: true }

module.exports = mongoose.model('Doctor', doctorSchema);
