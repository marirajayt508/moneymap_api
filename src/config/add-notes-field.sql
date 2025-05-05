-- Add notes field to daily_expenses table
ALTER TABLE IF EXISTS daily_expenses
ADD COLUMN IF NOT EXISTS notes TEXT;
