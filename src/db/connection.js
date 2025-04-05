/**
 * Database Connection
 * 
 * We're using SQLite for simplicity - no need for a separate DB server.
 * It works great for this bot unless you have thousands of users.
 */
const { Sequelize } = require('sequelize');
const path = require('path');

// Where to store the database file
// Can be overridden with DB_PATH env var if needed
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.sqlite');

// Set up our database connection
// SQLite is perfect for this - simple, portable, and no separate server needed
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  // Only log queries in debug mode - gets noisy otherwise!
  logging: process.env.DEBUG === 'true' ? console.log : false,
  // This helps with concurrent writes - important for busy bots
  transactionType: 'IMMEDIATE', 
  // Connection pool settings - probably overkill for SQLite but good practice
  pool: {
    max: 5,    // Max connections in pool
    min: 0,    // Min connections in pool
    acquire: 30000, // Max time to get connection (ms)
    idle: 10000     // Max idle time (ms) before connection is released
  }
});

// Connect to the database and set up models
const connectDB = async () => {
  try {
    // First make sure we can actually connect
    await sequelize.authenticate();
    console.log('✅ Connected to SQLite database');
    
    // We have to do this import after sequelize is defined to avoid circular dependencies
    // Bit of a hack but it works!
    const { initializeModels } = require('./init');
    
    // Set up all the model relationships
    initializeModels();
    
    // Create tables if they don't exist
    // Tried using alter:true but it has issues with foreign keys in SQLite
    await sequelize.sync();
    console.log('✅ Database schema synchronized');
  } catch (error) {
    // If we can't connect, no point continuing
    console.error('❌ Database connection failed:', error);
    process.exit(1); // Bail out - can't run without a database
  }
};

// Export for use in other files
module.exports = { sequelize, connectDB }; 