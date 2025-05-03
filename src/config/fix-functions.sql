/* Fix the update_budget_totals function to avoid ambiguity */
DROP TRIGGER IF EXISTS budget_category_changes ON budget_categories;
DROP FUNCTION IF EXISTS trigger_update_budget_totals();
DROP FUNCTION IF EXISTS update_budget_totals(uuid);

/* Recreate the main function with a different parameter name */
CREATE OR REPLACE FUNCTION update_budget_totals(p_month_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total_budgeted DECIMAL;
BEGIN
  /* Calculate total budgeted amount */
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_budgeted
  FROM budget_categories
  WHERE month_id = p_month_id;
  
  /* Update month record */
  UPDATE months 
  SET total_budgeted = v_total_budgeted,
      updated_at = NOW()
  WHERE id = p_month_id;
  
  /* Recalculate daily allocation */
  PERFORM calculate_daily_allocation(p_month_id);
END;
$$ LANGUAGE plpgsql;

/* Recreate the trigger function */
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

/* Recreate the trigger */
CREATE TRIGGER budget_category_changes
AFTER INSERT OR UPDATE OR DELETE ON budget_categories
FOR EACH ROW EXECUTE PROCEDURE trigger_update_budget_totals();

/* Fix the get_monthly_summary function to avoid ambiguity with user_id */
DROP FUNCTION IF EXISTS get_monthly_summary(uuid, integer, integer);

CREATE OR REPLACE FUNCTION get_monthly_summary(p_user_id UUID, month_num INTEGER, year_num INTEGER)
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
  v_month_exists BOOLEAN;
BEGIN
  /* Initialize all values to 0 */
  total_income := 0;
  total_savings := 0;
  total_spent := 0;
  total_daily_allocation := 0;
  total_remaining := 0;
  cumulative_savings := 0;
  
  /* Check if month exists */
  SELECT EXISTS(
    SELECT 1 FROM months 
    WHERE user_id = p_user_id 
      AND month = month_num 
      AND year = year_num
  ) INTO v_month_exists;
  
  /* Only proceed if month exists */
  IF v_month_exists THEN
    /* Get month_id */
    SELECT id INTO v_month_id
    FROM months
    WHERE user_id = p_user_id
      AND month = month_num
      AND year = year_num;
      
    /* Get total savings from budget categories */
    SELECT COALESCE(SUM(amount), 0) INTO total_savings
    FROM budget_categories
    WHERE month_id = v_month_id
      AND type = 'Savings';
      
    /* Get total spent from budget categories */
    SELECT COALESCE(SUM(amount), 0) INTO total_spent
    FROM budget_categories
    WHERE month_id = v_month_id
      AND type = 'Spent';
      
    /* Get month data */
    SELECT income, daily_allocation * days_in_month, balance_amount
    INTO total_income, total_daily_allocation, total_remaining
    FROM months
    WHERE id = v_month_id;
    
    /* Get cumulative savings (last day's remaining amount) */
    SELECT COALESCE(remaining, 0) INTO cumulative_savings
    FROM daily_expenses
    WHERE user_id = p_user_id
      AND month_id = v_month_id
      AND date = (
        SELECT MAX(date)
        FROM daily_expenses
        WHERE user_id = p_user_id
          AND month_id = v_month_id
      );
  END IF;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

/* We're now calculating these values directly in the code, so we'll disable the trigger */
DROP TRIGGER IF EXISTS expense_calculations ON daily_expenses;
DROP FUNCTION IF EXISTS trigger_calculate_expense_values();

/* Create a dummy function that doesn't modify the data */
CREATE OR REPLACE FUNCTION trigger_calculate_expense_values()
RETURNS TRIGGER AS $$
BEGIN
  /* Just return the NEW record without modifying it */
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/* We won't recreate the trigger since we're handling the calculations in the code */
