const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createSupabaseClient, createSupabaseAdminClient } = require('./utils/supabase');

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
const supabaseAdmin = createSupabaseAdminClient(supabaseUrl, supabaseServiceKey);

// Create a regular client for normal operations with anon key
const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

// Make supabase clients available to all routes
app.locals.supabase = supabase;
app.locals.supabaseAdmin = supabaseAdmin;

// Routes
const incomeRoutes = require('./routes/income');
const budgetRoutes = require('./routes/budget');
const expenseRoutes = require('./routes/expense');
const reportRoutes = require('./routes/report');
const financeRoutes = require('./routes/finance');

app.use('/api/income', incomeRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/expense', expenseRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/finance', financeRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Expense Tracker API is running');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
