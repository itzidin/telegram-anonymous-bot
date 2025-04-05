/**
 * Database migration script for SQLite
 * This handles adding new columns safely
 */
const { sequelize } = require('./connection');
const { Sequelize } = require('sequelize');

async function migrate() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('Starting database migration...');
    
    // Check if Settings table exists, if not create it
    const settingsTableExists = await checkIfTableExists('Settings');
    if (!settingsTableExists) {
      console.log('Creating Settings table...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "Settings" (
          "name" VARCHAR(255) PRIMARY KEY NOT NULL,
          "value" TEXT,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL
        );
      `, { transaction });
    }
    
    // Check if Users table has isBlocked column, if not add it
    const userColumns = await getTableColumns('Users');
    if (!userColumns.includes('isBlocked')) {
      console.log('Adding isBlocked column to Users table...');
      await sequelize.query(`
        ALTER TABLE "Users" ADD COLUMN "isBlocked" BOOLEAN DEFAULT 0;
      `, { transaction });
    }
    
    // Check if Users table has blockReason column, if not add it
    if (!userColumns.includes('blockReason')) {
      console.log('Adding blockReason column to Users table...');
      await sequelize.query(`
        ALTER TABLE "Users" ADD COLUMN "blockReason" TEXT;
      `, { transaction });
    }
    
    // Check if Users table has notes column, if not add it
    if (!userColumns.includes('notes')) {
      console.log('Adding notes column to Users table...');
      await sequelize.query(`
        ALTER TABLE "Users" ADD COLUMN "notes" TEXT;
      `, { transaction });
    }
    
    await transaction.commit();
    console.log('Database migration completed successfully!');
  } catch (error) {
    await transaction.rollback();
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

async function checkIfTableExists(tableName) {
  const query = `
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name=?;
  `;
  const results = await sequelize.query(query, {
    replacements: [tableName],
    type: Sequelize.QueryTypes.SELECT
  });
  return results.length > 0;
}

async function getTableColumns(tableName) {
  const query = `PRAGMA table_info(${tableName});`;
  const results = await sequelize.query(query, {
    type: Sequelize.QueryTypes.SELECT
  });
  return results.map(column => column.name);
}

// Run the migration
migrate().then(() => {
  console.log('Migration script completed');
  process.exit(0);
}).catch(err => {
  console.error('Error running migration:', err);
  process.exit(1);
}); 