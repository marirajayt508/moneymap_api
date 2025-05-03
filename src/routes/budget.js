const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { authenticateToken } = require('../utils/auth');

// Get all budget categories for a month
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
    
    // Get budget categories
    const { data, error } = await supabaseAdmin
      .from('budget_categories')
      .select('*')
      .eq('month_id', monthId)
      .eq('user_id', userId)
      .order('name');
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching budget categories:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create a new budget category
router.post('/', 
  authenticateToken,
  [
    body('monthId').isUUID().withMessage('Valid month ID is required'),
    body('name').notEmpty().withMessage('Category name is required'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('type').isIn(['Spent', 'Savings']).withMessage('Type must be either Spent or Savings')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { monthId, name, amount, type } = req.body;
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
      
      // Create budget category
      const { data, error } = await supabaseAdmin
        .from('budget_categories')
        .insert([{
          user_id: userId,
          month_id: monthId,
          name,
          amount,
          type
        }])
        .select();
      
      if (error) throw error;
      
      res.status(201).json(data[0]);
    } catch (error) {
      console.error('Error creating budget category:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Update a budget category
router.put('/:id', 
  authenticateToken,
  [
    param('id').isUUID().withMessage('Valid category ID is required'),
    body('name').optional().notEmpty().withMessage('Category name cannot be empty'),
    body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
    body('type').optional().isIn(['Spent', 'Savings']).withMessage('Type must be either Spent or Savings')
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    try {
      const { id } = req.params;
      const { name, amount, type } = req.body;
      const userId = req.user.id;
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      
      // First verify the category belongs to the user
      const { data: category, error: categoryError } = await supabaseAdmin
        .from('budget_categories')
        .select('id')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (categoryError || !category) {
        return res.status(404).json({ message: 'Category not found or access denied' });
      }
      
      // Update fields that were provided
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (amount !== undefined) updateData.amount = amount;
      if (type !== undefined) updateData.type = type;
      updateData.updated_at = new Date();
      
      // Update budget category
      const { data, error } = await supabaseAdmin
        .from('budget_categories')
        .update(updateData)
        .eq('id', id)
        .select();
      
      if (error) throw error;
      
      res.json(data[0]);
    } catch (error) {
      console.error('Error updating budget category:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Delete a budget category
router.delete('/:id', 
  authenticateToken,
  [
    param('id').isUUID().withMessage('Valid category ID is required')
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
      
      // First verify the category belongs to the user
      const { data: category, error: categoryError } = await supabaseAdmin
        .from('budget_categories')
        .select('id')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (categoryError || !category) {
        return res.status(404).json({ message: 'Category not found or access denied' });
      }
      
      // Delete budget category
      const { error } = await supabaseAdmin
        .from('budget_categories')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting budget category:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// Get budget summary for a month
router.get('/summary/:monthId', authenticateToken, async (req, res) => {
  try {
    const { monthId } = req.params;
    const userId = req.user.id;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    
    // First verify the month belongs to the user
    const { data: month, error: monthError } = await supabaseAdmin
      .from('months')
      .select('*')
      .eq('id', monthId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (monthError || !month) {
      return res.status(404).json({ message: 'Month not found or access denied' });
    }
    
    // Get budget categories grouped by type
    const { data: categories, error: categoriesError } = await supabaseAdmin
      .from('budget_categories')
      .select('*')
      .eq('month_id', monthId)
      .eq('user_id', userId);
    
    if (categoriesError) throw categoriesError;
    
    // Calculate totals
    const spent = categories
      .filter(cat => cat.type === 'Spent')
      .reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
    
    const savings = categories
      .filter(cat => cat.type === 'Savings')
      .reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
    
    const summary = {
      income: parseFloat(month.income),
      totalBudgeted: parseFloat(month.total_budgeted),
      balanceAmount: parseFloat(month.balance_amount),
      dailyAllocation: parseFloat(month.daily_allocation),
      daysInMonth: month.days_in_month,
      spentCategories: spent,
      savingsCategories: savings
    };
    
    res.json(summary);
  } catch (error) {
    console.error('Error fetching budget summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
