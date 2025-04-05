const { DataTypes } = require('sequelize');
const { sequelize } = require('../db/connection');

const Settings = sequelize.define('Settings', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    primaryKey: true
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = Settings; 