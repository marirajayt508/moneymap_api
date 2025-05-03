const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { authenticateToken } = require('../utils/auth');

// Get all expenses for a month
router.get('/month/:monthId', authenticateToken, async (req, res) => {
  try {
    const { monthId } = req.params;
    const userId = req.user.id;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    
    // First verify the month belongs to the user
    const { data: month, error: monthError } = await supabaseAdmin
      .from('months')
      .select('id')
      .eq('id', monthId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (monthError || !month) {
      return res.status(404).json({ message: 'Month not found or access denied' });
    }
    
    // Get expenses
    const { data, error } = await supabaseAdmin
      .from('daily_expenses')
      .select('*')
      .eq('month_id', monthId)
      .eq('user_id', userId)
      .order('date');
    
    if (error) throw error;
    
    // Add indicator to each expense
    const expensesWithIndicator = data.map(expense => {
      const amountSpent = parseFloat(expense.amount_spent);
      const allocatedBudget = parseFloat(expense.allocated_budget);
      let indicator;
      
      if (amountSpent <= allocatedBudget * 0.7) {
        indicator = 'good'; // Spent less than 70% of allocated budget
      } else if (amountSpent <= allocatedBudget) {
        indicator = 'average'; // Spent between 70% and 100% of allocated budget
      } else {
        indicator = 'reached'; // Spent more than allocated budget
      }
      
      return {
        ...expense,
        indicator
      };
    });
    
    res.json(expensesWithIndicator);
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
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    
    // Get expense for the date
    const { data, error } = await supabaseAdmin
      .from('daily_expenses')
      .select('*')
      .eq('date', date)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows returned" error
      throw error;
    }
    
    if (!data) {
      return res.status(404).json({ message: 'No expense record found for this date' });
    }
    
    // Calculate spending indicator
    let indicator;
    const amountSpent = parseFloat(data.amount_spent);
    const allocatedBudget = parseFloat(data.allocated_budget);
    
    if (amountSpent <= allocatedBudget * 0.7) {
      indicator = 'good'; // Spent less than 70% of allocated budget
    } else if (amountSpent <= allocatedBudget) {
      indicator = 'average'; // Spent between 70% and 100% of allocated budget
    } else {
      indicator = 'reached'; // Spent more than allocated budget
    }
    
    // Add indicator to response
    const response = {
      ...data,
      indicator
    };
    
    res.json(response);
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
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // First verify the month belongs to the user and get daily allocation
      const { data: month, error: monthError } = await supabaseAdmin
        .from('months')
        .select('daily_allocation')
        .eq('id', monthId)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (monthError || !month) {
        return res.status(404).json({ message: 'Month not found or access denied' });
      }
      
      // Check if an expense record already exists for this date
      const { data: existingExpense } = await supabaseAdmin
        .from('daily_expenses')
        .select('id')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle();
      
      let result;
      
      if (existingExpense) {
        // Update existing expense
        result = await supabaseAdmin
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
        
        const { data: prevDayExpense } = await supabaseAdmin
          .from('daily_expenses')
          .select('remaining')
          .eq('user_id', userId)
          .eq('date', formattedPrevDate)
          .maybeSingle();
        
        const cumulativeSavings = prevDayExpense ? parseFloat(prevDayExpense.remaining) : 0;
        const cumulativeBudget = parseFloat(month.daily_allocation) + cumulativeSavings;
        const remaining = cumulativeBudget - parseFloat(amountSpent);
        
        // Create new expense record with calculated values
        result = await supabaseAdmin
          .from('daily_expenses')
          .insert([{
            user_id: userId,
            month_id: monthId,
            date,
            amount_spent: amountSpent,
            allocated_budget: month.daily_allocation,
            // Calculate and set these values directly instead of relying on the trigger
            cumulative_savings: cumulativeSavings,
            cumulative_budget: cumulativeBudget,
            remaining: remaining
          }])
          .select();
      }
      
      if (result.error) throw result.error;
      
      // Add indicator to response
      const expense = result.data[0];
      const expenseAmount = parseFloat(expense.amount_spent);
      const expenseBudget = parseFloat(expense.allocated_budget);
      let indicator;
      
      if (expenseAmount <= expenseBudget * 0.7) {
        indicator = 'good'; // Spent less than 70% of allocated budget
      } else if (expenseAmount <= expenseBudget) {
        indicator = 'average'; // Spent between 70% and 100% of allocated budget
      } else {
        indicator = 'reached'; // Spent more than allocated budget
      }
      
      const response = {
        ...expense,
        indicator
      };
      
      res.status(201).json(response);
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
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // First verify the expense belongs to the user and get current values
      const { data: expense, error: expenseError } = await supabaseAdmin
        .from('daily_expenses')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (expenseError || !expense) {
        return res.status(404).json({ message: 'Expense not found or access denied' });
      }
      
      // Calculate new remaining amount
      const remaining = parseFloat(expense.cumulative_budget) - parseFloat(amountSpent);
      
      // Update expense
      const { data, error } = await supabaseAdmin
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
      const { data: nextDayExpense } = await supabaseAdmin
        .from('daily_expenses')
        .select('id')
        .eq('user_id', userId)
        .eq('date', formattedNextDate)
        .maybeSingle();
      
      // If next day expense exists, we need to recalculate its values
      if (nextDayExpense) {
        // This will trigger a cascade of updates due to the trigger_calculate_expense_values
        await supabaseAdmin
          .from('daily_expenses')
          .update({ updated_at: new Date() })
          .eq('id', nextDayExpense.id);
      }
      
      // Add indicator to response
      const updatedExpense = data[0];
      const expenseAmount = parseFloat(updatedExpense.amount_spent);
      const expenseBudget = parseFloat(updatedExpense.allocated_budget);
      let indicator;
      
      if (expenseAmount <= expenseBudget * 0.7) {
        indicator = 'good'; // Spent less than 70% of allocated budget
      } else if (expenseAmount <= expenseBudget) {
        indicator = 'average'; // Spent between 70% and 100% of allocated budget
      } else {
        indicator = 'reached'; // Spent more than allocated budget
      }
      
      const response = {
        ...updatedExpense,
        indicator
      };
      
      res.json(response);
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
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // First verify the expense belongs to the user
      const { data: expense, error: expenseError } = await supabaseAdmin
        .from('daily_expenses')
        .select('date')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (expenseError || !expense) {
        return res.status(404).json({ message: 'Expense not found or access denied' });
      }
      
      // Delete expense
      const { error } = await supabaseAdmin
        .from('daily_expenses')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Get the next day's expense if it exists
      const nextDate = new Date(expense.date);
      nextDate.setDate(nextDate.getDate() + 1);
      const formattedNextDate = nextDate.toISOString().split('T')[0];
      
      const { data: nextDayExpense } = await supabaseAdmin
        .from('daily_expenses')
        .select('id')
        .eq('user_id', userId)
        .eq('date', formattedNextDate)
        .single();
      
      // If next day expense exists, we need to recalculate its values
      if (nextDayExpense) {
        // This will trigger a cascade of updates due to the trigger_calculate_expense_values
        await supabaseAdmin
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
