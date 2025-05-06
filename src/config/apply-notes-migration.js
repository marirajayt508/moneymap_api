const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

// Load environment variables
dotenv.config();

// Get database connection string
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: DATABASE_URL must be set in .env file');
  process.exit(1);
}

// Create a new pool using the connection string
const pool = new Pool({
  connectionString: databaseUrl,
});

async function applyNotesMigration() {
  // Get a client from the pool
  const client = await pool.connect();
  
  try {
    console.log('Applying migration to add notes field to daily_expenses table...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'add-notes-field.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing SQL: ${statement.trim().substring(0, 50)}...`);
        try {
          await client.query(statement.trim());
          console.log(`Successfully executed statement: ${statement.trim().substring(0, 50)}...`);
        } catch (err) {
          console.error(`Error executing statement: ${statement.trim()}`, err);
          throw err;
        }
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('Successfully applied notes migration');
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Exception applying notes migration:', error);
    process.exit(1);
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

// Execute the function
applyNotesMigration()
  .then(() => {
    console.log('Done');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
