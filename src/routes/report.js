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
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // Try to call the stored function first
      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('get_monthly_summary', {
        p_user_id: userId,
        month_num: parseInt(month),
        year_num: parseInt(year)
      });
      
      // If the stored function works, use its data
      if (!rpcError && rpcData && (
        parseFloat(rpcData.total_income) > 0 || 
        parseFloat(rpcData.total_savings) > 0 || 
        parseFloat(rpcData.total_spent) > 0
      )) {
      // Get daily expenses for per-day spending
      const { data: dailyExpenses, error: dailyExpensesError } = await supabaseAdmin
        .from('daily_expenses')
        .select('date, amount_spent')
        .eq('user_id', userId)
        .eq('month_id', rpcData.month_id);
      
      if (dailyExpensesError) throw dailyExpensesError;
      
      // Calculate total per-day spending
      const perDaySpending = dailyExpenses.reduce((acc, expense) => {
        const date = expense.date;
        acc[date] = parseFloat(expense.amount_spent || 0);
        return acc;
      }, {});
      
      // Calculate sum of all per-day spending
      const totalPerDaySpending = dailyExpenses.reduce((sum, expense) => {
        return sum + parseFloat(expense.amount_spent || 0);
      }, 0);
      
      // Format the response
      const report = {
        month: parseInt(month),
        year: parseInt(year),
        totalIncome: parseFloat(rpcData.total_income || 0),
        totalSavings: parseFloat(rpcData.total_savings || 0),
        totalSpent: parseFloat(rpcData.total_spent || 0),
        totalDailyAllocation: parseFloat(rpcData.total_daily_allocation || 0),
        totalRemaining: parseFloat(rpcData.total_remaining || 0),
        extraSavings: parseFloat(rpcData.cumulative_savings || 0),
        perdayLimit: parseFloat(rpcData.total_daily_allocation || 0) / (new Date(parseInt(year), parseInt(month), 0).getDate()), // Use actual days in month
        perDaySpending: perDaySpending, // Add per-day spending
        totalPerDaySpending: totalPerDaySpending, // Add sum of all per-day spending
        savingGoal: parseFloat(rpcData.total_income || 0) * 0.25 // 25% of income
      };
        
        return res.json(report);
      }
      
      // If the stored function fails or returns all zeros, calculate the data directly
      console.log('Calculating monthly summary directly...');
      
      // Get month data
      const { data: monthData, error: monthError } = await supabaseAdmin
        .from('months')
        .select('*')
        .eq('user_id', userId)
        .eq('month', month)
        .eq('year', year)
        .maybeSingle();
      
      if (monthError) throw monthError;
      
      if (!monthData) {
        return res.json({
          month: parseInt(month),
          year: parseInt(year),
          totalIncome: 0,
          totalSavings: 0,
          totalSpent: 0,
          totalDailyAllocation: 0,
          totalRemaining: 0,
          extraSavings: 0,
          perdayLimit: 0,
          perDaySpending: {}, // Add empty per-day spending object
          totalPerDaySpending: 0, // Add sum of all per-day spending
          savingGoal: 0 // 25% of income (0 in this case)
        });
      }
      
      // Get total savings from budget categories
      const { data: savingsCategories, error: savingsError } = await supabaseAdmin
        .from('budget_categories')
        .select('amount')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .eq('type', 'Savings');
      
      if (savingsError) throw savingsError;
      
      // Get total spent from budget categories
      const { data: spentCategories, error: spentError } = await supabaseAdmin
        .from('budget_categories')
        .select('amount')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .eq('type', 'Spent');
      
      if (spentError) throw spentError;
      
      // Get the last day's expense to get cumulative savings
      const { data: lastDayExpense, error: expenseError } = await supabaseAdmin
        .from('daily_expenses')
        .select('remaining')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (expenseError) throw expenseError;
      
      // Get daily expenses for per-day spending
      const { data: dailyExpenses, error: dailyExpensesError } = await supabaseAdmin
        .from('daily_expenses')
        .select('date, amount_spent')
        .eq('month_id', monthData.id)
        .eq('user_id', userId);
      
      if (dailyExpensesError) throw dailyExpensesError;
      
      // Calculate total per-day spending
      const perDaySpending = dailyExpenses.reduce((acc, expense) => {
        const date = expense.date;
        acc[date] = parseFloat(expense.amount_spent || 0);
        return acc;
      }, {});
      
      // Calculate sum of all per-day spending
      const totalPerDaySpending = dailyExpenses.reduce((sum, expense) => {
        return sum + parseFloat(expense.amount_spent || 0);
      }, 0);
      
      // Calculate totals
      const totalIncome = parseFloat(monthData.income) || 0;
      const totalSavings = savingsCategories.reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
      const totalSpent = spentCategories.reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
      const totalDailyAllocation = parseFloat(monthData.daily_allocation) * monthData.days_in_month;
      const totalRemaining = parseFloat(monthData.balance_amount) || 0;
      const extraSavings = lastDayExpense ? parseFloat(lastDayExpense.remaining) : 0;
      const perdayLimit = monthData.days_in_month > 0 ? totalDailyAllocation / monthData.days_in_month : 0;
      
      // Format the response
      const report = {
        month: parseInt(month),
        year: parseInt(year),
        totalIncome,
        totalSavings,
        totalSpent,
        totalDailyAllocation,
        totalRemaining,
        extraSavings,
        perdayLimit,
        perDaySpending, // Add per-day spending
        totalPerDaySpending, // Add sum of all per-day spending
        savingGoal: totalIncome * 0.25 // 25% of income
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
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // Get month ID
      const { data: monthData, error: monthError } = await supabaseAdmin
        .from('months')
        .select('id')
        .eq('month', month)
        .eq('year', year)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (monthError || !monthData) {
        return res.status(404).json({ message: 'Month not found' });
      }
      
      // Get daily expenses
      const { data: expenses, error: expensesError } = await supabaseAdmin
        .from('daily_expenses')
        .select('date, amount_spent, allocated_budget, cumulative_savings, cumulative_budget, remaining, notes')
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
        remaining: parseFloat(expense.remaining),
        notes: expense.notes
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
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // Get month data
      const { data: monthData, error: monthError } = await supabaseAdmin
        .from('months')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (monthError || !monthData) {
        return res.status(404).json({ message: 'Month not found' });
      }
      
      // Get savings categories
      const { data: savingsCategories, error: categoriesError } = await supabaseAdmin
        .from('budget_categories')
        .select('name, amount')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .eq('type', 'Savings')
        .order('amount', { ascending: false });
      
      if (categoriesError) throw categoriesError;
      
      // Get the last day's expense to get cumulative savings
      const { data: lastDayExpense, error: expenseError } = await supabaseAdmin
        .from('daily_expenses')
        .select('remaining')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
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
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // Get month data
      const { data: monthData, error: monthError } = await supabaseAdmin
        .from('months')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (monthError || !monthData) {
        return res.status(404).json({ message: 'Month not found' });
      }
      
      // Get spending categories
      const { data: spendingCategories, error: categoriesError } = await supabaseAdmin
        .from('budget_categories')
        .select('name, amount')
        .eq('month_id', monthData.id)
        .eq('user_id', userId)
        .eq('type', 'Spent')
        .order('amount', { ascending: false });
      
      if (categoriesError) throw categoriesError;
      
      // Get daily expenses with date and amount spent
      const { data: dailyExpenses, error: spendingError } = await supabaseAdmin
        .from('daily_expenses')
        .select('date, amount_spent')
        .eq('month_id', monthData.id)
        .eq('user_id', userId);
      
      if (spendingError) throw spendingError;
      
      // Calculate per-day spending
      const perDaySpending = dailyExpenses.reduce((acc, expense) => {
        const date = expense.date;
        acc[date] = parseFloat(expense.amount_spent || 0);
        return acc;
      }, {});
      
      // Calculate sum of all per-day spending
      const totalPerDaySpending = dailyExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount_spent || 0), 0);
      
      // Calculate total planned spending from budget categories
      const totalPlannedSpending = spendingCategories.reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
      
      // Calculate total actual spending from budget categories (this is different from totalPerDaySpending)
      const totalActualSpending = totalPlannedSpending; // Using planned spending as a proxy for actual spending from budget categories
      
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
          : 0,
        perDaySpending: perDaySpending, // Add per-day spending
        totalPerDaySpending: totalPerDaySpending, // Sum of all per-day spending
        plannedVsActual: totalPlannedSpending - totalActualSpending, // Difference between planned and actual spending
        plannedSpent: totalActualSpending - totalPerDaySpending // Difference between totalActualSpending and totalPerDaySpending
      };
      
      res.json(analysis);
    } catch (error) {
      console.error('Error generating spending analysis:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

module.exports = router;
