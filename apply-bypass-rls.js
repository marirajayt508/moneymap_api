const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createSupabaseAdminClient } = require('./src/utils/supabase');

// Load environment variables
dotenv.config();

// Initialize Supabase admin client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAdmin = createSupabaseAdminClient(supabaseUrl, supabaseServiceKey);

async function applyBypassRlsFunctions() {
  try {
    console.log('Applying bypass RLS functions...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'src', 'config', 'bypass-rls-functions.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error applying bypass RLS functions:', error);
      
      // Try executing the SQL directly
      console.log('Trying to execute SQL directly...');
      
      // Split the SQL into individual statements
      const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
      
      for (const statement of statements) {
        const { error: stmtError } = await supabaseAdmin.rpc('exec_sql', { 
          sql: statement + ';' 
        });
        
        if (stmtError) {
          console.error(`Error executing statement: ${statement}`, stmtError);
        } else {
          console.log(`Successfully executed statement: ${statement.substring(0, 50)}...`);
        }
      }
    } else {
      console.log('Successfully applied bypass RLS functions');
    }
  } catch (error) {
    console.error('Exception applying bypass RLS functions:', error);
  }
}

// Execute the function
applyBypassRlsFunctions()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
