const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/connection');

const Message = sequelize.define('Message', {
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Telegram ID of the user who sent the message'
  },
  anonymousId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Anonymous ID of the user'
  },
  userChatId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Chat ID where to send replies'
  },
  contentType: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Type of message (text, photo, etc.)'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Text content of the message'
  },
  fileId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'File ID for media messages'
  },
  caption: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Caption for media messages'
  },
  processed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether the message has been processed and shown to the owner'
  },
  ownerMessageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Message ID in the owner chat for reply mapping'
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether the message has been read by the user'
  },
  userNotified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether the user has been notified that their message was read'
  }
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['processed']
    },
    {
      fields: ['isRead']
    }
  ]
});

module.exports = Message; 