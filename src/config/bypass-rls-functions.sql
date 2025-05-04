-- Function to insert a user record bypassing RLS
CREATE OR REPLACE FUNCTION insert_user_bypass_rls(user_id UUID, user_name TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.users (id, name)
  VALUES (user_id, user_name)
  ON CONFLICT (id) DO UPDATE
  SET name = user_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a user exists in the users table
CREATE OR REPLACE FUNCTION check_user_exists(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE id = user_id
  ) INTO user_exists;
  
  RETURN user_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
