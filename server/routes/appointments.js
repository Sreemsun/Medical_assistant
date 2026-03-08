const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Appointment = require('../models/Appointment');
const Doctor      = require('../models/Doctor');
const User        = require('../models/User');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(protect);

// ── GET /api/appointments/doctors ─────────────────────────────────────────────
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await Doctor.find({ active: true }).sort({ name: 1 });
    res.json({ success: true, doctors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/appointments/available-slots ─────────────────────────────────────
// Query params: doctorId, date (YYYY-MM-DD)
router.get('/available-slots', [
  query('doctorId').notEmpty().withMessage('doctorId is required'),
  query('date').notEmpty().isDate().withMessage('date must be a valid date (YYYY-MM-DD)'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  const { doctorId, date } = req.query;

  let doctor;
  try {
    doctor = await Doctor.findOne({ _id: doctorId, active: true });
  } catch (_) {
    return res.status(404).json({ success: false, message: 'Doctor not found' });
  }
  if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

  // Check if selected date falls on a day the doctor is available
  const dayName = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  if (!doctor.availability.includes(dayName)) {
    return res.json({
      success: true,
      slots: [],
      message: `Dr. ${doctor.name.split(' ').pop()} is not available on ${dayName}s`,
    });
  }

  // Find already-booked slots for this doctor on this date
  const startOfDay = new Date(date + 'T00:00:00');
  const endOfDay   = new Date(date + 'T23:59:59');
  const booked = await Appointment.find({
    doctorId: doctorId.toString(),
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $ne: 'cancelled' },
  }).select('timeSlot');

  const bookedSlots = new Set(booked.map(a => a.timeSlot));
  const available   = doctor.slots.filter(s => !bookedSlots.has(s));

  res.json({ success: true, slots: available, doctorName: doctor.name });
});

// ── POST /api/appointments ─────────────────────────────────────────────────────
router.post('/', [
  body('doctorId').notEmpty().withMessage('Doctor is required'),
  body('date').isDate().withMessage('Valid date is required'),
  body('timeSlot').notEmpty().withMessage('Time slot is required'),
  body('reason').trim().notEmpty().withMessage('Reason for visit is required').isLength({ max: 500 }),
  body('notes').optional().isLength({ max: 1000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  const { doctorId, date, timeSlot, reason, notes } = req.body;

  let doctor;
  try {
    doctor = await Doctor.findOne({ _id: doctorId, active: true });
  } catch (_) {
    return res.status(404).json({ success: false, message: 'Doctor not found' });
  }
  if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

  // Validate the date is not in the past
  const apptDate = new Date(date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (apptDate < today) return res.status(400).json({ success: false, message: 'Cannot book an appointment in the past' });

  // Validate the slot belongs to this doctor
  if (!doctor.slots.includes(timeSlot))
    return res.status(400).json({ success: false, message: 'Invalid time slot for this doctor' });

  // Validate doctor is available on this day
  const dayName = apptDate.toLocaleDateString('en-US', { weekday: 'long' });
  if (!doctor.availability.includes(dayName))
    return res.status(400).json({ success: false, message: `Doctor is not available on ${dayName}s` });

  // Check slot isn't already taken
  const startOfDay = new Date(date + 'T00:00:00');
  const endOfDay   = new Date(date + 'T23:59:59');
  const conflict = await Appointment.findOne({
    doctorId: doctorId.toString(),
    date: { $gte: startOfDay, $lte: endOfDay },
    timeSlot,
    status: { $ne: 'cancelled' },
  });
  if (conflict) return res.status(409).json({ success: false, message: 'This slot has just been booked. Please choose another.' });

  // Prevent same user from double-booking the same date
  const userConflict = await Appointment.findOne({
    user: req.user._id,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $ne: 'cancelled' },
  });
  if (userConflict) return res.status(409).json({ success: false, message: 'You already have an appointment on this date.' });

  const appointment = await Appointment.create({
    user: req.user._id,
    doctorId: doctorId.toString(),
    doctorName: doctor.name,
    doctorSpecialty: doctor.specialty,
    date: apptDate,
    timeSlot,
    reason,
    notes: notes || '',
    status: 'pending',
  });

  logger.info(`Appointment booked: user=${req.user._id} doctor=${doctor.name} date=${date} slot=${timeSlot}`);
  res.status(201).json({ success: true, message: 'Appointment booked successfully', appointment });
});

// ── GET /api/appointments ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const appointments = await Appointment.find(filter).sort({ date: 1 });
  res.json({ success: true, appointments });
});

// ── GET /api/appointments/doctor-appointments ──────────────────────────────────
// Returns all appointments booked with the logged-in doctor
router.get('/doctor-appointments', async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ email: req.user.email, active: true });
    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor profile not found for this account.' });
    }

    const filter = { doctorId: doctor._id.toString() };
    if (req.query.status) filter.status = req.query.status;

    const appointments = await Appointment.find(filter)
      .populate('user', 'fullName email')
      .sort({ date: 1 });

    res.json({ success: true, appointments });
  } catch (err) {
    logger.error(`Doctor appointments fetch error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/appointments/:id/status ────────────────────────────────────────
// Allows a doctor to update the status of an appointment (confirm / complete / cancel)
router.patch('/:id/status', [
  param('id').isMongoId().withMessage('Invalid appointment id'),
  body('status').isIn(['confirmed', 'completed', 'cancelled']).withMessage('Invalid status value'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const doctor = await Doctor.findOne({ email: req.user.email, active: true });
    if (!doctor) return res.status(403).json({ success: false, message: 'Not authorised as a doctor.' });

    const appointment = await Appointment.findOne({ _id: req.params.id, doctorId: doctor._id.toString() });
    if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    if (appointment.status === 'cancelled') return res.status(400).json({ success: false, message: 'Cannot update a cancelled appointment.' });

    appointment.status = req.body.status;
    await appointment.save();

    logger.info(`Appointment ${appointment._id} status updated to ${req.body.status} by doctor ${doctor.name}`);
    res.json({ success: true, message: `Appointment ${req.body.status}.`, appointment });
  } catch (err) {
    logger.error(`Status update error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/appointments/:id ───────────────────────────────────────────────
router.delete('/:id', [
  param('id').isMongoId().withMessage('Invalid appointment id'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  const appointment = await Appointment.findOne({ _id: req.params.id, user: req.user._id });
  if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (appointment.status === 'completed') return res.status(400).json({ success: false, message: 'Cannot cancel a completed appointment' });

  appointment.status = 'cancelled';
  await appointment.save();

  res.json({ success: true, message: 'Appointment cancelled successfully' });
});

module.exports = router;
