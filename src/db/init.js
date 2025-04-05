/**
 * Database Initialization
 * 
 * Sets up relationships between models. Had to put this in a separate file
 * to avoid circular dependency issues. Sequelize can be a pain sometimes.
 */
const User = require('../models/User');
const Message = require('../models/Message');
const Settings = require('../models/Settings');

// This function sets up all the model relationships 
// Call it after the models are loaded but before using them
function initializeModels() {
  // RELATIONSHIP: User → Messages (one-to-many)
  // A user can send many messages
  User.hasMany(Message, {
    foreignKey: 'userId',     // Field in Message table
    sourceKey: 'telegramId',  // Field in User table
    as: 'messages'            // Name when accessing from User
  });

  // RELATIONSHIP: Message → User (many-to-one)
  // A message belongs to one user
  Message.belongsTo(User, {
    foreignKey: 'userId',     // Field in Message table
    targetKey: 'telegramId',  // Field in User table to match
    as: 'user'                // Name when accessing from Message
  });
  
  // Note: We don't need relationships for Settings since it's just key-value storage
  
  // TODO: Maybe add message read status tracking relationships later?
}

module.exports = { initializeModels }; 