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
    
    // First verify the month belongs to the user and get month details
    const { data: month, error: monthError } = await supabaseAdmin
      .from('months')
      .select('id, month, year, daily_allocation')
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
    
    // Create a map of existing expenses by date
    const expensesByDate = {};
    data.forEach(expense => {
      expensesByDate[expense.date] = expense;
    });
    
    // Get current date
    const currentDate = new Date();
    
    // Calculate start date of the month
    const startDate = new Date(month.year, month.month - 1, 1);
    
    // Calculate end date (either current date or end of month, whichever is earlier)
    let endDate;
    if (currentDate.getFullYear() > month.year || 
        (currentDate.getFullYear() === month.year && currentDate.getMonth() + 1 > month.month)) {
      // If current date is in a future month, use end of the requested month
      endDate = new Date(month.year, month.month, 0);
    } else {
      // Otherwise use current date
      endDate = new Date(currentDate);
    }
    
    // Generate a complete list of dates for the current month only
    const allDates = [];
    
    // Get today's date
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    
    // Start from the 1st day of the requested month (not previous month)
    const tempDate = new Date(month.year, month.month - 1, 1);
    
    // If we're viewing the current month, make sure to include today
    if (month.year === today.getFullYear() && month.month === today.getMonth() + 1) {
      // If endDate is before today, update it to include today
      if (endDate < today) {
        endDate = new Date(today);
      }
    }
    
    // Generate dates only for the current month
    while (tempDate <= endDate) {
      allDates.push(new Date(tempDate));
      tempDate.setDate(tempDate.getDate() + 1);
    }
    
    // Always include today if we're viewing the current month
    if (month.year === today.getFullYear() && month.month === today.getMonth() + 1) {
      // Check if today is already in the list
      const todayInList = allDates.some(date => date.toISOString().split('T')[0] === todayString);
      
      if (!todayInList) {
        allDates.push(new Date(today));
      }
    }
    
    // Sort dates to ensure they're in chronological order
    allDates.sort((a, b) => a - b);
    
    // Create a complete list of expenses (actual + placeholder)
    // Filter out any dates from the previous month and ensure today is included
    const completeExpenses = allDates
      .filter(date => {
        // Only include dates from the current month (exclude previous month)
        return date.getMonth() === month.month - 1;
      })
      .map(date => {
      const dateString = date.toISOString().split('T')[0];
      
      if (expensesByDate[dateString]) {
        // Use existing expense
        const expense = expensesByDate[dateString];
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
      } else {
        // Create placeholder expense with all fields including a UUID
        const now = new Date();
        // Generate a UUID using the uuid_generate_v4() function via a query
        // This is a placeholder that can be updated later
        return {
          id: `placeholder-${dateString}`, // Unique ID for placeholder that can be used for updates
          user_id: userId,
          month_id: monthId,
          date: dateString,
          amount_spent: 0,
          allocated_budget: month.daily_allocation,
          cumulative_savings: 0, // Default values
          cumulative_budget: month.daily_allocation,
          remaining: month.daily_allocation, // No spending means full budget remains
          notes: null,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
          indicator: 'good' // Zero spending is always good
        };
      }
    });
    
    // Final filter to ensure we only include dates from the requested month
    const filteredExpenses = completeExpenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      const expenseMonth = expenseDate.getMonth() + 1; // JavaScript months are 0-indexed
      const expenseYear = expenseDate.getFullYear();
      
      // Only include expenses from the requested month and year
      return expenseMonth === month.month && expenseYear === month.year;
    });
    
    res.json(filteredExpenses);
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
    body('amountSpent').isFloat({ min: 0 }).withMessage('Amount spent must be a positive number'),
    body('notes').optional().isString().withMessage('Notes must be a string')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { monthId, date, amountSpent, notes } = req.body;
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
            notes: notes,
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
            notes: notes,
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
    // Allow both UUID and placeholder IDs (placeholder-YYYY-MM-DD)
    param('id').custom(value => {
      // Check if it's a UUID or a placeholder ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      const isPlaceholder = /^placeholder-\d{4}-\d{2}-\d{2}$/.test(value);
      if (!isUUID && !isPlaceholder) {
        throw new Error('Invalid ID format');
      }
      return true;
    }),
    body('amountSpent').isFloat({ min: 0 }).withMessage('Amount spent must be a positive number'),
    body('notes').optional().isString().withMessage('Notes must be a string')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { id } = req.params;
      const { amountSpent, notes } = req.body;
      const userId = req.user.id;
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // Check if this is a placeholder ID
      const isPlaceholder = /^placeholder-\d{4}-\d{2}-\d{2}$/.test(id);
      
      if (isPlaceholder) {
        // This is a placeholder expense, so we need to create a new record
        // Extract the date from the placeholder ID
        const dateString = id.replace('placeholder-', '');
        
        // Get the month_id for this date
        const date = new Date(dateString);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        
        // Get month details
        const { data: monthData, error: monthError } = await supabaseAdmin
          .from('months')
          .select('id, daily_allocation')
          .eq('user_id', userId)
          .eq('month', month)
          .eq('year', year)
          .maybeSingle();
        
        if (monthError || !monthData) {
          return res.status(404).json({ message: 'Month not found or access denied' });
        }
        
        // Calculate cumulative savings (previous day's remaining)
        const prevDate = new Date(dateString);
        prevDate.setDate(prevDate.getDate() - 1);
        const formattedPrevDate = prevDate.toISOString().split('T')[0];
        
        const { data: prevDayExpense } = await supabaseAdmin
          .from('daily_expenses')
          .select('remaining')
          .eq('user_id', userId)
          .eq('date', formattedPrevDate)
          .maybeSingle();
        
        const cumulativeSavings = prevDayExpense ? parseFloat(prevDayExpense.remaining) : 0;
        const cumulativeBudget = parseFloat(monthData.daily_allocation) + cumulativeSavings;
        const remaining = cumulativeBudget - parseFloat(amountSpent);
        
        // Create new expense record
        const { data, error } = await supabaseAdmin
          .from('daily_expenses')
          .insert([{
            user_id: userId,
            month_id: monthData.id,
            date: dateString,
            amount_spent: amountSpent,
            allocated_budget: monthData.daily_allocation,
            notes: notes,
            cumulative_savings: cumulativeSavings,
            cumulative_budget: cumulativeBudget,
            remaining: remaining
          }])
          .select();
          
        if (error) throw error;
        
        // Add indicator to response
        const expense = data[0];
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
        return;
      }
      
      // This is a real expense ID, so update the existing record
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
          notes: notes,
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
    // Allow both UUID and placeholder IDs (placeholder-YYYY-MM-DD)
    param('id').custom(value => {
      // Check if it's a UUID or a placeholder ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      const isPlaceholder = /^placeholder-\d{4}-\d{2}-\d{2}$/.test(value);
      if (!isUUID && !isPlaceholder) {
        throw new Error('Invalid ID format');
      }
      return true;
    })
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
      
      // Check if this is a placeholder ID
      const isPlaceholder = /^placeholder-\d{4}-\d{2}-\d{2}$/.test(id);
      
      if (isPlaceholder) {
        // This is a placeholder expense, so there's nothing to delete
        // Just return success
        res.status(204).send();
        return;
      }
      
      // This is a real expense ID, so delete the existing record
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
