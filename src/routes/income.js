const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../utils/auth');

// Get income for a specific month and year
router.get('/:month/:year', authenticateToken, async (req, res) => {
  try {
    const { month, year } = req.params;
    const userId = req.user.id;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    
    const { data, error } = await supabaseAdmin
      .from('months')
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching month data:', error);
      throw error;
    }
    
    if (!data) {
      return res.status(404).json({ message: 'Month not found' });
    }
    
    // Calculate saving goal as 25% of income
    const responseData = {
      ...data,
      savingGoal: data.income * 0.25
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching income:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create or update income for a month
router.post('/', 
  authenticateToken,
  [
    body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('year').isInt({ min: 2000, max: 2100 }).withMessage('Year must be valid'),
    body('income').isFloat({ min: 0 }).withMessage('Income must be a positive number')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { month, year, income } = req.body;
      const userId = req.user.id;
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // Calculate days in month
      const daysInMonth = new Date(year, month, 0).getDate();
      
    // Check if month record already exists
    const { data: existingMonth, error: monthError } = await supabaseAdmin
      .from('months')
      .select('id')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();
      
    if (monthError) {
      console.error('Error checking for existing month:', monthError);
      throw monthError;
    }
      
      let result;
      
      if (existingMonth) {
        // Update existing month
        result = await supabaseAdmin
          .from('months')
          .update({ 
            income,
            updated_at: new Date()
          })
          .eq('id', existingMonth.id)
          .select();
          
        // Call the function to recalculate daily allocation
        await supabaseAdmin.rpc('calculate_daily_allocation', { month_id: existingMonth.id });
      } else {
      // Create new month
      // First, ensure the user exists in the users table
      // Use the RPC function to check if user exists
      const { data: userExists, error: checkUserError } = await supabaseAdmin
        .rpc('check_user_exists', { user_id: userId });
        
      if (checkUserError) {
        console.error('Error checking if user exists:', checkUserError);
        
        // Fallback: Try direct check
        const { data: existingUser, error: userCheckError } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
          
        if (userCheckError || !existingUser) {
          // User doesn't exist in the users table or error occurred, create them
          console.log('Creating new user record for ID:', userId);
          
          // Try to use the RPC function to insert user
          const { error: insertUserError } = await supabaseAdmin
            .rpc('insert_user_bypass_rls', {
              user_id: userId,
              user_name: req.user.user_metadata?.name || 'Demo User'
            });
            
          if (insertUserError) {
            console.error('Error creating user with RPC:', insertUserError);
            
            // Fallback: Try direct insert
            const { error: userInsertError } = await supabaseAdmin
              .from('users')
              .insert([{ id: userId, name: req.user.user_metadata?.name || 'Demo User' }]);
              
            if (userInsertError) {
              console.error('Error creating user record:', userInsertError);
              throw userInsertError;
            }
          }
        }
      } else if (!userExists) {
        // User doesn't exist, create them
        console.log('User does not exist, creating new user record for ID:', userId);
        
        // Try to use the RPC function to insert user
        const { error: insertUserError } = await supabaseAdmin
          .rpc('insert_user_bypass_rls', {
            user_id: userId,
            user_name: req.user.user_metadata?.name || 'Demo User'
          });
          
        if (insertUserError) {
          console.error('Error creating user with RPC:', insertUserError);
          
          // Fallback: Try direct insert
          const { error: userInsertError } = await supabaseAdmin
            .from('users')
            .insert([{ id: userId, name: req.user.user_metadata?.name || 'Demo User' }]);
            
          if (userInsertError) {
            console.error('Error creating user record:', userInsertError);
            throw userInsertError;
          }
        }
      }
      
      // Now insert the month record
      result = await supabaseAdmin
        .from('months')
        .insert([{
          user_id: userId,
          month,
          year,
          income,
          days_in_month: daysInMonth,
          daily_allocation: 0, // Will be calculated by trigger
          total_budgeted: 0,   // Will be calculated as budget categories are added
          balance_amount: income // Will be updated by trigger
        }])
        .select();
      }
      
      if (result.error) throw result.error;
      
      res.status(201).json(result.data[0]);
    } catch (error) {
      console.error('Error saving income:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Get all months for a user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    
    const { data, error } = await supabaseAdmin
      .from('months')
      .select('*')
      .eq('user_id', userId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching months:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
