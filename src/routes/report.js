const express = require('express');
const router = express.Router();
const { param, validationResult } = require('express-validator');
const { authenticateToken } = require('../utils/auth');

// Get monthly summary report
router.get('/monthly/:month/:year', 
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
      const supabase = req.app.locals.supabase;
      
      // Call the stored function to get monthly summary
      const { data, error } = await supabase.rpc('get_monthly_summary', {
        user_id: userId,
        month_num: parseInt(month),
        year_num: parseInt(year)
      });
      
      if (error) throw error;
      
      if (!data) {
        return res.status(404).json({ message: 'No data found for this month' });
      }
      
      // Format the response
      const report = {
        month: parseInt(month),
        year: parseInt(year),
        totalIncome: parseFloat(data.total_income || 0),
        totalSavings: parseFloat(data.total_savings || 0),
        totalSpent: parseFloat(data.total_spent || 0),
        totalDailyAllocation: parseFloat(data.total_daily_allocation || 0),
        totalRemaining: parseFloat(data.total_remaining || 0),
        cumulativeSavings: parseFloat(data.cumulative_savings || 0)
      };
      
      res.json(report);
    } catch (error) {
      console.error('Error generating monthly report:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Get daily expense trend for a month
router.get('/trend/:month/:year', 
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
      const supabase = req.app.locals.supabase;
      
      // Get month ID
      const { data: monthData, error: monthError } = await supabase
        .from('months')
        .select('id')
        .eq('month', month)
        .eq('year', year)
        .eq('user_id', userId)
        .single();
      
      if (monthError || !monthData) {
        return res.status(404).json({ message: 'Month not found' });
      }
      
      // Get daily expenses
      const { data: expenses, error: expensesError } = await supabase
        .from('daily_expenses')
        .select('date, amount_spent, allocated_budget, cumulative_savings, cumulative_budget, remaining')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .order('date');
      
      if (expensesError) throw expensesError;
      
      // Format the response
      const trend = expenses.map(expense => ({
        date: expense.date,
        amountSpent: parseFloat(expense.amount_spent),
        allocatedBudget: parseFloat(expense.allocated_budget),
        cumulativeSavings: parseFloat(expense.cumulative_savings),
        cumulativeBudget: parseFloat(expense.cumulative_budget),
        remaining: parseFloat(expense.remaining)
      }));
      
      res.json(trend);
    } catch (error) {
      console.error('Error generating expense trend:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Get savings analysis
router.get('/savings/:month/:year', 
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
      const supabase = req.app.locals.supabase;
      
      // Get month data
      const { data: monthData, error: monthError } = await supabase
        .from('months')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .eq('user_id', userId)
        .single();
      
      if (monthError || !monthData) {
        return res.status(404).json({ message: 'Month not found' });
      }
      
      // Get savings categories
      const { data: savingsCategories, error: categoriesError } = await supabase
        .from('budget_categories')
        .select('name, amount')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .eq('type', 'Savings')
        .order('amount', { ascending: false });
      
      if (categoriesError) throw categoriesError;
      
      // Get the last day's expense to get cumulative savings
      const { data: lastDayExpense, error: expenseError } = await supabase
        .from('daily_expenses')
        .select('remaining')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .single();
      
      // Format the response
      const totalPlannedSavings = savingsCategories.reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
      const extraSavings = lastDayExpense ? parseFloat(lastDayExpense.remaining) : 0;
      
      const analysis = {
        month: parseInt(month),
        year: parseInt(year),
        plannedSavings: savingsCategories.map(cat => ({
          name: cat.name,
          amount: parseFloat(cat.amount)
        })),
        totalPlannedSavings,
        extraSavings,
        totalSavings: totalPlannedSavings + extraSavings,
        savingsPercentage: monthData.income > 0 
          ? ((totalPlannedSavings + extraSavings) / parseFloat(monthData.income) * 100).toFixed(2)
          : 0
      };
      
      res.json(analysis);
    } catch (error) {
      console.error('Error generating savings analysis:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Get spending analysis
router.get('/spending/:month/:year', 
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
      const supabase = req.app.locals.supabase;
      
      // Get month data
      const { data: monthData, error: monthError } = await supabase
        .from('months')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .eq('user_id', userId)
        .single();
      
      if (monthError || !monthData) {
        return res.status(404).json({ message: 'Month not found' });
      }
      
      // Get spending categories
      const { data: spendingCategories, error: categoriesError } = await supabase
        .from('budget_categories')
        .select('name, amount')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .eq('type', 'Spent')
        .order('amount', { ascending: false });
      
      if (categoriesError) throw categoriesError;
      
      // Get total actual spending from daily expenses
      const { data: totalSpending, error: spendingError } = await supabase
        .from('daily_expenses')
        .select('amount_spent')
        .eq('month_id', monthData.id)
        .eq('user_id', userId);
      
      if (spendingError) throw spendingError;
      
      const totalActualSpending = totalSpending.reduce((sum, exp) => sum + parseFloat(exp.amount_spent), 0);
      const totalPlannedSpending = spendingCategories.reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
      
      // Format the response
      const analysis = {
        month: parseInt(month),
        year: parseInt(year),
        plannedSpending: spendingCategories.map(cat => ({
          name: cat.name,
          amount: parseFloat(cat.amount)
        })),
        totalPlannedSpending,
        totalActualSpending,
        difference: totalPlannedSpending - totalActualSpending,
        spendingPercentage: monthData.income > 0 
          ? (totalActualSpending / parseFloat(monthData.income) * 100).toFixed(2)
          : 0
      };
      
      res.json(analysis);
    } catch (error) {
      console.error('Error generating spending analysis:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

module.exports = router;
