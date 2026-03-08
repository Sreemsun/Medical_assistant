const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Doctor      = require('../models/Doctor');
const User        = require('../models/User');
const Appointment = require('../models/Appointment');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// ── GET /api/doctors — list all active doctors ──────────────────────────────
router.get('/', async (req, res) => {
  try {
    const doctors = await Doctor.find({ active: true }).sort({ name: 1 });
    res.json({ success: true, doctors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/doctors — create a doctor ────────────────────────────────────
router.post('/', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('specialty').trim().notEmpty().withMessage('Specialty is required'),
  body('experience').optional().isNumeric().withMessage('Experience must be a number'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio max 500 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { name, specialty, email, phone, experience, bio, availability, slots } = req.body;
    const doctor = await Doctor.create({
      name, specialty,
      email:        email        || '',
      phone:        phone        || '',
      experience:   experience   || 0,
      bio:          bio          || '',
      availability: Array.isArray(availability) ? availability : [],
      slots:        Array.isArray(slots)        ? slots        : [],
    });
    res.status(201).json({ success: true, doctor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/doctors/:id — update a doctor ─────────────────────────────────
router.put('/:id', [
  param('id').isMongoId().withMessage('Invalid doctor id'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('specialty').trim().notEmpty().withMessage('Specialty is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { name, specialty, email, phone, experience, bio, availability, slots } = req.body;
    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { name, specialty, email, phone, experience, bio,
        availability: Array.isArray(availability) ? availability : [],
        slots:        Array.isArray(slots)        ? slots        : [],
      },
      { new: true, runValidators: true }
    );
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    res.json({ success: true, doctor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/doctors/:id — soft-delete ──────────────────────────────────
router.delete('/:id', [
  param('id').isMongoId().withMessage('Invalid doctor id'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id, { active: false }, { new: true }
    );
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found' });
    res.json({ success: true, message: 'Doctor removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/doctors/my-patients — patients who booked with this doctor ────────
router.get('/my-patients', async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ email: req.user.email, active: true });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor profile not found for this account.' });

    // Find all appointments for this doctor, get unique patient IDs
    const appointments = await Appointment.find({ doctorId: doctor._id.toString() })
      .select('user status date timeSlot')
      .sort({ date: -1 });

    const patientIdSet = new Set(appointments.map(a => a.user.toString()));
    const patientIds   = [...patientIdSet];

    // Fetch patient profiles (exclude sensitive auth fields and heavy arrays)
    const patients = await User.find({ _id: { $in: patientIds } })
      .select('fullName email age gender dateOfBirth phoneNumber bloodType allergies chronicConditions emergencyContact createdAt')
      .lean();

    // Attach appointment summary per patient
    const patientsWithSummary = patients.map(p => {
      const appts = appointments.filter(a => a.user.toString() === p._id.toString());
      return {
        ...p,
        appointmentCount: appts.length,
        lastAppointment:  appts[0]?.date || null,
        lastStatus:       appts[0]?.status || null,
      };
    });

    res.json({ success: true, patients: patientsWithSummary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/doctors/my-patients/:patientId — full patient profile ─────────────
router.get('/my-patients/:patientId', [
  param('patientId').isMongoId().withMessage('Invalid patient id'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const doctor = await Doctor.findOne({ email: req.user.email, active: true });
    if (!doctor) return res.status(403).json({ success: false, message: 'Not authorised as a doctor.' });

    // Verify this patient actually has an appointment with this doctor
    const hasAppt = await Appointment.findOne({
      doctorId: doctor._id.toString(),
      user: req.params.patientId,
    });
    if (!hasAppt) return res.status(403).json({ success: false, message: 'This patient has no appointments with you.' });

    const patient = await User.findById(req.params.patientId)
      .select('fullName email age gender dateOfBirth phoneNumber bloodType allergies chronicConditions emergencyContact vitalSigns medicalRecords createdAt')
      .lean();

    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found.' });

    // Appointments this patient has had with this doctor
    const appointments = await Appointment.find({
      doctorId: doctor._id.toString(),
      user: req.params.patientId,
    }).sort({ date: -1 });

    res.json({ success: true, patient, appointments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
