const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Create a special admin client with service role key to bypass RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Create a regular client for normal operations with anon key
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Make supabase clients available to all routes
app.locals.supabase = supabase;
app.locals.supabaseAdmin = supabaseAdmin;

// API routes
app.use('/api/income', require('./src/routes/income'));
app.use('/api/budget', require('./src/routes/budget'));
app.use('/api/expense', require('./src/routes/expense'));
app.use('/api/report', require('./src/routes/report'));

// Root route
app.get('/', (req, res) => {
  res.send('Expense Tracker API is running');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
