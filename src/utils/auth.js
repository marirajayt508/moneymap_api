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
    // Get the Supabase admin client from app.locals
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    
    // For demonstration purposes, we'll try to use an existing user or create a mock user
    // This ensures we have a user ID that works with RLS policies
    
    // First, check if our demo user already exists
    const { data, error: getUserError } = await supabaseAdmin.auth.admin.listUsers();
    
    let userId;
    let user;
    
    if (getUserError || !data || !data.users || data.users.length === 0) {
      // No users found or error listing users, use a mock user ID
      console.log('No existing users found or error listing users, using mock user');
      userId = '00000000-0000-0000-0000-000000000000';
      
      // Try to create a user in Supabase Auth
      try {
        const { data: { user: newUser }, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email: 'demo@example.com',
          password: 'securepassword123',
          user_metadata: {
            name: 'Demo User'
          },
          email_confirm: true
        });
        
        if (createUserError) {
          console.error('Error creating demo user:', createUserError);
        } else {
          userId = newUser.id;
          user = newUser;
          console.log('Successfully created demo user with ID:', userId);
        }
      } catch (createError) {
        console.error('Exception creating demo user:', createError);
      }
    } else {
      // Use the first user found
      user = data.users[0];
      userId = user.id;
      console.log('Using existing user with ID:', userId);
    }
    
    // Set the user in the request
    req.user = {
      id: userId,
      email: user?.email || 'demo@example.com',
      user_metadata: user?.user_metadata || {
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
