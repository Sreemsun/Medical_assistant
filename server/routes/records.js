const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const mongoose = require('mongoose');
const { body, param, validationResult } = require('express-validator');
const User     = require('../models/User');
const { protect } = require('../middleware/auth');
const logger   = require('../utils/logger');

const router = express.Router();
router.use(protect);

// ── Multer setup ────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'test-reports');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PNG, JPG files are allowed.'));
    }
  },
});

// ── GET /api/records — get user's medical records ──────────────
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('medicalRecords').lean();
    let records = (user?.medicalRecords || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (req.query.type) records = records.filter(r => r.type === req.query.type);
    res.json({ success: true, records });
  } catch (err) {
    logger.error(`Records fetch error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/records — add a new medical record ───────────────
router.post('/', upload.single('reportFile'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('type').isIn(['diagnosis', 'prescription', 'lab_result', 'vital_signs', 'vaccination', 'surgery', 'allergy', 'other'])
    .withMessage('Invalid record type'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Clean up uploaded file if validation fails
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { title, type, description, doctor, facility, date } = req.body;

    // Parse testValues from JSON string
    let testValues = [];
    if (req.body.testValues) {
      try {
        testValues = JSON.parse(req.body.testValues).filter(tv =>
          tv.name && tv.name.trim() && tv.value !== '' && tv.value !== undefined
        ).map(tv => ({
          name:   tv.name.trim(),
          value:  parseFloat(tv.value),
          unit:   (tv.unit || '').trim(),
          refMin: tv.refMin !== '' && tv.refMin !== undefined ? parseFloat(tv.refMin) : undefined,
          refMax: tv.refMax !== '' && tv.refMax !== undefined ? parseFloat(tv.refMax) : undefined,
        }));
      } catch (_) { testValues = []; }
    }

    const newRecord = {
      _id: new mongoose.Types.ObjectId(),
      date: date ? new Date(date) : new Date(),
      type,
      title: title.trim(),
      description: description?.trim() || '',
      doctor:   doctor?.trim()   || '',
      facility: facility?.trim() || '',
      testValues,
      attachments: req.file
        ? [{ filename: req.file.originalname, path: `/uploads/test-reports/${req.file.filename}`, uploadedAt: new Date() }]
        : [],
    };

    await User.findByIdAndUpdate(
      req.user._id,
      { $push: { medicalRecords: newRecord } }
    );

    logger.info(`Record added: user=${req.user._id} type=${type} title="${title}"`);
    res.status(201).json({ success: true, record: newRecord });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error(`Record add error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/records/:id — delete a record ──────────────────
router.delete('/:id', [
  param('id').isMongoId().withMessage('Invalid record id'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const user = await User.findById(req.user._id).select('medicalRecords');
    const record = user.medicalRecords.id(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });

    // Delete attached file from disk
    if (record.attachments?.length) {
      record.attachments.forEach(att => {
        const filePath = path.join(__dirname, '..', att.path);
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
      });
    }

    record.deleteOne();
    await user.save();

    res.json({ success: true, message: 'Record deleted.' });
  } catch (err) {
    logger.error(`Record delete error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Multer error handler ───────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message.includes('Only PDF')) {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(500).json({ success: false, message: err.message });
});

module.exports = router;
