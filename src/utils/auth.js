const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate JWT token
 * This will verify the token from the Authorization header
 * and set req.user if the token is valid
 * 
 * For demonstration purposes, we're bypassing authentication
 */
const authenticateToken = async (req, res, next) => {
  try {
    // For demonstration purposes, we're setting a mock user
    req.user = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'demo@example.com',
      user_metadata: {
        name: 'Demo User'
      }
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  authenticateToken
};
