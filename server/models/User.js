const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const medicalRecordSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  type: {
    type: String,
    enum: ['diagnosis', 'prescription', 'lab_result', 'vital_signs', 'vaccination', 'surgery', 'allergy', 'other'],
    required: true,
  },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  doctor: { type: String, trim: true },
  facility: { type: String, trim: true },
  attachments: [{ filename: String, path: String, uploadedAt: { type: Date, default: Date.now } }],
  // Structured test parameter values (e.g. Glucose 120 mg/dL)
  testValues: [{
    name:   { type: String, trim: true },   // e.g. "Glucose"
    value:  { type: Number },               // e.g. 120
    unit:   { type: String, trim: true },   // e.g. "mg/dL"
    refMin: { type: Number },               // normal range min (optional)
    refMax: { type: Number },               // normal range max (optional)
  }],
}, { _id: true });

const vitalSignSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  bloodPressureSystolic: Number,
  bloodPressureDiastolic: Number,
  heartRate: Number,
  temperature: Number,
  weight: Number,
  height: Number,
  bloodSugar: Number,
  oxygenSaturation: Number,
  cholesterol: Number,
  creatinine: Number,
  notes: String,
}, { _id: true });

const userSchema = new mongoose.Schema({
  // ── Basic Info ──────────────────────────────
  fullName: { type: String, required: [true, 'Full name is required'], trim: true, maxlength: 100 },
  email: {
    type: String, required: [true, 'Email is required'],
    unique: true, lowercase: true, trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
  },
  password: {
    type: String, required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'], select: false,
  },
  age: { type: Number, min: 0, max: 150 },
  gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
  dateOfBirth: Date,
  phoneNumber: { type: String, trim: true },
  address: {
    street: String, city: String, state: String, zipCode: String, country: String,
  },

  // ── Medical Profile ─────────────────────────
  bloodType: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] },
  allergies: [{ allergen: String, reaction: String, severity: { type: String, enum: ['mild', 'moderate', 'severe'] } }],
  currentMedications: [{ name: String, dosage: String, frequency: String, prescribedBy: String, startDate: Date }],
  chronicConditions: [String],
  familyHistory: [{ condition: String, relation: String }],
  emergencyContact: { name: String, relationship: String, phone: String },

  // ── Medical History ─────────────────────────
  medicalRecords: [medicalRecordSchema],
  vitalSigns: [vitalSignSchema],

  // ── Auth & Security ─────────────────────────
  role: { type: String, enum: ['user', 'admin', 'doctor'], default: 'user' },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  passwordResetToken: String,
  passwordResetExpire: Date,
  rememberMe: { type: Boolean, default: false },
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });

// ── Pre-save: Hash Password ────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Methods ────────────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.incLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // lock 2 hours
  }
  return this.updateOne(updates);
};

userSchema.methods.getEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

userSchema.methods.getPasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpire = Date.now() + 30 * 60 * 1000; // 30 minutes
  return token;
};

// Strip sensitive fields from JSON responses
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerificationToken;
  delete obj.emailVerificationExpire;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpire;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
