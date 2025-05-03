const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { authenticateToken } = require('../utils/auth');

// Get all expenses for a month
router.get('/month/:monthId', authenticateToken, async (req, res) => {
  try {
    const { monthId } = req.params;
    const userId = req.user.id;
    const supabase = req.app.locals.supabase;
    
    // First verify the month belongs to the user
    const { data: month, error: monthError } = await supabase
      .from('months')
      .select('id')
      .eq('id', monthId)
      .eq('user_id', userId)
      .single();
    
    if (monthError || !month) {
      return res.status(404).json({ message: 'Month not found or access denied' });
    }
    
    // Get expenses
    const { data, error } = await supabase
      .from('daily_expenses')
      .select('*')
      .eq('month_id', monthId)
      .eq('user_id', userId)
      .order('date');
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get expense for a specific date
router.get('/date/:date', authenticateToken, async (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user.id;
    const supabase = req.app.locals.supabase;
    
    // Get expense for the date
    const { data, error } = await supabase
      .from('daily_expenses')
      .select('*')
      .eq('date', date)
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows returned" error
      throw error;
    }
    
    if (!data) {
      return res.status(404).json({ message: 'No expense record found for this date' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Record a daily expense
router.post('/', 
  authenticateToken,
  [
    body('monthId').isUUID().withMessage('Valid month ID is required'),
    body('date').isDate().withMessage('Valid date is required'),
    body('amountSpent').isFloat({ min: 0 }).withMessage('Amount spent must be a positive number')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { monthId, date, amountSpent } = req.body;
      const userId = req.user.id;
      const supabase = req.app.locals.supabase;
      
      // First verify the month belongs to the user and get daily allocation
      const { data: month, error: monthError } = await supabase
        .from('months')
        .select('daily_allocation')
        .eq('id', monthId)
        .eq('user_id', userId)
        .single();
      
      if (monthError || !month) {
        return res.status(404).json({ message: 'Month not found or access denied' });
      }
      
      // Check if an expense record already exists for this date
      const { data: existingExpense } = await supabase
        .from('daily_expenses')
        .select('id')
        .eq('user_id', userId)
        .eq('date', date)
        .single();
      
      let result;
      
      if (existingExpense) {
        // Update existing expense
        result = await supabase
          .from('daily_expenses')
          .update({ 
            amount_spent: amountSpent,
            updated_at: new Date()
          })
          .eq('id', existingExpense.id)
          .select();
      } else {
        // Calculate cumulative savings (previous day's remaining)
        const prevDate = new Date(date);
        prevDate.setDate(prevDate.getDate() - 1);
        const formattedPrevDate = prevDate.toISOString().split('T')[0];
        
        const { data: prevDayExpense } = await supabase
          .from('daily_expenses')
          .select('remaining')
          .eq('user_id', userId)
          .eq('date', formattedPrevDate)
          .single();
        
        const cumulativeSavings = prevDayExpense ? parseFloat(prevDayExpense.remaining) : 0;
        const cumulativeBudget = parseFloat(month.daily_allocation) + cumulativeSavings;
        const remaining = cumulativeBudget - parseFloat(amountSpent);
        
        // Create new expense record
        result = await supabase
          .from('daily_expenses')
          .insert([{
            user_id: userId,
            month_id: monthId,
            date,
            amount_spent: amountSpent,
            allocated_budget: month.daily_allocation,
            cumulative_savings: cumulativeSavings,
            cumulative_budget: cumulativeBudget,
            remaining
          }])
          .select();
      }
      
      if (result.error) throw result.error;
      
      res.status(201).json(result.data[0]);
    } catch (error) {
      console.error('Error recording expense:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Update a daily expense
router.put('/:id', 
  authenticateToken,
  [
    param('id').isUUID().withMessage('Valid expense ID is required'),
    body('amountSpent').isFloat({ min: 0 }).withMessage('Amount spent must be a positive number')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { id } = req.params;
      const { amountSpent } = req.body;
      const userId = req.user.id;
      const supabase = req.app.locals.supabase;
      
      // First verify the expense belongs to the user and get current values
      const { data: expense, error: expenseError } = await supabase
        .from('daily_expenses')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      
      if (expenseError || !expense) {
        return res.status(404).json({ message: 'Expense not found or access denied' });
      }
      
      // Calculate new remaining amount
      const remaining = parseFloat(expense.cumulative_budget) - parseFloat(amountSpent);
      
      // Update expense
      const { data, error } = await supabase
        .from('daily_expenses')
        .update({ 
          amount_spent: amountSpent,
          remaining,
          updated_at: new Date()
        })
        .eq('id', id)
        .select();
      
      if (error) throw error;
      
      // Update subsequent days' cumulative savings
      const nextDate = new Date(expense.date);
      nextDate.setDate(nextDate.getDate() + 1);
      const formattedNextDate = nextDate.toISOString().split('T')[0];
      
      // Get the next day's expense if it exists
      const { data: nextDayExpense } = await supabase
        .from('daily_expenses')
        .select('id')
        .eq('user_id', userId)
        .eq('date', formattedNextDate)
        .single();
      
      // If next day expense exists, we need to recalculate its values
      if (nextDayExpense) {
        // This will trigger a cascade of updates due to the trigger_calculate_expense_values
        await supabase
          .from('daily_expenses')
          .update({ updated_at: new Date() })
          .eq('id', nextDayExpense.id);
      }
      
      res.json(data[0]);
    } catch (error) {
      console.error('Error updating expense:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Delete a daily expense
router.delete('/:id', 
  authenticateToken,
  [
    param('id').isUUID().withMessage('Valid expense ID is required')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const supabase = req.app.locals.supabase;
      
      // First verify the expense belongs to the user
      const { data: expense, error: expenseError } = await supabase
        .from('daily_expenses')
        .select('date')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      
      if (expenseError || !expense) {
        return res.status(404).json({ message: 'Expense not found or access denied' });
      }
      
      // Delete expense
      const { error } = await supabase
        .from('daily_expenses')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Get the next day's expense if it exists
      const nextDate = new Date(expense.date);
      nextDate.setDate(nextDate.getDate() + 1);
      const formattedNextDate = nextDate.toISOString().split('T')[0];
      
      const { data: nextDayExpense } = await supabase
        .from('daily_expenses')
        .select('id')
        .eq('user_id', userId)
        .eq('date', formattedNextDate)
        .single();
      
      // If next day expense exists, we need to recalculate its values
      if (nextDayExpense) {
        // This will trigger a cascade of updates due to the trigger_calculate_expense_values
        await supabase
          .from('daily_expenses')
          .update({ updated_at: new Date() })
          .eq('id', nextDayExpense.id);
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting expense:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

module.exports = router;
