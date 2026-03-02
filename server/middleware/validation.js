const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const validateRegister = [
  body('fullName')
    .trim().notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Full name can only contain letters, spaces, hyphens, and apostrophes'),
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('age')
    .optional({ checkFalsy: true })
    .isInt({ min: 0, max: 150 }).withMessage('Age must be between 0 and 150'),
  body('gender')
    .optional({ checkFalsy: true })
    .isIn(['male', 'female', 'other', 'prefer_not_to_say']).withMessage('Invalid gender value'),
  handleValidationErrors,
];

const validateLogin = [
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

const validateSymptoms = [
  body('symptoms').trim().notEmpty().withMessage('Please describe your symptoms')
    .isLength({ min: 10, max: 2000 }).withMessage('Symptom description must be between 10 and 2000 characters'),
  body('duration').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('severity').optional({ checkFalsy: true }).isIn(['mild', 'moderate', 'severe']).withMessage('Invalid severity value'),
  body('additionalInfo').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }),
  handleValidationErrors,
];

const validateProfileUpdate = [
  body('fullName').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }),
  body('age').optional({ checkFalsy: true }).isInt({ min: 0, max: 150 }),
  body('gender').optional({ checkFalsy: true }).isIn(['male', 'female', 'other', 'prefer_not_to_say']),
  body('bloodType').optional({ checkFalsy: true }).isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']),
  handleValidationErrors,
];

module.exports = { validateRegister, validateLogin, validateSymptoms, validateProfileUpdate };
