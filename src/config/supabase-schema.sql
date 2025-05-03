-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table (will be managed by Supabase Auth)
-- This table extends the auth.users table with additional fields
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Months Table
CREATE TABLE IF NOT EXISTS months (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  income DECIMAL(12,2) NOT NULL,
  days_in_month INTEGER NOT NULL,
  daily_allocation DECIMAL(12,2) NOT NULL,
  total_budgeted DECIMAL(12,2) NOT NULL,
  balance_amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, month, year)
);

-- Budget Categories Table
CREATE TABLE IF NOT EXISTS budget_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  month_id UUID REFERENCES months(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Spent', 'Savings')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily Expenses Table
CREATE TABLE IF NOT EXISTS daily_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  month_id UUID REFERENCES months(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  amount_spent DECIMAL(12,2) NOT NULL,
  allocated_budget DECIMAL(12,2) NOT NULL,
  cumulative_savings DECIMAL(12,2) NOT NULL,
  cumulative_budget DECIMAL(12,2) NOT NULL,
  remaining DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);

-- Function to calculate daily allocation
CREATE OR REPLACE FUNCTION calculate_daily_allocation(month_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_income DECIMAL;
  v_total_budgeted DECIMAL;
  v_days_in_month INTEGER;
  v_daily_allocation DECIMAL;
  v_balance_amount DECIMAL;
BEGIN
  -- Get month data
  SELECT income, total_budgeted, days_in_month 
  INTO v_income, v_total_budgeted, v_days_in_month
  FROM months WHERE id = month_id;
  
  -- Calculate balance amount
  v_balance_amount := v_income - v_total_budgeted;
  
  -- Calculate daily allocation
  IF v_days_in_month > 0 THEN
    v_daily_allocation := v_balance_amount / v_days_in_month;
  ELSE
    v_daily_allocation := 0;
  END IF;
  
  -- Update month record
  UPDATE months 
  SET daily_allocation = v_daily_allocation,
      balance_amount = v_balance_amount,
      updated_at = NOW()
  WHERE id = month_id;
  
  RETURN v_daily_allocation;
END;
$$ LANGUAGE plpgsql;

-- Function to update budget totals
CREATE OR REPLACE FUNCTION update_budget_totals(month_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_budgeted DECIMAL;
BEGIN
  -- Calculate total budgeted amount
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_budgeted
  FROM budget_categories
  WHERE month_id = month_id;
  
  -- Update month record
  UPDATE months 
  SET total_budgeted = v_total_budgeted,
      updated_at = NOW()
  WHERE id = month_id;
  
  -- Recalculate daily allocation
  PERFORM calculate_daily_allocation(month_id);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate cumulative budget
CREATE OR REPLACE FUNCTION calculate_cumulative_budget(user_id UUID, expense_date DATE)
RETURNS DECIMAL AS $$
DECLARE
  v_month_id UUID;
  v_daily_allocation DECIMAL;
  v_prev_day_remaining DECIMAL;
  v_cumulative_budget DECIMAL;
BEGIN
  -- Get month_id and daily allocation
  SELECT m.id, m.daily_allocation
  INTO v_month_id, v_daily_allocation
  FROM months m
  WHERE m.user_id = user_id
    AND m.month = EXTRACT(MONTH FROM expense_date)
    AND m.year = EXTRACT(YEAR FROM expense_date);
  
  -- Get previous day's remaining amount (cumulative savings)
  SELECT COALESCE(remaining, 0)
  INTO v_prev_day_remaining
  FROM daily_expenses
  WHERE user_id = user_id
    AND date = expense_date - INTERVAL '1 day';
  
  -- Calculate cumulative budget
  v_cumulative_budget := v_daily_allocation + v_prev_day_remaining;
  
  RETURN v_cumulative_budget;
END;
$$ LANGUAGE plpgsql;

-- Function to get monthly summary report
CREATE OR REPLACE FUNCTION get_monthly_summary(user_id UUID, month_num INTEGER, year_num INTEGER)
RETURNS TABLE (
  total_income DECIMAL,
  total_savings DECIMAL,
  total_spent DECIMAL,
  total_daily_allocation DECIMAL,
  total_remaining DECIMAL,
  cumulative_savings DECIMAL
) AS $$
DECLARE
  v_month_id UUID;
BEGIN
  -- Get month_id
  SELECT id INTO v_month_id
  FROM months
  WHERE user_id = user_id
    AND month = month_num
    AND year = year_num;
    
  -- Get total savings from budget categories
  SELECT COALESCE(SUM(amount), 0) INTO total_savings
  FROM budget_categories
  WHERE month_id = v_month_id
    AND type = 'Savings';
    
  -- Get total spent from budget categories
  SELECT COALESCE(SUM(amount), 0) INTO total_spent
  FROM budget_categories
  WHERE month_id = v_month_id
    AND type = 'Spent';
    
  -- Get month data
  SELECT income, daily_allocation * days_in_month, balance_amount
  INTO total_income, total_daily_allocation, total_remaining
  FROM months
  WHERE id = v_month_id;
  
  -- Get cumulative savings (last day's remaining amount)
  SELECT COALESCE(remaining, 0) INTO cumulative_savings
  FROM daily_expenses
  WHERE user_id = user_id
    AND month_id = v_month_id
    AND date = (
      SELECT MAX(date)
      FROM daily_expenses
      WHERE user_id = user_id
        AND month_id = v_month_id
    );
    
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Trigger for budget category changes
CREATE OR REPLACE FUNCTION trigger_update_budget_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_budget_totals(OLD.month_id);
  ELSE
    PERFORM update_budget_totals(NEW.month_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER budget_category_changes
AFTER INSERT OR UPDATE OR DELETE ON budget_categories
FOR EACH ROW EXECUTE PROCEDURE trigger_update_budget_totals();

-- Trigger for daily expense calculations
CREATE OR REPLACE FUNCTION trigger_calculate_expense_values()
RETURNS TRIGGER AS $$
DECLARE
  v_cumulative_savings DECIMAL;
  v_cumulative_budget DECIMAL;
  v_remaining DECIMAL;
BEGIN
  -- Get previous day's remaining (cumulative savings)
  SELECT COALESCE(remaining, 0)
  INTO v_cumulative_savings
  FROM daily_expenses
  WHERE user_id = NEW.user_id
    AND date = NEW.date - INTERVAL '1 day';
  
  -- Calculate cumulative budget
  v_cumulative_budget := NEW.allocated_budget + v_cumulative_savings;
  
  -- Calculate remaining
  v_remaining := v_cumulative_budget - NEW.amount_spent;
  
  -- Update the record
  NEW.cumulative_savings := v_cumulative_savings;
  NEW.cumulative_budget := v_cumulative_budget;
  NEW.remaining := v_remaining;
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER expense_calculations
BEFORE INSERT OR UPDATE ON daily_expenses
FOR EACH ROW EXECUTE PROCEDURE trigger_calculate_expense_values();

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE months ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
-- Users can only access their own profile
CREATE POLICY "Users can only access their own profile"
ON users FOR ALL USING (auth.uid() = id);

-- Users can only access their own months
CREATE POLICY "Users can only access their own months"
ON months FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own budget categories
CREATE POLICY "Users can only access their own budget categories"
ON budget_categories FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own daily expenses
CREATE POLICY "Users can only access their own daily expenses"
ON daily_expenses FOR ALL USING (auth.uid() = user_id);

-- Create a trigger to automatically create a user record when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
