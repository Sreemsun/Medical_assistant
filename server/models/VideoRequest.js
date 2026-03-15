const mongoose = require('mongoose');

const videoRequestSchema = new mongoose.Schema({
  patientId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patientName: { type: String, required: true },
  doctorId:    { type: String, required: true }, // Doctor document _id
  doctorName:  { type: String, required: true },
  roomName:    { type: String, required: true },
  status:      { type: String, enum: ['pending', 'active', 'ended'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('VideoRequest', videoRequestSchema);
