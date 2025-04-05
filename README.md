# Telegram Anonymous Messaging Bot

A feature-rich Telegram bot that enables anonymous messaging with comprehensive admin features. This bot allows users to communicate with an admin anonymously, supporting various media types, user management, and two-way communication.

## Features

### Core Functionality
- Anonymous messaging system 
- Two-way communication while maintaining anonymity
- Persistent message storage in SQLite database
- Transaction-based message handling to prevent duplicates

### Media Support
- Text messages
- Photos with captions
- Videos and animations
- Voice messages
- Documents and files
- Stickers

### Admin Features
- User blocking system with reasons
- User notes for keeping track of conversations
- Broadcast messaging to all users
- Detailed user information display
- Unread message notifications

### Security & Performance
- Reliable message delivery system
- Concurrent message handling
- Efficient database queries

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/itzidin/telegram-anonymous-bot.git
   cd telegram-anonymous-bot
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the required environment variables:
     ```
     BOT_TOKEN=your_bot_token_here
     OWNER_CHAT_ID=your_telegram_id_here
     GROUP_CHAT_ID=optional_group_chat_id
     ```

4. Database Setup:
   - The bot uses SQLite, which will be created automatically
   - To initialize or update the database schema, run the migration:
     ```
     npm run migrate
     ```

5. Start the bot:
   ```
   node src/index.js
   ```
   
   Or use npm script:
   ```
   npm start
   ```

## Creating Your Bot

1. **Get a Bot Token:**
   - Open Telegram and search for [@BotFather](https://t.me/BotFather)
   - Send the command `/newbot`
   - Follow the instructions to create your bot
   - Copy the API token provided by BotFather

2. **Find Your Chat ID:**
   - Start your bot
   - Send any message to your bot
   - Run your bot temporarily with: `BOT_TOKEN=your_token node src/index.js`
   - Use the `/getchatid` command to get your ID
   - Add this ID to your `.env` file as `OWNER_CHAT_ID`

3. **Optional Group Chat:**
   - If you want to receive detailed user information in a separate group:
   - Create a Telegram group
   - Add your bot to the group as an admin
   - Use `/getchatid` in the group
   - Add this ID to your `.env` file as `GROUP_CHAT_ID`

## Usage

### User Commands
- `/start` - Start the bot and get welcome message
- `/getchatid` - Get your current chat ID

### Admin Commands
- `/newmsg` - Process new messages
- `/block #ID [reason: optional reason]` - Block a user
- `/unblock #ID` - Unblock a user
- `/blocklist` - Show all blocked users
- `/note #ID Your note text` - Add a note to a user
- `/viewnotes #ID` - View all notes for a user
- `/broadcast` - Send a message to all users (reply to a message with this command)
- `/help` - Show all available commands

## Troubleshooting

### Common Issues:
1. **Bot not responding:** Verify your bot token is correct
2. **Owner commands not working:** Double-check your OWNER_CHAT_ID
3. **Database errors:** Run the migration script with `npm run migrate`
4. **Media not sending:** Ensure the bot has permission to send media in the chat

### Bot Permissions:
For full functionality, your bot needs these permissions:
- Read Messages
- Send Messages
- Send Media
- Send Stickers

## Database Structure
The bot uses SQLite to store users, messages, and settings:
- `Users` table tracks users and their properties
- `Messages` table stores all communications
- `Settings` table handles global configurations

## License
This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) for the Telegram Bot API wrapper
- [Sequelize](https://sequelize.org/) for ORM functionality 
