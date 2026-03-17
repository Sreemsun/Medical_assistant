require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const logger = require('./utils/logger');

// Route imports
const authRoutes        = require('./routes/auth');
const userRoutes        = require('./routes/user');
const symptomRoutes     = require('./routes/symptoms');
const appointmentRoutes = require('./routes/appointments');
const analyticsRoutes   = require('./routes/analytics');
const doctorRoutes      = require('./routes/doctors');
const recordRoutes      = require('./routes/records');
const messageRoutes     = require('./routes/messages');
const videoRoutes       = require('./routes/video');

const app = express();

// Render runs behind a reverse proxy; trust first proxy hop for accurate client IPs.
app.set('trust proxy', 1);

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com", "meet.jit.si", "*.jitsi.net", "sdk.twilio.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:", "*.jitsi.net", "meet.jit.si"],
      connectSrc: ["'self'", "http://localhost:3000", "http://localhost:5001", "wss://*.jitsi.net", "https://*.jitsi.net", "wss://meet.jit.si", "https://meet.jit.si", "wss://*.twilio.com", "https://*.twilio.com"],
      frameSrc: ["'self'", "meet.jit.si", "*.jitsi.net"],
      mediaSrc: ["'self'", "blob:", "mediastream:"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Global API rate limiting (do not count static assets/page loads)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// ─── General Middleware ─────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/symptoms', symptomRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/analytics',   analyticsRoutes);
app.use('/api/doctors',     doctorRoutes);
app.use('/api/records',     recordRoutes);
app.use('/api/messages',    messageRoutes);
app.use('/api/video',       videoRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'MedAssist API is running', timestamp: new Date().toISOString() });
});

// ─── Serve Frontend ──────────────────────────────────────────────────────────
const clientPath = path.join(__dirname, '..', 'client');
app.use(express.static(clientPath));

// Clean URLs — serve .html files without extension
app.get('/:page', (req, res, next) => {
  const file = path.join(clientPath, `${req.params.page}.html`);
  res.sendFile(file, err => { if (err) next(); });
});

// ─── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`${err.statusCode || 500} - ${err.message} - ${req.originalUrl} - ${req.method}`);

  const isDev = process.env.NODE_ENV === 'development';
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(isDev && { stack: err.stack }),
  });
});

// ─── Database & Server Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/medical_assistance')
  .then(() => {
    logger.info('MongoDB connected successfully');
    app.listen(PORT, () => {
      logger.info(`MedAssist server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
  })
  .catch(err => {
    logger.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

module.exports = app;
