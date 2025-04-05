/**
 * User Model
 * 
 * Represents a user who has interacted with our bot
 * Each user gets a unique anonymousId which is shown to the owner
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/connection');

// Our User model with all the fields we need to track
const User = sequelize.define('User', {
  // Their Telegram ID (string because Telegram uses massive integers)
  telegramId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true // Can't have duplicate users!
  },
  
  // Telegram username (optional - some people don't have one)
  username: {
    type: DataTypes.STRING,
    allowNull: true // Not everyone sets a username
  },
  
  // User's first name (almost always available)
  firstName: {
    type: DataTypes.STRING,
    allowNull: true // Just in case...
  },
  
  // User's last name (often not set)
  lastName: {
    type: DataTypes.STRING,
    allowNull: true // Many users don't have this
  },
  
  // This is what we show to the bot owner instead of the real ID
  // Makes users anonymous to each other while the owner knows who is who
  anonymousId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true // Each user gets a unique number
  },
  
  // When they last sent a message - helps us track active users
  lastActivity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  
  // Whether the user is blocked (can't send messages if true)
  isBlocked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false // Users start unblocked of course
  },
  
  // Why they were blocked - helps keep track of problem users
  blockReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason why the user was blocked'
  },
  
  // Owner can add notes about users (like "this is my friend Bob")
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Private notes about this user'
  },
  
  // When they were last notified about a message being read
  // Prevents spam notifications
  lastNotificationTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'The last time the user was notified about message being read'
  }
}, {
  timestamps: true, // Adds createdAt & updatedAt automatically
  // TODO: Maybe add indexes for commonly searched fields?
});

// Relationships are in db/init.js to avoid circular dependencies
// This is a mess, but it's the cleanest way I could figure out

module.exports = User; 