# MoneyMap - Expense Tracker

A comprehensive expense tracking application that helps you manage your monthly budget, track daily expenses, and visualize your financial data.

## Features

- **Income Management**: Set your monthly income
- **Budget Categories**: Create budget categories for both spending and savings
- **Daily Expense Tracking**: Record and track your daily expenses with notes
- **Dynamic Daily Budget**: Automatically calculates your daily spending allowance
- **Cumulative Savings**: Tracks unspent daily budget as additional savings
- **Visual Reports**: View your financial data through interactive charts
- **Responsive Design**: Works on both desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/moneymap.git
   cd moneymap
   ```

2. Install dependencies:
   ```
   ./install-deps.sh
   ```
   
   Or manually:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with your Supabase credentials:
   ```
   PORT=5000
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_service_key
   SUPABASE_ANON_KEY=your_supabase_anon_key
   DATABASE_URL=your_database_url
   JWT_SECRET=your_jwt_secret
   ```

4. Run the setup script to initialize the application:
   ```
   ./setup.sh
   ```

5. Initialize the database by running the SQL scripts in your Supabase SQL Editor:
   - `src/config/supabase-schema.sql` - Creates tables and RLS policies
   - `src/config/fix-functions.sql` - Fixes function ambiguities
   - `src/config/bypass-rls-functions.sql` - Adds functions to bypass RLS for user creation
   - `src/config/add-notes-field.sql` - Adds notes field to daily_expenses table

   Alternatively, you can run the scripts:
   ```
   node apply-bypass-rls.js
   node src/config/apply-notes-migration.js
   ```

### Running the Application

Start the development server:
```
./start-dev.sh
```

Or manually:
```
npm run dev
```

The application will be available at `http://localhost:5000`.

## Usage Guide

### 1. Setting Up Your Income

- Navigate to the Income section
- Enter your monthly income amount
- Select the month and year
- Click "Save Income"

### 2. Creating Budget Categories

- Navigate to the Budget section
- Add categories for both spending (e.g., Rent, Groceries) and savings (e.g., Emergency Fund, Investments)
- The system will automatically calculate your daily spending allowance based on your income and budget allocations

### 3. Recording Daily Expenses

- Navigate to the Expenses section
- Select a date and enter the amount spent
- Add optional notes to keep track of what the expense was for
- The system will show you your remaining budget for the day
- Any unspent amount is carried forward to the next day as cumulative savings

### 4. Viewing Reports

- Navigate to the Reports section
- View monthly summary, savings analysis, spending breakdown, and expense trends
- Use the charts to gain insights into your financial habits

## How It Works

1. **Income Entry**: You enter your monthly income (e.g., ₹50,000)
2. **Budget Allocation**: You create budget categories (e.g., Rent: ₹7,100, Mutual Funds: ₹5,000)
3. **Daily Allocation**: The system calculates your daily spending allowance by dividing the remaining amount by the number of days in the month
4. **Expense Tracking**: As you record daily expenses, the system tracks your spending and calculates your remaining budget
5. **Cumulative Savings**: Unspent daily budget is added to the next day's allowance, creating a cumulative savings effect
6. **Monthly Report**: At the end of the month, you get a comprehensive report of your income, expenses, and savings

## Troubleshooting

### Row-Level Security (RLS) Issues

If you encounter errors related to row-level security policies, such as:
```
{
    "message": "Server error",
    "error": "new row violates row-level security policy for table \"users\""
}
```

This is likely due to the RLS policies preventing the creation of new user records. To fix this:

1. Make sure you've run the `src/config/bypass-rls-functions.sql` script in your Supabase SQL Editor or executed `node apply-bypass-rls.js`
2. Verify that your Supabase service key has the correct permissions
3. Check that the `supabaseAdmin` client is properly initialized with the service role key

The application includes several mechanisms to bypass RLS when necessary:
- Custom SQL functions with `SECURITY DEFINER` to bypass RLS
- Properly configured Supabase admin client
- Fallback mechanisms for user creation

### Other Common Issues

- **Database Connection Errors**: Verify your Supabase credentials in the `.env` file
- **Missing Tables**: Ensure you've run all the SQL scripts mentioned in the setup instructions
- **Authentication Errors**: For demonstration purposes, the app creates a demo user automatically

## License

This project is licensed under the MIT License - see the LICENSE file for details.
