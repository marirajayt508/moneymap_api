#!/bin/bash

# Expense Tracker API Dependencies Installation Script

echo "Installing Expense Tracker API dependencies..."

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

echo ""
echo "Dependencies installed successfully!"
echo ""
echo "Next steps:"
echo "1. Update the .env file with your Supabase credentials"
echo "2. Run the SQL script in src/config/supabase-schema.sql in your Supabase SQL Editor"
echo "3. Start the server with: ./start-dev.sh"
echo ""
echo "For more information, see the README.md file."
