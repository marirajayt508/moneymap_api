const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Create a special admin client with service role key to bypass RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function getMonthlyReport() {
  try {
    const userId = '999557ef-6b37-4573-a770-cb9c6ca647c1';
    const month = 5;
    const year = 2025;
    
    // Get month data
    const { data: monthData, error: monthError } = await supabaseAdmin
      .from('months')
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();
    
    if (monthError) {
      console.error('Error getting month data:', monthError);
      return;
    }
    
    if (!monthData) {
      console.log('No month data found for', month, year);
      return;
    }
    
    // Get total savings from budget categories
    const { data: savingsCategories, error: savingsError } = await supabaseAdmin
      .from('budget_categories')
      .select('amount')
      .eq('month_id', monthData.id)
      .eq('user_id', userId)
      .eq('type', 'Savings');
    
    if (savingsError) {
      console.error('Error getting savings categories:', savingsError);
      return;
    }
    
    // Get total spent from budget categories
    const { data: spentCategories, error: spentError } = await supabaseAdmin
      .from('budget_categories')
      .select('amount')
      .eq('month_id', monthData.id)
      .eq('user_id', userId)
      .eq('type', 'Spent');
    
    if (spentError) {
      console.error('Error getting spent categories:', spentError);
      return;
    }
    
    // Get the last day's expense to get cumulative savings
    const { data: lastDayExpense, error: expenseError } = await supabaseAdmin
      .from('daily_expenses')
      .select('remaining')
      .eq('month_id', monthData.id)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (expenseError) {
      console.error('Error getting last day expense:', expenseError);
      return;
    }
    
    // Calculate totals
    const totalIncome = parseFloat(monthData.income) || 0;
    const totalSavings = savingsCategories.reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
    const totalSpent = spentCategories.reduce((sum, cat) => sum + parseFloat(cat.amount), 0);
    const totalDailyAllocation = parseFloat(monthData.daily_allocation) * monthData.days_in_month;
    const totalRemaining = parseFloat(monthData.balance_amount) || 0;
    const cumulativeSavings = lastDayExpense ? parseFloat(lastDayExpense.remaining) : 0;
    
    // Format the response
    const report = {
      month,
      year,
      totalIncome,
      totalSavings,
      totalSpent,
      totalDailyAllocation,
      totalRemaining,
      cumulativeSavings
    };
    
    console.log('Monthly Summary Report:');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

getMonthlyReport();
