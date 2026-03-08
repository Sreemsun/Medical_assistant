const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  doctorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  senderRole: { type: String, enum: ['patient', 'doctor'], required: true },
  content:    { type: String, required: true, maxlength: 2000, trim: true },
  read:       { type: Boolean, default: false },
}, { timestamps: true });

messageSchema.index({ patientId: 1, doctorId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
