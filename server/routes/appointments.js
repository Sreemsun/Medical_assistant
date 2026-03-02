const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const Appointment = require('../models/Appointment');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// ── Static doctor list (seed data) ───────────────────────────────────────────
const DOCTORS = [
  {
    id: 'doc_001',
    name: 'Dr. Sarah Mitchell',
    specialty: 'General Practice',
    description: 'Experienced GP with 15 years in family medicine. Handles routine check-ups, chronic disease management, and preventive care.',
    availability: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    slots: ['09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','02:00 PM','02:30 PM','03:00 PM','03:30 PM','04:00 PM'],
  },
  {
    id: 'doc_002',
    name: 'Dr. James Rowe',
    specialty: 'Cardiologist',
    description: 'Board-certified cardiologist specialising in heart disease, hypertension, and preventive cardiology.',
    availability: ['Monday', 'Wednesday', 'Friday'],
    slots: ['10:00 AM','10:30 AM','11:00 AM','11:30 AM','02:00 PM','02:30 PM','03:00 PM'],
  },
  {
    id: 'doc_003',
    name: 'Dr. Priya Nair',
    specialty: 'Dermatologist',
    description: 'Specialist in skin conditions, cosmetic dermatology, and skin cancer screening.',
    availability: ['Tuesday', 'Thursday', 'Saturday'],
    slots: ['09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','03:00 PM','03:30 PM','04:00 PM'],
  },
  {
    id: 'doc_004',
    name: 'Dr. Alan Torres',
    specialty: 'Orthopaedic Surgeon',
    description: 'Specialist in bone, joint, and musculoskeletal disorders including sports injuries and joint replacement.',
    availability: ['Monday', 'Tuesday', 'Thursday'],
    slots: ['09:00 AM','09:30 AM','10:00 AM','11:00 AM','11:30 AM','02:00 PM','02:30 PM','03:30 PM'],
  },
  {
    id: 'doc_005',
    name: 'Dr. Emily Chen',
    specialty: 'Paediatrician',
    description: 'Dedicated to children\'s health from newborns through adolescence, including vaccinations and developmental assessments.',
    availability: ['Monday', 'Wednesday', 'Thursday', 'Friday'],
    slots: ['09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','02:00 PM','02:30 PM','03:00 PM','03:30 PM'],
  },
  {
    id: 'doc_006',
    name: 'Dr. Omar Hassan',
    specialty: 'Neurologist',
    description: 'Specialist in disorders of the brain and nervous system including migraines, epilepsy, and stroke.',
    availability: ['Tuesday', 'Wednesday', 'Friday'],
    slots: ['10:00 AM','10:30 AM','11:00 AM','02:00 PM','02:30 PM','03:00 PM','04:00 PM'],
  },
  {
    id: 'doc_007',
    name: 'Dr. Linda Park',
    specialty: 'Gynaecologist',
    description: 'Specialises in women\'s reproductive health, obstetrics, and preventive screenings.',
    availability: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
    slots: ['09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','03:00 PM','03:30 PM','04:00 PM'],
  },
  {
    id: 'doc_008',
    name: 'Dr. Raj Kapoor',
    specialty: 'Endocrinologist',
    description: 'Specialist in hormone-related disorders including diabetes, thyroid disease, and metabolic conditions.',
    availability: ['Wednesday', 'Thursday', 'Friday'],
    slots: ['10:00 AM','10:30 AM','11:00 AM','11:30 AM','02:00 PM','02:30 PM','03:00 PM'],
  },
];

// All routes require authentication
router.use(protect);

// ── GET /api/appointments/doctors ─────────────────────────────────────────────
router.get('/doctors', (req, res) => {
  res.json({ success: true, doctors: DOCTORS });
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
  const doctor = DOCTORS.find(d => d.id === doctorId);
  if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });

  // Check if selected date falls on a day doctor is available
  const dayName = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  if (!doctor.availability.includes(dayName)) {
    return res.json({ success: true, slots: [], message: `Dr. ${doctor.name.split(' ').pop()} is not available on ${dayName}s` });
  }

  // Find already-booked slots for this doctor on this date
  const startOfDay = new Date(date + 'T00:00:00');
  const endOfDay   = new Date(date + 'T23:59:59');
  const booked = await Appointment.find({
    doctorId,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $ne: 'cancelled' },
  }).select('timeSlot');

  const bookedSlots = new Set(booked.map(a => a.timeSlot));
  const available = doctor.slots.filter(s => !bookedSlots.has(s));

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

  const doctor = DOCTORS.find(d => d.id === doctorId);
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
    doctorId,
    date: { $gte: startOfDay, $lte: endOfDay },
    timeSlot,
    status: { $ne: 'cancelled' },
  });
  if (conflict) return res.status(409).json({ success: false, message: 'This slot has just been booked. Please choose another.' });

  // Prevent same user from double-booking the same slot
  const userConflict = await Appointment.findOne({
    user: req.user._id,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $ne: 'cancelled' },
  });
  if (userConflict) return res.status(409).json({ success: false, message: 'You already have an appointment on this date.' });

  const appointment = await Appointment.create({
    user: req.user._id,
    doctorId,
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
