/**
 * Anonymous Messaging Telegram Bot
 * 
 * This bot lets users send messages to the owner anonymously.
 * The owner sees who sent the message but can reply anonymously.
 * 
 * Created while pulling my hair out during finals week - but hey, it works!
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { connectDB, sequelize } = require('./db/connection');
const { Op } = require('sequelize'); // Used for date comparisons
const User = require('./models/User');
const Message = require('./models/Message');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Settings = require('./models/Settings');

// Bot setup - don't forget to add these to your .env file!
const token = process.env.BOT_TOKEN;
const ownerChatId = process.env.OWNER_CHAT_ID;
// This is optional - if not set, owner gets all messages
const groupChatId = process.env.GROUP_CHAT_ID || ownerChatId; 
// Language setting - defaults to Persian if not specified
const language = process.env.LANGUAGE || 'fa';

// Make sure we have what we need to run
if (!token) {
  console.error('❌ BOT_TOKEN missing from .env file - go create one with BotFather!');
  process.exit(1);
}

if (!ownerChatId) {
  console.error('❌ OWNER_CHAT_ID missing from .env file - who should receive the messages?');
  process.exit(1);
}

// Need this folder for temp files - profile pics, etc.
// TODO: Maybe add cleanup for old files someday
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Fire up the bot!
const bot = new TelegramBot(token, { 
  polling: true,
  filepath: false // Need this or callback queries don't work right
});

// Connect to the database - fingers crossed!
connectDB();

// We'll use this to assign anonymous IDs to new users
// It gets updated based on the highest ID in DB
let nextAnonymousId = 1;

// This helps prevent multiple /newmsg commands running at once
// Trust me, you don't want that happening!
let processingNewMessages = false;

// English messages
const englishMessages = {
  welcome: 'Welcome to the anonymous messaging bot! Any message you send will be forwarded anonymously to the bot owner.',
  messageSent: 'Your message has been received. Please wait for a response.',
  messageRead: 'Your message has been read.',
  errorProcessing: 'Error processing your message. Please try again later.',
  unsupportedMedia: 'The bot owner sent a type of message that cannot be forwarded.',
  blocked: 'You have been blocked by the bot administrator. Your messages will no longer be received.',
  unblocked: 'Your restriction has been lifted. You can now send messages again.'
};

// Persian messages for our users
// Had to get help from a friend for these translations
const persianMessages = {
  welcome: 'به ربات پیام ناشناس خوش آمدید! هر پیامی که بفرستید به صورت ناشناس به صاحب ربات ارسال می‌شود.',
  messageSent: 'پیام شما دریافت شد منتظر پاسخ باشید',
  messageRead: 'پیام شما خوانده شد',
  errorProcessing: 'خطا در پردازش پیام شما. لطفا بعدا دوباره تلاش کنید.',
  unsupportedMedia: 'صاحب ربات نوعی از پیام را ارسال کرد که قابل انتقال نیست.',
  blocked: '⛔ شما توسط مدیر ربات مسدود شده‌اید. پیام‌های شما دیگر دریافت نخواهد شد.',
  unblocked: '🔓 محدودیت شما برداشته شده است. شما اکنون می‌توانید پیام ارسال کنید.'
};

// Select the appropriate message set based on language setting
const messages = language === 'en' ? englishMessages : persianMessages;

// Tries to get the user's profile photo
// Sometimes this fails if they don't have one or have privacy settings
// Returns the file_id if successful, null if not
async function getUserProfilePhoto(userId) {
  try {
    console.log(`Trying to grab profile pic for user ${userId}`);
    
    // Telegram API lets us get profile photos - index 0 is the most recent
    const photos = await bot.getUserProfilePhotos(userId, 0, 1);
    
    // Debug log to help track down those weird occasional failures
    console.log(`Got profile photo response:`, JSON.stringify(photos));
    
    // Check if we actually got anything usable
    if (!photos || !photos.photos || photos.photos.length === 0 || photos.photos[0].length === 0) {
      console.log(`No profile pic for ${userId} - they might not have one set`);
      return null;
    }
    
    // Grab the highest resolution version available
    // The API returns multiple sizes for each photo
    const fileId = photos.photos[0][photos.photos[0].length - 1].file_id;
    console.log(`Got file_id: ${fileId}`);
    return fileId;
  } catch (error) {
    console.error(`Failed to get profile pic for ${userId}:`, error);
    return null; // Just return null and move on with life
  }
}

// Helper function to get comprehensive user information
async function getUserInfo(userId) {
  try {
    // Get chat information (works for users too)
    const chatInfo = await bot.getChat(userId);
    
    // Format the information
    const userInfo = {
      id: chatInfo.id,
      username: chatInfo.username || 'None',
      firstName: chatInfo.first_name || 'Unknown',
      lastName: chatInfo.last_name || '',
      bio: chatInfo.bio || 'No bio',
      type: chatInfo.type,
      language: chatInfo.language_code || 'Unknown',
      isPremium: chatInfo.is_premium || false,
      hasPrivateForwards: chatInfo.has_private_forwards || false,
      hasRestrictedVoiceAndVideo: chatInfo.has_restricted_voice_and_video_messages || false,
    };
    
    return userInfo;
  } catch (error) {
    console.error(`Error getting user information for user ${userId}:`, error);
    return null;
  }
}

// Helper function to get or create user
async function getOrCreateUser(msg) {
  const telegramId = msg.from.id.toString();
  const username = msg.from.username || null;
  const firstName = msg.from.first_name || null;
  const lastName = msg.from.last_name || null;

  // Use a transaction for database operations
  const transaction = await sequelize.transaction();

  try {
    // Try to find existing user
    let user = await User.findOne({ 
      where: { telegramId },
      transaction
    });
    
    if (!user) {
      // Get the highest anonymous ID in the database
      const highestUser = await User.findOne({
        order: [['anonymousId', 'DESC']],
        transaction
      });
      
      // Set the next anonymous ID
      nextAnonymousId = highestUser ? highestUser.anonymousId + 1 : 1;
      
      // Create new user
      user = await User.create({
        telegramId,
        username,
        firstName,
        lastName,
        anonymousId: nextAnonymousId
      }, { transaction });
      
      console.log(`New user created with anonymous ID: User #${nextAnonymousId}`);
    } else {
      // Update user details if changed
      if (user.username !== username || user.firstName !== firstName || user.lastName !== lastName) {
        await user.update({
          username,
          firstName,
          lastName,
          lastActivity: new Date()
        }, { transaction });
      } else {
        // Just update activity timestamp
        await user.update({ lastActivity: new Date() }, { transaction });
      }
    }

    // Commit the transaction
    await transaction.commit();
    
    return user;
  } catch (error) {
    // Rollback the transaction on error
    await transaction.rollback();
    console.error('Error getting or creating user:', error);
    return null;
  }
}

// Saves a message to the database and handles duplicate prevention
// This was a nightmare to get right but seems solid now
async function storeMessage(msg, user) {
  try {
    // Wrap everything in a transaction so we don't get half-completed operations
    // Had some DB corruption issues before adding this!
    const transaction = await sequelize.transaction();
    
    try {
      // Figure out what kind of message we're dealing with
      // Telegram has like a million different message types...
      let contentType = 'text';
      let content = null;
      let fileId = null;
      let caption = null;
      
      // This is a bit verbose but it's the clearest way to handle all types
      // Tried using a map/object approach but it got messy with the different data structures
      if (msg.text) {
        contentType = 'text';
        content = msg.text;
      } else if (msg.photo) {
        contentType = 'photo';
        // Always grab the highest resolution photo (last in array)
        fileId = msg.photo[msg.photo.length - 1].file_id;
        caption = msg.caption || null;
      } else if (msg.sticker) {
        contentType = 'sticker';
        fileId = msg.sticker.file_id;
      } else if (msg.voice) {
        contentType = 'voice';
        fileId = msg.voice.file_id;
        caption = msg.caption || null;
      } else if (msg.video) {
        contentType = 'video';
        fileId = msg.video.file_id;
        caption = msg.caption || null;
      } else if (msg.document) {
        contentType = 'document';
        fileId = msg.document.file_id;
        caption = msg.caption || null;
      } else if (msg.audio) {
        contentType = 'audio';
        fileId = msg.audio.file_id;
        caption = msg.caption || null;
      } else if (msg.animation) {
        contentType = 'animation';
        fileId = msg.animation.file_id;
        caption = msg.caption || null;
      } else {
        // User sent something weird - log it for debugging
        console.log('Got some weird message type:', msg);
        await transaction.rollback();
        return null;
      }
      
      // IMPORTANT: Check for duplicate messages within the last 5 seconds
      // Some people mash the send button and we get the same message multiple times
      const existingMessage = await Message.findOne({
        where: {
          userId: user.telegramId,
          contentType,
          ...(content ? { content } : {}),
          ...(fileId ? { fileId } : {}),
          createdAt: {
            [Op.gt]: new Date(Date.now() - 5000) // 5 second window
          }
        },
        transaction
      });
      
      if (existingMessage) {
        console.log('Caught a duplicate message - nice try!');
        await transaction.commit();
        return existingMessage;
      }
      
      // All good - save this message to the database
      const message = await Message.create({
        userId: user.telegramId,
        anonymousId: user.anonymousId,
        userChatId: msg.chat.id.toString(),
        contentType,
        content,
        fileId,
        caption,
        processed: false, // Will be set to true when owner views it
        isRead: false,    // Will be set to true when owner reads it
        userNotified: false // Will be set to true when user is notified of read
      }, { transaction });
      
      // Count how many messages are pending so we can notify the owner
      const pendingCount = await Message.count({
        where: { processed: false },
        transaction
      });
      
      // We're done with the database part - commit all changes
      await transaction.commit();
      
      // Now notify the owner about the new message(s)
      // Do this AFTER committing the transaction to avoid long-running transactions
      setTimeout(async () => {
        try {
          await bot.sendMessage(
            ownerChatId, 
            `📬 You have ${pendingCount} new message(s)!\nUse /newmsg to view them.`
          );
          
          // Update last notification time so we don't spam the owner
          await Settings.upsert({
            name: 'last_owner_notification',
            value: new Date().toISOString()
          });
        } catch (error) {
          console.error('Failed to send notification to owner:', error);
          // Not much we can do if this fails - the messages are still saved
        }
      }, 500); // Small delay to let the transaction fully commit
      
      return message;
    } catch (error) {
      // Something went wrong - rollback any changes we made
      await transaction.rollback();
      throw error; // Re-throw so the outer catch block can handle it
    }
  } catch (error) {
    console.error('Error storing message:', error);
    throw error; // Let the caller deal with this
  }
}

// Helper function to format date in a human-readable way
function formatDate(date) {
  if (!date) return "Unknown";
  
  try {
    // Create a date object
    const inputDate = new Date(date);
    
    // Tehran is UTC+3:30
    const tehranOffsetHours = 3.5;
    
    // Get the UTC time in milliseconds
    const utcTime = inputDate.getTime() + (inputDate.getTimezoneOffset() * 60000);
    
    // Create new Date object for Tehran time
    const tehranTime = new Date(utcTime + (3600000 * tehranOffsetHours));
    
    // Format in English with Tehran timezone
    return tehranTime.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tehran' // Try to use built-in timezone if supported
    }) + " (Tehran Time)";
  } catch (error) {
    console.error('Error formatting date:', error);
    return String(date);
  }
}

// Helper function to send detailed user info to group
async function sendDetailedUserInfoToGroup(user, anonymousId) {
  try {
    // Skip if group chat ID is not set or is same as owner
    if (!groupChatId || groupChatId === ownerChatId) {
      return;
    }
    
    console.log(`Sending detailed user info for User #${anonymousId} to group ${groupChatId}`);
    
    // Get detailed user information
    const userInfo = await getUserInfo(user.telegramId);
    
    // Format user details
    let detailedInfo = `📊 *User Details for Anonymous ID:* #${anonymousId}\n\n`;
    detailedInfo += `🆔 *Telegram ID:* \`${user.telegramId}\`\n`;
    detailedInfo += `👤 *Username:* ${user.username ? '@' + user.username : 'None'}\n`;
    detailedInfo += `📝 *Name:* ${user.firstName} ${user.lastName || ''}\n`;
    
    if (userInfo) {
      detailedInfo += `📱 *Account Type:* ${userInfo.isPremium ? 'Premium' : 'Regular'}\n`;
      detailedInfo += `🌐 *Language:* ${userInfo.language}\n`;
      if (userInfo.bio) detailedInfo += `📌 *Bio:* ${userInfo.bio}\n`;
      detailedInfo += `🔒 *Privacy Settings:*\n`;
      detailedInfo += `   - Private Forwards: ${userInfo.hasPrivateForwards ? 'Enabled' : 'Disabled'}\n`;
      detailedInfo += `   - Restricted Media: ${userInfo.hasRestrictedVoiceAndVideo ? 'Enabled' : 'Disabled'}\n`;
    }
    
    detailedInfo += `⏱ *First Contact:* ${formatDate(user.createdAt)}\n`;
    detailedInfo += `🕒 *Last Activity:* ${formatDate(user.lastActivity)}\n`;
    
    // Send the detailed information to the group
    await bot.sendMessage(groupChatId, detailedInfo, { parse_mode: 'Markdown' });
    
    // Try to get profile photo file_id
    console.log(`Fetching profile photo for user ${user.telegramId}`);
    const photoFileId = await getUserProfilePhoto(user.telegramId);
    if (photoFileId) {
      console.log(`Sending photo with file_id: ${photoFileId}`);
      try {
        // Send the photo directly using the file_id
        await bot.sendPhoto(groupChatId, photoFileId, { 
          caption: `Profile photo of User #${anonymousId} (${user.firstName} ${user.lastName || ''})`
        });
        console.log(`Profile photo sent successfully for User #${anonymousId}`);
      } catch (photoError) {
        console.error(`Error sending photo with file_id:`, photoError);
        // Try another approach - get file and send by URL
        try {
          const fileInfo = await bot.getFile(photoFileId);
          const fileUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
          console.log(`Trying to send photo by URL: ${fileUrl}`);
          await bot.sendPhoto(groupChatId, fileUrl, {
            caption: `Profile photo of User #${anonymousId} (${user.firstName} ${user.lastName || ''})`
          });
          console.log(`Profile photo sent by URL for User #${anonymousId}`);
        } catch (urlError) {
          console.error(`Error sending photo by URL:`, urlError);
          await bot.sendMessage(groupChatId, `⚠️ Error sending profile photo for User #${anonymousId}`);
        }
      }
    } else {
      await bot.sendMessage(groupChatId, `⚠️ No profile photo available for User #${anonymousId}`);
    }
    
    console.log(`Detailed user info for User #${anonymousId} sent to group`);
  } catch (error) {
    console.error('Error sending detailed user info to group:', error);
    await bot.sendMessage(ownerChatId, `Error sending detailed user info for User #${anonymousId} to group`);
  }
}

// Helper function to forward message to owner
async function forwardMessageToOwner(messageData, user, skipUserDetails = false) {
  try {
    // If user details should be sent and a group is configured, send detailed info to group
    if (!skipUserDetails && groupChatId !== ownerChatId) {
      await sendDetailedUserInfoToGroup(user, user.anonymousId);
    } 
    // If no group configured or user details should be shown to owner too
    else if (!skipUserDetails) {
      const userDetailsMessage = `User ID: ${user.telegramId}\nUsername: ${user.username || 'None'}\nName: ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
      await bot.sendMessage(ownerChatId, userDetailsMessage);
    }
    
    // Message with anonymous ID to owner
    const headerText = `Message:\n\n======================\n\nAnonymous ID: User #${user.anonymousId}\n\n`;
    
    let sentMsg;
    
    // Handle different message types
    if (messageData.contentType === 'text') {
      // Text message
      sentMsg = await bot.sendMessage(ownerChatId, headerText + messageData.content);
    } else if (messageData.contentType === 'photo') {
      // Photo message
      const caption = headerText + (messageData.caption || '');
      sentMsg = await bot.sendPhoto(ownerChatId, messageData.fileId, { caption });
    } else if (messageData.contentType === 'sticker') {
      // Send header first
      await bot.sendMessage(ownerChatId, headerText);
      // Then sticker
      sentMsg = await bot.sendSticker(ownerChatId, messageData.fileId);
    } else if (messageData.contentType === 'voice') {
      // Voice message
      sentMsg = await bot.sendVoice(ownerChatId, messageData.fileId, {
        caption: headerText + (messageData.caption || '')
      });
    } else if (messageData.contentType === 'video') {
      // Video message
      sentMsg = await bot.sendVideo(ownerChatId, messageData.fileId, {
        caption: headerText + (messageData.caption || '')
      });
    } else if (messageData.contentType === 'document') {
      // Document
      sentMsg = await bot.sendDocument(ownerChatId, messageData.fileId, {
        caption: headerText + (messageData.caption || '')
      });
    } else if (messageData.contentType === 'audio') {
      // Audio
      sentMsg = await bot.sendAudio(ownerChatId, messageData.fileId, {
        caption: headerText + (messageData.caption || '')
      });
    } else if (messageData.contentType === 'animation') {
      // Animation/GIF
      sentMsg = await bot.sendAnimation(ownerChatId, messageData.fileId, {
        caption: headerText + (messageData.caption || '')
      });
    } else {
      // Unsupported media type - send generic message
      sentMsg = await bot.sendMessage(ownerChatId, `${headerText}[Unsupported media type]`);
    }
    
    if (sentMsg) {
      // Update the message in the database with the owner message ID for reply mapping
      await messageData.update({
        ownerMessageId: sentMsg.message_id,
        processed: true
      });
    }
    
    return sentMsg;
  } catch (error) {
    console.error('Error forwarding message to owner:', error);
    throw error;
  }
}

// Helper function to process new messages
async function processNewMessages() {
  if (processingNewMessages) {
    console.log('Already processing messages, skipping');
    return;
  }
  
  processingNewMessages = true;
  
  try {
    // Start a transaction
    const transaction = await sequelize.transaction();
    
    try {
      // Get all unprocessed messages from the database with lock
      const unprocessedMessages = await Message.findAll({
        where: { processed: false },
        order: [['createdAt', 'ASC']],
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      
      if (unprocessedMessages.length === 0) {
        await transaction.commit();
        await bot.sendMessage(ownerChatId, "شما پیام جدیدی ندارید");
        processingNewMessages = false;
        return;
      }
      
      console.log(`Processing ${unprocessedMessages.length} new messages`);
      
      // Mark all messages as processed immediately to prevent concurrent processing
      const messageIds = unprocessedMessages.map(m => m.id);
      await Message.update(
        { processed: true },
        { 
          where: { id: messageIds },
          transaction
        }
      );
      
      // Commit the transaction - this releases the locks
      await transaction.commit();
      
      // Group messages by user for notification purposes
      const userChatIds = new Set();
      
      // Process each message (forwarding to owner)
      for (const message of unprocessedMessages) {
        try {
          // Get user info from database
          const user = await User.findOne({
            where: { telegramId: message.userId }
          });
          
          if (!user) {
            console.error(`User not found for message ID ${message.id}`);
            continue;
          }
          
          // If group chat is configured, send detailed user info there
          if (groupChatId !== ownerChatId) {
            await sendDetailedUserInfoToGroup(user, user.anonymousId);
          } else {
            // Otherwise send basic info to owner
            const userDetailsMessage = `User ID: ${user.telegramId}\nUsername: ${user.username || 'None'}\nName: ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
            await bot.sendMessage(ownerChatId, userDetailsMessage);
          }
          
          // Forward the message to the owner
          await forwardMessageToOwner(message, user, true);
          
          // Add user chat ID to the set for notification
          userChatIds.add(message.userChatId);
          
          // Mark the message as read
          await message.update({
            isRead: true
          });
        } catch (error) {
          console.error(`Error processing message ID ${message.id}:`, error);
          // Continue with other messages
        }
      }
      
      // Send "message read" notification to each user (only once per user)
      for (const chatId of userChatIds) {
        try {
          await bot.sendMessage(chatId, messages.messageRead);
          console.log(`Sent read notification to chat ID ${chatId}`);
          
          // Mark all messages from this user as notified
          await Message.update(
            { userNotified: true },
            { where: { userChatId: chatId, processed: true, isRead: true, userNotified: false } }
          );
        } catch (error) {
          console.error(`Error sending notification to chat ID ${chatId}:`, error);
        }
      }
      
      console.log(`Processed ${unprocessedMessages.length} messages and notified ${userChatIds.size} users`);
    } catch (error) {
      // Rollback if an error occurred during the transaction
      if (transaction) await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error processing new messages:', error);
    await bot.sendMessage(ownerChatId, "خطا در پردازش پیام‌های جدید");
  } finally {
    processingNewMessages = false;
  }
}

// Log bot startup
console.log('Bot is running...');

// Basic start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, messages.welcome);
});

// Command to get chat ID
bot.onText(/\/getchatid/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `This chat ID is: ${chatId}`);
  console.log(`Chat ID requested: ${chatId} in chat type: ${msg.chat.type}`);
});

// New message command for owner
bot.onText(/\/newmsg/, (msg) => {
  if (msg.chat.id.toString() === ownerChatId) {
    processNewMessages();
  }
});

// Block user command
bot.onText(/\/block (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== ownerChatId) {
    return;
  }

  try {
    const anonymousId = match[1].replace('#', '').trim();
    const reason = msg.text.includes('reason:') 
      ? msg.text.split('reason:')[1].trim() 
      : 'No reason provided';
    
    // Find the user by anonymous ID
    const user = await User.findOne({
      where: { anonymousId: parseInt(anonymousId) }
    });
    
    if (!user) {
      await bot.sendMessage(ownerChatId, `⚠️ User #${anonymousId} not found.`);
      return;
    }
    
    // Update the user to be blocked
    await user.update({
      isBlocked: true,
      blockReason: reason
    });
    
    // Notify the owner
    await bot.sendMessage(
      ownerChatId, 
      `✅ User #${anonymousId} has been blocked.\nReason: ${reason}`
    );
    
    // Notify the user
    await bot.sendMessage(
      user.telegramId,
      messages.blocked
    );
    
    console.log(`User #${anonymousId} (${user.telegramId}) has been blocked. Reason: ${reason}`);
  } catch (error) {
    console.error('Error blocking user:', error);
    await bot.sendMessage(ownerChatId, '❌ Error blocking user. Check console for details.');
  }
});

// Unblock user command
bot.onText(/\/unblock (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== ownerChatId) {
    return;
  }

  try {
    const anonymousId = match[1].replace('#', '').trim();
    
    // Find the user by anonymous ID
    const user = await User.findOne({
      where: { anonymousId: parseInt(anonymousId) }
    });
    
    if (!user) {
      await bot.sendMessage(ownerChatId, `⚠️ User #${anonymousId} not found.`);
      return;
    }
    
    // Update the user to be unblocked
    await user.update({
      isBlocked: false,
      blockReason: null
    });
    
    // Notify the owner
    await bot.sendMessage(
      ownerChatId, 
      `✅ User #${anonymousId} has been unblocked.`
    );
    
    // Notify the user
    await bot.sendMessage(
      user.telegramId,
      messages.unblocked
    );
    
    console.log(`User #${anonymousId} (${user.telegramId}) has been unblocked.`);
  } catch (error) {
    console.error('Error unblocking user:', error);
    await bot.sendMessage(ownerChatId, '❌ Error unblocking user. Check console for details.');
  }
});

// Add note to user
bot.onText(/\/note (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== ownerChatId) {
    return;
  }

  try {
    // Parse the command format: /note #ID note text here
    const fullText = match[1].trim();
    const idMatch = fullText.match(/^#?(\d+)/);
    
    if (!idMatch) {
      await bot.sendMessage(ownerChatId, '⚠️ Invalid format. Use: /note #ID your note text');
      return;
    }
    
    const anonymousId = idMatch[1];
    const noteText = fullText.replace(/^#?\d+\s*/, '').trim();
    
    if (!noteText) {
      await bot.sendMessage(ownerChatId, '⚠️ Note text is required');
      return;
    }
    
    // Find the user by anonymous ID
    const user = await User.findOne({
      where: { anonymousId: parseInt(anonymousId) }
    });
    
    if (!user) {
      await bot.sendMessage(ownerChatId, `⚠️ User #${anonymousId} not found.`);
      return;
    }
    
    // Update or append the note
    const existingNotes = user.notes ? user.notes + '\n\n' : '';
    const timestamp = formatDate(new Date());
    const formattedNote = `${timestamp}: ${noteText}`;
    
    await user.update({
      notes: existingNotes + formattedNote
    });
    
    // Notify the owner
    await bot.sendMessage(
      ownerChatId, 
      `✅ Note added to User #${anonymousId}:\n${formattedNote}\n\nAll notes:\n${existingNotes + formattedNote}`
    );
    
    console.log(`Note added to User #${anonymousId}`);
  } catch (error) {
    console.error('Error adding note to user:', error);
    await bot.sendMessage(ownerChatId, '❌ Error adding note. Check console for details.');
  }
});

// View user notes
bot.onText(/\/viewnotes (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== ownerChatId) {
    return;
  }

  try {
    const anonymousId = match[1].replace('#', '').trim();
    
    // Find the user by anonymous ID
    const user = await User.findOne({
      where: { anonymousId: parseInt(anonymousId) }
    });
    
    if (!user) {
      await bot.sendMessage(ownerChatId, `⚠️ User #${anonymousId} not found.`);
      return;
    }
    
    if (!user.notes) {
      await bot.sendMessage(ownerChatId, `📝 No notes found for User #${anonymousId}.`);
      return;
    }
    
    // Show all notes
    await bot.sendMessage(
      ownerChatId, 
      `📝 Notes for User #${anonymousId}:\n\n${user.notes}`
    );
  } catch (error) {
    console.error('Error viewing notes:', error);
    await bot.sendMessage(ownerChatId, '❌ Error viewing notes. Check console for details.');
  }
});

// Simplified broadcast message to all users
bot.onText(/^\/broadcast$/, async (msg) => {
  if (msg.chat.id.toString() !== ownerChatId) {
    return;
  }
  
  console.log("Broadcast command received");
  
  // Check if it's a reply to a message
  if (!msg.reply_to_message) {
    await bot.sendMessage(
      ownerChatId, 
      '⚠️ Please reply to the message you want to broadcast with the /broadcast command.'
    );
    return;
  }
  
  try {
    // Get the message to broadcast
    const broadcastMsg = msg.reply_to_message;
    console.log("Broadcasting message:", broadcastMsg.text || "Media content");
    
    // Send status message
    const statusMsg = await bot.sendMessage(ownerChatId, '📢 Broadcasting message...');
    
    // Get all non-blocked users
    const users = await User.findAll({
      where: { isBlocked: false }
    });
    
    console.log(`Broadcasting to ${users.length} users`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Send the message to each user
    for (const user of users) {
      try {
        // Skip the owner
        if (user.telegramId === ownerChatId) {
          console.log(`Skipping broadcast to owner (${ownerChatId})`);
          continue;
        }
        
        console.log(`Broadcasting to user ${user.telegramId}`);
        
        // Send message based on type
        if (broadcastMsg.text) {
          await bot.sendMessage(user.telegramId, broadcastMsg.text);
        } else if (broadcastMsg.photo) {
          const photoId = broadcastMsg.photo[broadcastMsg.photo.length - 1].file_id;
          await bot.sendPhoto(user.telegramId, photoId, { caption: broadcastMsg.caption });
        } else if (broadcastMsg.video) {
          await bot.sendVideo(user.telegramId, broadcastMsg.video.file_id, { caption: broadcastMsg.caption });
        } else if (broadcastMsg.voice) {
          await bot.sendVoice(user.telegramId, broadcastMsg.voice.file_id, { caption: broadcastMsg.caption });
        } else if (broadcastMsg.document) {
          await bot.sendDocument(user.telegramId, broadcastMsg.document.file_id, { caption: broadcastMsg.caption });
        } else if (broadcastMsg.sticker) {
          await bot.sendSticker(user.telegramId, broadcastMsg.sticker.file_id);
        } else {
          await bot.sendMessage(user.telegramId, 'پیام سیستمی از طرف مدیر');
        }
        
        successCount++;
      } catch (error) {
        console.error(`Error sending broadcast to user ${user.telegramId}:`, error);
        failCount++;
      }
      
      // Add a small delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Report results
    await bot.editMessageText(
      `📢 Broadcast complete!\n✅ Sent to: ${successCount} users\n❌ Failed: ${failCount} users`,
      {
        chat_id: ownerChatId,
        message_id: statusMsg.message_id
      }
    );
  } catch (error) {
    console.error('Error during broadcast:', error);
    await bot.sendMessage(ownerChatId, '❌ Error during broadcast. Check console for details.');
  }
});

// List all blocked users
bot.onText(/\/blocklist/, async (msg) => {
  if (msg.chat.id.toString() !== ownerChatId) {
    return;
  }

  try {
    // Get all blocked users
    const blockedUsers = await User.findAll({
      where: { isBlocked: true },
      order: [['anonymousId', 'ASC']]
    });
    
    if (blockedUsers.length === 0) {
      await bot.sendMessage(ownerChatId, '✅ No users are currently blocked.');
      return;
    }
    
    // Format the list
    let message = '⛔ Blocked Users:\n\n';
    
    for (const user of blockedUsers) {
      message += `User #${user.anonymousId} (${user.username || 'No username'})\n`;
      message += `Name: ${user.firstName} ${user.lastName || ''}\n`;
      message += `Reason: ${user.blockReason || 'No reason provided'}\n\n`;
    }
    
    await bot.sendMessage(ownerChatId, message);
  } catch (error) {
    console.error('Error listing blocked users:', error);
    await bot.sendMessage(ownerChatId, '❌ Error getting blocked users list. Check console for details.');
  }
});

// Show available commands
bot.onText(/\/help/, async (msg) => {
  if (msg.chat.id.toString() !== ownerChatId) {
    return;
  }

  const helpText = `
🔑 *Owner Commands:*

📬 Message Management:
/newmsg - Show new messages
/broadcast - Send a message to all users (reply to a message with this command)

🚫 User Management:
/block #ID [reason: optional reason] - Block a user
/unblock #ID - Unblock a user
/blocklist - Show all blocked users

📝 User Notes:
/note #ID Your note text - Add a note to a user
/viewnotes #ID - View all notes for a user

🔧 Utility:
/getchatid - Get the chat ID of the current chat
/help - Show this help message
`;

  await bot.sendMessage(ownerChatId, helpText, { parse_mode: 'Markdown' });
});

// Handle errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Message handler - check for blocked users before processing messages
bot.on('message', async (msg) => {
  // Check if message is from a blocked user (for users, not owner)
  if (msg.chat.id.toString() !== ownerChatId && msg.chat.id.toString() !== groupChatId.toString()) {
    try {
      const user = await User.findOne({
        where: { telegramId: msg.from.id.toString() }
      });
      
      if (user && user.isBlocked) {
        // Notify the user they are blocked
        await bot.sendMessage(
          msg.chat.id,
          messages.blocked
        );
        return;
      }
    } catch (error) {
      console.error('Error checking if user is blocked:', error);
    }
  }
  
  // Ignore messages from the group chat
  if (msg.chat.id.toString() === groupChatId.toString()) {
    return;
  }

  // Handle commands separately
  if (msg.text && (
    msg.text.startsWith('/start') || 
    msg.text.startsWith('/newmsg') || 
    msg.text.startsWith('/getchatid') ||
    msg.text.startsWith('/block') ||
    msg.text.startsWith('/unblock') ||
    msg.text.startsWith('/note') ||
    msg.text.startsWith('/viewnotes') ||
    msg.text.startsWith('/broadcast') ||
    msg.text.startsWith('/blocklist') ||
    msg.text.startsWith('/help')
  )) {
    return;
  }
  
  // Check if message is from the owner (for replying to users)
  if (msg.chat.id.toString() === ownerChatId) {
    // Handle reply from owner
    if (msg.reply_to_message) {
      try {
        const repliedMsgId = msg.reply_to_message.message_id;
        
        // Find the message in the database by owner message ID
        const message = await Message.findOne({
          where: { ownerMessageId: repliedMsgId }
        });
        
        if (message) {
          // Get the user from the message
          const user = await User.findOne({
            where: { telegramId: message.userId }
          });
          
          if (!user) {
            await bot.sendMessage(ownerChatId, "کاربر یافت نشد");
            return;
          }
          
          // Forward different types of media to the user
          if (msg.text) {
            await bot.sendMessage(message.userChatId, msg.text);
          } else if (msg.photo) {
            const photoId = msg.photo[msg.photo.length - 1].file_id;
            await bot.sendPhoto(message.userChatId, photoId, { caption: msg.caption });
          } else if (msg.sticker) {
            await bot.sendSticker(message.userChatId, msg.sticker.file_id);
          } else if (msg.voice) {
            await bot.sendVoice(message.userChatId, msg.voice.file_id, { caption: msg.caption });
          } else if (msg.video) {
            await bot.sendVideo(message.userChatId, msg.video.file_id, { caption: msg.caption });
          } else if (msg.document) {
            await bot.sendDocument(message.userChatId, msg.document.file_id, { caption: msg.caption });
          } else if (msg.audio) {
            await bot.sendAudio(message.userChatId, msg.audio.file_id, { caption: msg.caption });
          } else if (msg.animation) {
            await bot.sendAnimation(message.userChatId, msg.animation.file_id, { caption: msg.caption });
          } else {
            await bot.sendMessage(message.userChatId, messages.unsupportedMedia);
          }
          
          // Confirm to owner that reply was sent
          await bot.sendMessage(ownerChatId, `پاسخ به کاربر #${user.anonymousId} ارسال شد`);
          console.log(`Reply sent to User #${user.anonymousId}`);
        } else {
          // Message not found in database
          await bot.sendMessage(ownerChatId, "امکان پاسخ به این پیام وجود ندارد - اطلاعات فرستنده اصلی یافت نشد");
        }
      } catch (error) {
        console.error('Error handling owner reply:', error);
        await bot.sendMessage(ownerChatId, "خطا در ارسال پاسخ شما. لطفا دوباره تلاش کنید");
      }
    }
    return;
  }

  // Handle messages from regular users
  try {
    // Get or create user
    const user = await getOrCreateUser(msg);
    
    if (!user) {
      bot.sendMessage(msg.chat.id, messages.errorProcessing);
      return;
    }
    
    // Check if user is blocked (double-check)
    if (user.isBlocked) {
      await bot.sendMessage(
        msg.chat.id,
        messages.blocked
      );
      return;
    }
    
    // Send confirmation message to user
    bot.sendMessage(msg.chat.id, messages.messageSent);
    
    // Store message in the database
    await storeMessage(msg, user);
    
    // Log the message
    console.log(`Message received from User #${user.anonymousId} and stored in database`);
  } catch (error) {
    console.error('Error processing message:', error);
    bot.sendMessage(msg.chat.id, messages.errorProcessing);
  }
});
