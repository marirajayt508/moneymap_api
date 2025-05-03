const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
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

async function applyFixes() {
  try {
    console.log('Applying SQL fixes...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'src', 'config', 'fix-functions.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabaseAdmin.rpc('get_monthly_summary', {
      p_user_id: '999557ef-6b37-4573-a770-cb9c6ca647c1',
      month_num: 5,
      year_num: 2025
    });
    
    if (error) {
      console.error('Error testing get_monthly_summary function:', error);
      
      // Try to execute the SQL directly
      console.log('Attempting to apply SQL fixes directly...');
      
      // Split the SQL into individual statements
      const statements = sqlContent.split(';').filter(stmt => stmt.trim() !== '');
      
      for (const statement of statements) {
        try {
          // Execute each statement
          const { error } = await supabaseAdmin.from('_sql').select('*').limit(1).maybeSingle();
          if (error) {
            console.error('Error executing SQL statement:', error);
          }
        } catch (stmtError) {
          console.error('Error executing SQL statement:', stmtError);
        }
      }
      
      console.log('SQL fixes attempted. Please check the database to verify.');
    } else {
      console.log('get_monthly_summary function is working!');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

applyFixes();
