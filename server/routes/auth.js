const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const { generateToken } = require('../middleware/auth');
const { protect } = require('../middleware/auth');
const { authLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { validateRegister, validateLogin } = require('../middleware/validation');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const logger = require('../utils/logger');

const router = express.Router();

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', registerLimiter, validateRegister, async (req, res) => {
  try {
    const {
      fullName, email, password, age, gender,
      role,
      // Doctor-specific fields
      specialty, experience, bio, availability, slots,
    } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    const isDoctor = role === 'doctor';

    if (isDoctor && !specialty) {
      return res.status(400).json({ success: false, message: 'Specialty is required for doctor registration.' });
    }

    const user = await User.create({
      fullName, email, password, age, gender,
      role: isDoctor ? 'doctor' : 'user',
    });

    // If doctor, also create a Doctor profile
    if (isDoctor) {
      try {
        await Doctor.create({
          name:         fullName,
          specialty:    specialty,
          email:        email,
          phone:        req.body.phoneNumber || '',
          experience:   Number(experience) || 0,
          bio:          bio || '',
          availability: Array.isArray(availability) ? availability : [],
          slots:        Array.isArray(slots)        ? slots        : [],
          active:       true,
        });
      } catch (docErr) {
        // Doctor profile creation failed — still continue, user account was created
        logger.warn(`Doctor profile creation failed for ${email}: ${docErr.message}`);
      }
    }

    // Send verification email (non-blocking)
    try {
      const verificationToken = user.getEmailVerificationToken();
      await user.save({ validateBeforeSave: false });
      await sendVerificationEmail(user, verificationToken);
    } catch (emailErr) {
      logger.warn(`Could not send verification email: ${emailErr.message}`);
    }

    const token = generateToken(user._id);
    res.status(201).json({
      success: true,
      message: isDoctor
        ? 'Doctor account created successfully. Your profile is now available for patient bookings.'
        : 'Account created successfully. Please check your email to verify your account.',
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    logger.error(`Register error: ${err.message}`);
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already in use.' });
    }
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (user.isLocked()) {
      return res.status(423).json({ success: false, message: 'Account temporarily locked due to multiple failed login attempts. Try again in 2 hours.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Successful login — reset attempts
    await user.updateOne({
      $set: { loginAttempts: 0, lastLogin: new Date(), rememberMe: !!rememberMe },
      $unset: { lockUntil: 1 },
    });

    const token = generateToken(user._id, !!rememberMe);
    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/verify-email/:token ─────────────────────────────────────
router.get('/verify-email/:token', async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token.' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Email verification failed.' });
  }
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Always return success to prevent email enumeration
    if (!user) return res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });

    const resetToken = user.getPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user, resetToken);
    } catch (emailErr) {
      user.passwordResetToken = undefined;
      user.passwordResetExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ success: false, message: 'Could not send reset email. Please try again.' });
    }

    res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Request failed. Please try again.' });
  }
});

// ── POST /api/auth/reset-password/:token ──────────────────────────────────
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpire: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Password reset failed.' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, user: user.toSafeObject() });
});

module.exports = router;
