const express      = require('express');
const router       = express.Router();
const { protect }  = require('../middleware/auth');
const VideoRequest = require('../models/VideoRequest');
const Doctor       = require('../models/Doctor');

// ── POST /api/video/request ─────────────────────────────────────
// Patient requests a video consultation with a doctor
router.post('/request', protect, async (req, res) => {
  try {
    const { doctorId, doctorName } = req.body;
    if (!doctorId || !doctorName) {
      return res.status(400).json({ success: false, message: 'doctorId and doctorName are required.' });
    }

    const roomName = `consult-${req.user._id}-${doctorId}`.replace(/[^a-zA-Z0-9_-]/g, '-');

    // Cancel any existing pending request for same patient+doctor
    await VideoRequest.deleteMany({ patientId: req.user._id, doctorId, status: 'pending' });

    const request = await VideoRequest.create({
      patientId:   req.user._id,
      patientName: req.user.fullName,
      doctorId,
      doctorName,
      roomName,
      status: 'pending',
    });

    res.json({ success: true, roomName, requestId: request._id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/video/requests/pending ────────────────────────────
// Doctor polls — finds their Doctor doc by email, then gets pending requests
router.get('/requests/pending', protect, async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ email: req.user.email, active: true });
    if (!doctor) return res.json({ success: true, requests: [] });

    const requests = await VideoRequest.find({ doctorId: doctor._id.toString(), status: 'pending' })
      .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/video/request/:id/accept ──────────────────────────
// Doctor accepts — marks active and returns room name
router.put('/request/:id/accept', protect, async (req, res) => {
  try {
    const request = await VideoRequest.findByIdAndUpdate(
      req.params.id,
      { status: 'active' },
      { new: true }
    );
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    res.json({ success: true, roomName: request.roomName, patientName: request.patientName });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/video/request/:id/end ─────────────────────────────
router.put('/request/:id/end', protect, async (req, res) => {
  try {
    await VideoRequest.findByIdAndUpdate(req.params.id, { status: 'ended' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
