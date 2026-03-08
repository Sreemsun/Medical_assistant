/* ═══════════════════════════════════════════════════════════════
   MedAssist — Messaging Routes
   Supports patient → doctor messages and doctor replies
   ═══════════════════════════════════════════════════════════════ */

const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const Message    = require('../models/Message');
const Doctor     = require('../models/Doctor');
const User       = require('../models/User');
const { protect } = require('../middleware/auth');

router.use(protect);

// ── POST /api/messages/send ─────────────────────────────────────
// Patient sends a message to a doctor
router.post('/send', async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ success: false, message: 'Only patients can send messages via this endpoint.' });
    }
    const { doctorId, content } = req.body;
    if (!doctorId || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'doctorId and content are required.' });
    }
    if (!mongoose.isValidObjectId(doctorId)) {
      return res.status(400).json({ success: false, message: 'Invalid doctorId.' });
    }
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor not found.' });

    const msg = await Message.create({
      patientId:  req.user._id,
      doctorId,
      senderRole: 'patient',
      content:    content.trim(),
    });
    res.status(201).json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/messages/reply ────────────────────────────────────
// Doctor replies to a patient
router.post('/reply', async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Only doctors can reply via this endpoint.' });
    }
    const { patientId, content } = req.body;
    if (!patientId || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'patientId and content are required.' });
    }
    if (!mongoose.isValidObjectId(patientId)) {
      return res.status(400).json({ success: false, message: 'Invalid patientId.' });
    }
    const doctor = await Doctor.findOne({ email: req.user.email, active: true });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor profile not found for your account.' });

    const patient = await User.findById(patientId);
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found.' });

    const msg = await Message.create({
      patientId,
      doctorId:   doctor._id,
      senderRole: 'doctor',
      content:    content.trim(),
    });
    res.status(201).json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/messages/patient-conversations ─────────────────────
// Patient gets a list of all their doctor conversations
router.get('/patient-conversations', async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ success: false, message: 'Patients only.' });
    }
    const doctorIds = await Message.distinct('doctorId', { patientId: req.user._id });

    const conversations = await Promise.all(doctorIds.map(async (doctorId) => {
      const lastMsg    = await Message.findOne({ patientId: req.user._id, doctorId }).sort({ createdAt: -1 });
      const unreadCount = await Message.countDocuments({
        patientId: req.user._id, doctorId, senderRole: 'doctor', read: false,
      });
      const doctor = await Doctor.findById(doctorId).select('name specialty');
      return { doctor, lastMessage: lastMsg, unreadCount };
    }));

    conversations.sort((a, b) =>
      new Date(b.lastMessage?.createdAt) - new Date(a.lastMessage?.createdAt)
    );
    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/messages/conversation/:doctorId ────────────────────
// Patient gets full conversation with a specific doctor
router.get('/conversation/:doctorId', async (req, res) => {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ success: false, message: 'Patients only. Doctors use /doctor-conversation/:patientId.' });
    }
    const { doctorId } = req.params;
    if (!mongoose.isValidObjectId(doctorId)) {
      return res.status(400).json({ success: false, message: 'Invalid doctorId.' });
    }
    await Message.updateMany(
      { patientId: req.user._id, doctorId, senderRole: 'doctor', read: false },
      { read: true }
    );
    const messages = await Message.find({ patientId: req.user._id, doctorId }).sort({ createdAt: 1 });
    const doctor   = await Doctor.findById(doctorId).select('name specialty');
    res.json({ success: true, messages, doctor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/messages/doctor-conversations ──────────────────────
// Doctor gets all their patient conversations
router.get('/doctor-conversations', async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Doctors only.' });
    }
    const doctor = await Doctor.findOne({ email: req.user.email, active: true });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });

    const patientIds = await Message.distinct('patientId', { doctorId: doctor._id });

    const conversations = await Promise.all(patientIds.map(async (patientId) => {
      const lastMsg     = await Message.findOne({ patientId, doctorId: doctor._id }).sort({ createdAt: -1 });
      const unreadCount = await Message.countDocuments({
        patientId, doctorId: doctor._id, senderRole: 'patient', read: false,
      });
      const patient = await User.findById(patientId).select('fullName email');
      return { patient, lastMessage: lastMsg, unreadCount };
    }));

    conversations.sort((a, b) =>
      new Date(b.lastMessage?.createdAt) - new Date(a.lastMessage?.createdAt)
    );
    res.json({ success: true, conversations, doctorId: doctor._id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/messages/doctor-conversation/:patientId ────────────
// Doctor gets full conversation with a specific patient
router.get('/doctor-conversation/:patientId', async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Doctors only.' });
    }
    const { patientId } = req.params;
    if (!mongoose.isValidObjectId(patientId)) {
      return res.status(400).json({ success: false, message: 'Invalid patientId.' });
    }
    const doctor = await Doctor.findOne({ email: req.user.email, active: true });
    if (!doctor) return res.status(404).json({ success: false, message: 'Doctor profile not found.' });

    await Message.updateMany(
      { patientId, doctorId: doctor._id, senderRole: 'patient', read: false },
      { read: true }
    );
    const messages = await Message.find({ patientId, doctorId: doctor._id }).sort({ createdAt: 1 });
    const patient  = await User.findById(patientId).select('fullName email');
    res.json({ success: true, messages, patient });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
