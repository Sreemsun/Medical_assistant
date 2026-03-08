const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { validateProfileUpdate } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// ── Multer config for file uploads ─────────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
  if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed. Supported: PDF, DOC, DOCX, JPG, PNG'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// All routes require authentication
router.use(protect);

// ── GET /api/user/profile ──────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
});

// ── PUT /api/user/profile ──────────────────────────────────────────────────
router.put('/profile', validateProfileUpdate, async (req, res) => {
  try {
    const allowedFields = ['fullName', 'age', 'gender', 'dateOfBirth', 'phoneNumber', 'address',
      'bloodType', 'emergencyContact'];
    const updates = {};
    allowedFields.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, message: 'Profile updated successfully.', user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

// ── POST /api/user/allergies ───────────────────────────────────────────────
router.post('/allergies', async (req, res) => {
  try {
    const { allergen, reaction, severity } = req.body;
    if (!allergen) return res.status(400).json({ success: false, message: 'Allergen is required.' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { allergies: { allergen, reaction, severity } } },
      { new: true }
    );
    res.json({ success: true, message: 'Allergy added.', allergies: user.allergies });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add allergy.' });
  }
});

router.delete('/allergies/:index', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const idx = parseInt(req.params.index);
    if (idx < 0 || idx >= user.allergies.length) return res.status(404).json({ success: false, message: 'Allergy not found.' });
    user.allergies.splice(idx, 1);
    await user.save();
    res.json({ success: true, message: 'Allergy removed.', allergies: user.allergies });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to remove allergy.' });
  }
});

// ── POST /api/user/medications ─────────────────────────────────────────────
router.post('/medications', async (req, res) => {
  try {
    const { name, dosage, frequency, prescribedBy, startDate } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Medication name is required.' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { currentMedications: { name, dosage, frequency, prescribedBy, startDate } } },
      { new: true }
    );
    res.json({ success: true, message: 'Medication added.', medications: user.currentMedications });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add medication.' });
  }
});

router.delete('/medications/:index', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const idx = parseInt(req.params.index);
    if (idx < 0 || idx >= user.currentMedications.length) return res.status(404).json({ success: false, message: 'Medication not found.' });
    user.currentMedications.splice(idx, 1);
    await user.save();
    res.json({ success: true, message: 'Medication removed.', medications: user.currentMedications });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to remove medication.' });
  }
});

// ── POST /api/user/vital-signs ─────────────────────────────────────────────
router.post('/vital-signs', async (req, res) => {
  try {
    const { bloodPressureSystolic, bloodPressureDiastolic, heartRate, temperature,
      weight, height, bloodSugar, oxygenSaturation, cholesterol, creatinine, notes } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { vitalSigns: { bloodPressureSystolic, bloodPressureDiastolic, heartRate, temperature, weight, height, bloodSugar, oxygenSaturation, cholesterol, creatinine, notes } } },
      { new: true }
    );
    res.json({ success: true, message: 'Vital signs recorded.', vitalSigns: user.vitalSigns });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to record vital signs.' });
  }
});

// ── POST /api/user/seed-vitals ─────────────────────────────────────────────
// Generates 90 days of realistic sample vital sign data for the current user.
// Safe to call multiple times – clears existing and regenerates.
router.post('/seed-vitals', async (req, res) => {
  try {
    const DAYS = 90;
    const now  = Date.now();

    // Seeded pseudo-random (deterministic, reproducible)
    let seed = 42;
    function rand() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
    function rn(min, max, decimals = 0) {
      const v = min + rand() * (max - min);
      return parseFloat(v.toFixed(decimals));
    }

    // Baseline values with a slow drift to simulate health trend
    const vitals = Array.from({ length: DAYS }, (_, i) => {
      const dayOffset = (DAYS - 1 - i) * 24 * 60 * 60 * 1000; // oldest first
      const date = new Date(now - dayOffset);
      const drift = i / DAYS; // 0 → 1 over time

      return {
        date,
        bloodPressureSystolic:  rn(115 + drift * 8,  135 + drift * 8),
        bloodPressureDiastolic: rn(72  + drift * 4,   88 + drift * 4),
        heartRate:              rn(62, 88),
        temperature:            rn(97.8, 99.2, 1),
        weight:                 rn(163 - drift * 2, 168 - drift * 2, 1),
        bloodSugar:             rn(82 + drift * 15,  128 + drift * 15),
        oxygenSaturation:       rn(96, 99),
        cholesterol:            rn(170 + drift * 20, 215 + drift * 20),
        creatinine:             rn(0.72, 1.15, 2),
        notes: '',
      };
    });

    await User.findByIdAndUpdate(req.user._id, { $set: { vitalSigns: vitals } });
    const user = await User.findById(req.user._id);
    res.json({ success: true, message: `${DAYS} sample vital sign records generated.`, vitalSigns: user.vitalSigns });
  } catch (err) {
    logger.error('seed-vitals error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to generate sample data.' });
  }
});

// ── POST /api/user/medical-records ────────────────────────────────────────
router.post('/medical-records', upload.single('attachment'), async (req, res) => {
  try {
    const { type, title, description, doctor, facility, date } = req.body;
    if (!type || !title) return res.status(400).json({ success: false, message: 'Type and title are required.' });

    const record = { type, title, description, doctor, facility };
    if (date) record.date = new Date(date);
    if (req.file) record.attachments = [{ filename: req.file.originalname, path: `/uploads/${req.file.filename}` }];

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { medicalRecords: record } },
      { new: true }
    );
    res.json({ success: true, message: 'Medical record added.', records: user.medicalRecords });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add medical record.' });
  }
});

router.delete('/medical-records/:recordId', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { medicalRecords: { _id: req.params.recordId } } },
      { new: true }
    );
    res.json({ success: true, message: 'Medical record removed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to remove record.' });
  }
});

// ── PUT /api/user/change-password ─────────────────────────────────────────
router.put('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both current and new passwords are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
});

// ── PUT /api/user/upgrade-to-patient ──────────────────────────────────────
router.put('/upgrade-to-patient', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role !== 'user') {
      return res.status(400).json({ success: false, message: `Account is already a ${user.role} account.` });
    }
    user.role = 'patient';
    await user.save();
    res.json({ success: true, message: 'Account upgraded to patient.', role: user.role });
  } catch (err) {
    logger.error('upgrade-to-patient error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to upgrade account.' });
  }
});

// ── DELETE /api/user/account ───────────────────────────────────────────────
router.delete('/account', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ success: true, message: 'Account deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete account.' });
  }
});

module.exports = router;
