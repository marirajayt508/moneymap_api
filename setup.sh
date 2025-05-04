#!/bin/bash

# Expense Tracker API Setup Script

echo "Setting up Expense Tracker API..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js (v14+) and try again."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install npm and try again."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "Please update the .env file with your Supabase credentials."
else
    echo ".env file already exists."
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update the .env file with your Supabase credentials"
echo "2. Run the SQL script in src/config/supabase-schema.sql in your Supabase SQL Editor"
echo "3. Run the SQL script in src/config/fix-functions.sql in your Supabase SQL Editor"
echo "4. Run the SQL script in src/config/bypass-rls-functions.sql in your Supabase SQL Editor"
echo "   or run: node apply-bypass-rls.js"
echo "5. Start the server with: npm run dev"
echo ""
echo "For more information, see the README.md file."
