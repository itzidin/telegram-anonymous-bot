# Telegram Anonymous Bot Documentation

## Overview
An anonymous messaging bot that allows users to send messages to the bot owner anonymously. The bot owner can see the sender's details while the communication remains anonymous for the sender. The bot facilitates two-way communication with support for all media types.

## Core Features
- Anonymous messaging to bot owner
- Display sender details to bot owner (UserID, Username, Name)
- Two-way communication system
- Support for all media types (text, stickers, GIFs, emojis, voice messages, video messages, etc.)
- Unique anonymous ID assignment for each user (e.g., User #23)
- Reply functionality for bot owner
- User blocking system
- Broadcast messages to all users
- User notes and management
- Language selection (English/Persian) via environment variables

## Technical Implementation
- Node.js with Telegram Bot API
- SQLite database for storing user and message data
- Media handling capabilities
- Multi-language support (English and Persian)

## Implementation Structure

### Phase 1: Basic Setup
1. Create bot using BotFather
2. Set up project structure
3. Install required dependencies
4. Configure environment variables
5. Set up language selection in .env file

### Phase 2: Core Functionality
1. Implement message receiving mechanism
2. Create user ID tracking system
3. Set up anonymous ID assignment
4. Program confirmation messages in selected language
5. Develop forwarding system to bot owner with two messages:
   - First message: User details (ID, username, name)
   - Second message: The actual message with Anonymous ID prefix

### Phase 3: Media Support
1. Implement support for text messages
2. Add support for stickers, GIFs, emojis
3. Implement voice and video message handling
4. Test multiple media items in one message

### Phase 4: Reply System
1. Create reply detection mechanism (when owner replies to messages)
2. Implement message routing back to original sender
3. Maintain anonymity in the reply process
4. Test two-way communication flow

### Phase 5: Enhanced Features
1. User blocking system
   - Commands to block/unblock users
   - Ability to see a list of blocked users
   - Block reason tracking
2. Broadcast messaging
   - Send a message to all users at once
   - Support for all media types in broadcasts
   - Confirmation system to prevent accidental broadcasts
3. User notes
   - Add private notes to users
   - View notes for specific users
   - Timestamp notes for reference
4. Language support
   - Configure bot language via .env (LANGUAGE=en/fa)
   - Support for English and Persian messages
   - Automatic response in the configured language

## Language Configuration
The bot supports two languages that can be configured in the `.env` file:

- English (en): All bot messages will be sent in English
- Persian/Farsi (fa): All bot messages will be sent in Persian/Farsi (default)

To change the language, set the `LANGUAGE` parameter in your `.env` file:
```
LANGUAGE=en  # For English
LANGUAGE=fa  # For Persian/Farsi (default if not specified)
```

## Message Flow
1. User sends message to bot
2. Bot responds with confirmation message in configured language
3. Bot forwards to owner:
   - Message 1: "User ID: 6176680299, Username: justtasiaa, Name: آسیه"
   - Message 2: "Message:\n\n======================\n\nAnonymous ID: User #23\n\n[actual message content]"
4. Owner replies to Message 2
5. Reply is sent to the original user

## Admin Commands
- `/newmsg` - Show new messages
- `/block #ID [reason]` - Block a user
- `/unblock #ID` - Unblock a user
- `/blocklist` - List all blocked users
- `/note #ID [text]` - Add a note to a user
- `/viewnotes #ID` - View notes for a user
- `/broadcast` - Broadcast a message to all users
- `/help` - Show all available commands

## Database Structure

### Users Table
- `telegramId` - User's Telegram ID
- `username` - User's Telegram username
- `firstName` - User's first name
- `lastName` - User's last name
- `anonymousId` - Assigned anonymous ID
- `isBlocked` - Whether user is blocked
- `blockReason` - Reason for blocking
- `notes` - Private notes about the user
- `lastActivity` - Last activity timestamp

### Messages Table
- `userId` - Telegram ID of the sender
- `anonymousId` - Anonymous ID of the sender
- `userChatId` - Chat ID for replies
- `contentType` - Type of message (text, photo, etc.)
- `content` - Text content (if applicable)
- `fileId` - File ID for media
- `caption` - Caption for media
- `processed` - Whether message has been processed
- `ownerMessageId` - Message ID in owner's chat for replies
- `isRead` - Whether message has been read
- `userNotified` - Whether user has been notified of read status 

## Environment Configuration
All bot settings are configured through environment variables in the `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| BOT_TOKEN | Your Telegram bot token from BotFather | Required |
| OWNER_CHAT_ID | Telegram ID of the bot owner | Required |
| GROUP_CHAT_ID | Optional group for receiving messages | OWNER_CHAT_ID |
| DB_PATH | Path to SQLite database file | ./database.sqlite |
| DEBUG | Enable debug logging | false |
| AUTO_PROCESS_MESSAGES | Process messages automatically | true |
| NOTIFICATION_INTERVAL | Time between notifications (ms) | 900000 (15min) |
| LANGUAGE | Bot language ('en' or 'fa') | fa | 