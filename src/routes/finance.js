const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { authenticateToken } = require('../utils/auth');

// Get combined finance data (income and budget) for a specific month and year
router.get('/:month/:year', 
  authenticateToken,
  [
    param('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    param('year').isInt({ min: 2000, max: 2100 }).withMessage('Year must be valid')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { month, year } = req.params;
      const userId = req.user.id;
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // Step 1: Get month data (income)
      const { data: monthData, error: monthError } = await supabaseAdmin
        .from('months')
        .select('*')
        .eq('user_id', userId)
        .eq('month', month)
        .eq('year', year)
        .maybeSingle();
      
      if (monthError) {
        console.error('Error fetching month data:', monthError);
        throw monthError;
      }
      
      if (!monthData) {
        return res.status(404).json({ message: 'Month not found' });
      }
      
      // Step 2: Get budget categories for this month
      const { data: budgetCategories, error: budgetError } = await supabaseAdmin
        .from('budget_categories')
        .select('*')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .order('name');
      
      if (budgetError) {
        console.error('Error fetching budget categories:', budgetError);
        throw budgetError;
      }
      
      // Step 3: Calculate totals
      const spentCategories = budgetCategories
        .filter(cat => cat.type === 'Spent')
        .reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
      
      const savingsCategories = budgetCategories
        .filter(cat => cat.type === 'Savings')
        .reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
      
      // Calculate saving goal as 25% of income (same as in income route)
      const savingGoal = monthData.income * 0.25;
      
      // Step 4: Prepare and return the combined response
      const response = {
        month: {
          ...monthData,
          savingGoal
        },
        budgets: {
          categories: budgetCategories,
          totals: {
            spent: spentCategories,
            savings: savingsCategories,
            total: spentCategories + savingsCategories
          }
        }
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching finance data:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Combined endpoint to add/update income and budget categories in a single request
router.post('/', 
  authenticateToken,
  [
    // Income validation
    body('income.month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('income.year').isInt({ min: 2000, max: 2100 }).withMessage('Year must be valid'),
    body('income.amount').isFloat({ min: 0 }).withMessage('Income amount must be a positive number'),
    
    // Budget validation (optional array of budget categories)
    body('budgets').optional().isArray().withMessage('Budgets must be an array'),
    body('budgets.*.name').optional().notEmpty().withMessage('Category name is required'),
    body('budgets.*.amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('budgets.*.type').optional().isIn(['Spent', 'Savings']).withMessage('Type must be either Spent or Savings')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { income, budgets } = req.body;
      const userId = req.user.id;
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // Calculate days in month
      const daysInMonth = new Date(income.year, income.month, 0).getDate();
      
      // Check if month record already exists
      const { data: existingMonth, error: monthError } = await supabaseAdmin
        .from('months')
        .select('id')
        .eq('user_id', userId)
        .eq('month', income.month)
        .eq('year', income.year)
        .maybeSingle();
        
      if (monthError) {
        console.error('Error checking for existing month:', monthError);
        throw monthError;
      }
      
      let monthResult;
      let monthId;
      
      // Step 1: Create or update the month record with income
      if (existingMonth) {
        // Update existing month
        monthId = existingMonth.id;
        monthResult = await supabaseAdmin
          .from('months')
          .update({ 
            income: income.amount,
            updated_at: new Date()
          })
          .eq('id', existingMonth.id)
          .select();
          
        // Call the function to recalculate daily allocation
        await supabaseAdmin.rpc('calculate_daily_allocation', { month_id: existingMonth.id });
      } else {
        // Create new month - First, ensure the user exists in the users table
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
        monthResult = await supabaseAdmin
          .from('months')
          .insert([{
            user_id: userId,
            month: income.month,
            year: income.year,
            income: income.amount,
            days_in_month: daysInMonth,
            daily_allocation: 0, // Will be calculated by trigger
            total_budgeted: 0,   // Will be calculated as budget categories are added
            balance_amount: income.amount // Will be updated by trigger
          }])
          .select();
          
        if (monthResult.error) throw monthResult.error;
        monthId = monthResult.data[0].id;
      }
      
      // Step 2: Add budget categories if provided
      let budgetResults = [];
      if (budgets && budgets.length > 0) {
        // Prepare budget categories with user_id and month_id
        const budgetCategories = budgets.map(budget => ({
          user_id: userId,
          month_id: monthId,
          name: budget.name,
          amount: budget.amount,
          type: budget.type
        }));
        
        // Insert budget categories
        const { data: budgetData, error: budgetError } = await supabaseAdmin
          .from('budget_categories')
          .insert(budgetCategories)
          .select();
          
        if (budgetError) throw budgetError;
        budgetResults = budgetData;
      }
      
      // Return combined result
      res.status(201).json({
        month: monthResult.data[0],
        budgets: budgetResults
      });
    } catch (error) {
      console.error('Error in combined income and budget endpoint:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

module.exports = router;
