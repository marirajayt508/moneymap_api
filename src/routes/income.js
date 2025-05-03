const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../utils/auth');

// Get income for a specific month and year
router.get('/:month/:year', authenticateToken, async (req, res) => {
  try {
    const { month, year } = req.params;
    const userId = req.user.id;
    const supabase = req.app.locals.supabase;
    
    const { data, error } = await supabase
      .from('months')
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ message: 'Month not found' });
    }
    
    res.json(data);
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
      const supabase = req.app.locals.supabase;
      
      // Calculate days in month
      const daysInMonth = new Date(year, month, 0).getDate();
      
      // Check if month record already exists
      const { data: existingMonth } = await supabase
        .from('months')
        .select('id')
        .eq('user_id', userId)
        .eq('month', month)
        .eq('year', year)
        .single();
      
      let result;
      
      if (existingMonth) {
        // Update existing month
        result = await supabase
          .from('months')
          .update({ 
            income,
            updated_at: new Date()
          })
          .eq('id', existingMonth.id)
          .select();
          
        // Call the function to recalculate daily allocation
        await supabase.rpc('calculate_daily_allocation', { month_id: existingMonth.id });
      } else {
        // Create new month
        result = await supabase
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
    const supabase = req.app.locals.supabase;
    
    const { data, error } = await supabase
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
