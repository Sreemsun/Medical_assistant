const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized. Please log in.' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password').maxTimeMS(5000);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.warn(`Auth middleware error: ${err.message}`);
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to access this resource.' });
  }
  next();
};

const generateToken = (userId, rememberMe = false) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? '30d' : process.env.JWT_EXPIRE || '7d' }
  );
};

module.exports = { protect, authorize, generateToken };
