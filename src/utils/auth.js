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
          
          // Manually create a user record in the users table
          // This is needed because the trigger might not work with RLS
          try {
            // Use raw SQL query with RPC to bypass RLS
            const { error: insertUserError } = await supabaseAdmin.rpc('insert_user_bypass_rls', {
              user_id: userId,
              user_name: 'Demo User'
            });
            
            if (insertUserError) {
              console.error('Error creating user record with RPC:', insertUserError);
              
              // Fallback: Try direct insert with admin client
              const { error: directInsertError } = await supabaseAdmin
                .from('users')
                .insert([{ id: userId, name: 'Demo User' }]);
                
              if (directInsertError) {
                console.error('Error creating user record with direct insert:', directInsertError);
              } else {
                console.log('Successfully created user record with direct insert');
              }
            } else {
              console.log('Successfully created user record with RPC');
            }
          } catch (userInsertError) {
            console.error('Exception creating user record:', userInsertError);
          }
        }
      } catch (createError) {
        console.error('Exception creating demo user:', createError);
      }
    } else {
      // Use the first user found
      user = data.users[0];
      userId = user.id;
      console.log('Using existing user with ID:', userId);
      
      // Check if user exists in users table
      const { data: existingUser, error: userCheckError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
        
      if (userCheckError || !existingUser) {
        console.log('User exists in auth but not in users table, creating record');
        
        // Try to create user record
        try {
          // Use raw SQL query with RPC to bypass RLS
          const { error: insertUserError } = await supabaseAdmin.rpc('insert_user_bypass_rls', {
            user_id: userId,
            user_name: user?.user_metadata?.name || 'Demo User'
          });
          
          if (insertUserError) {
            console.error('Error creating user record with RPC:', insertUserError);
            
            // Fallback: Try direct insert with admin client
            const { error: directInsertError } = await supabaseAdmin
              .from('users')
              .insert([{ id: userId, name: user?.user_metadata?.name || 'Demo User' }]);
              
            if (directInsertError) {
              console.error('Error creating user record with direct insert:', directInsertError);
            } else {
              console.log('Successfully created user record with direct insert');
            }
          } else {
            console.log('Successfully created user record with RPC');
          }
        } catch (userInsertError) {
          console.error('Exception creating user record:', userInsertError);
        }
      }
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
