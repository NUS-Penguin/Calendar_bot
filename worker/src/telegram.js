/**
 * Telegram bot command handlers
 */

import { parseEventText, parseEventAlteration } from './groq.js';
import { createEvent, updateEvent, deleteEvent } from './gas.js';
import { createEventOAuth, updateEventOAuth, deleteEventOAuth } from './calendar.js';
import { getSelectedEvent, setSelectedEvent, clearSelectedEvent, getChatTokens, deleteChatTokens } from './persistence.js';
import { validateAndNormalize } from './validators.js';
import { isAuthorized, approveChat, revokeChat, isAdmin, listWhitelistedChats } from './auth.js';
import { canLinkCalendar } from './chatAdmin.js';
import { mergeEventPatch, generateChangeSummary, validatePatch } from './eventMerge.js';

export async function handleTelegramUpdate(update, env) {
  // Handle new chat members (bot added to group)
  if (update.my_chat_member) {
    await handleMyChatMember(update, env);
    return;
  }
  
  if (!update.message || !update.message.text) return;
  
  const chatId = update.message.chat.id;
  const messageId = update.message.message_id;
  const text = update.message.text;
  const userId = update.message.from.id;
  
  console.log(`Received message from chat ${chatId}: ${text}`);
  
  // Admin commands (work in any chat for admin)
  if (isAdmin(env, userId)) {
    if (text.match(/^\/approve$/i)) {
      await handleApproveCommand(update, env);
      return;
    } else if (text.match(/^\/revoke$/i)) {
      await handleRevokeCommand(update, env);
      return;
    } else if (text.match(/^\/listchats$/i)) {
      await handleListChatsCommand(update, env);
      return;
    }
  }
  
  // Check authorization for all other commands
  const authorized = await isAuthorized(env, chatId);
  if (!authorized) {
    await sendMessage(env, chatId, '🔒 **Not Authorized**\n\nThis bot is private. Ask the admin to approve this chat with `/approve`.');
    return;
  }
  
  // Command detection
  if (text.match(/#aut\b/i)) {
    await handleAutCommand(update, env);
  } else if (text.match(/#cal\b/i)) {
    await handleCalCommand(update, env);
  } else if (text.match(/#alt\b/i)) {
    await handleAltCommand(update, env);
  } else if (text.match(/#del\b/i)) {
    await handleDelCommand(update, env);
  } else if (text.match(/#dis\b/i)) {
    await handleDisCommand(update, env);
  }
}

async function handleAutCommand(update, env) {
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;
  const text = update.message.text;
  const chatType = update.message.chat.type;  // 'private', 'group', 'supergroup', 'channel'
  
  // Check if user wants to unlink (legacy - use #dis instead)
  if (text.match(/#aut\s+unlink/i)) {
    await sendMessage(env, chatId,
      '💡 **Use #dis to disconnect accounts**\n\n' +
      'The `#aut unlink` command is deprecated.\n' +
      'Use `#dis` to manage connected accounts:\n\n' +
      '• `#dis` - List all connected accounts\n' +
      '• `#dis user@gmail.com` - Disconnect specific account'
    );
    return;
  }
  
  // Check permission to link
  const permission = await canLinkCalendar(env, chatId, userId, chatType);
  if (!permission.allowed) {
    if (permission.reason === 'not_admin') {
      await sendMessage(env, chatId,
        '🔒 **Admin Only**\n\n' +
        'Only group administrators can link Google Calendar accounts to this group.\n\n' +
        'If you need access, ask a group admin to run `#aut`.'
      );
    } else {
      await sendMessage(env, chatId, '❌ Permission check failed. Please try again.');
    }
    return;
  }
  
  // Check existing connections
  const { getWorkspaceConnections } = await import('./persistence.js');
  const connections = await getWorkspaceConnections(env, chatId);
  
  if (connections.length > 0) {
    let message = `📋 **Google Accounts Already Connected** (${connections.length})\n\n`;
    for (const conn of connections) {
      message += `• **${conn.google_email}**\n`;
      message += `  Connected: ${new Date(conn.created_at).toLocaleDateString()}\n\n`;
    }
    message += `\n**To add another account:**\n`;
    message += `Just run \`#aut\` again!\n\n`;
    message += `**To remove an account:**\n`;
    message += `\`#dis user@gmail.com\``;
    
    await sendMessage(env, chatId, message);
    
    // Still allow linking more accounts - don't return here
  }
  
  // Generate OAuth URL
  const workerUrl = env.WORKER_URL || 'https://c4lendar-worker.calendar-bot.workers.dev';
  const authUrl = `${workerUrl}/oauth/start?chatId=${chatId}&userId=${userId}&chatType=${chatType}`;
  
  await sendMessage(env, chatId,
    `🔗 **Link Google Calendar**\n\n` +
    `Click the link below to authorize:\n${authUrl}\n\n` +
    `⏱️ This link expires in 10 minutes.\n` +
    `📱 Complete authorization on a device where you're logged into Google.\n\n` +
    `💡 **Multi-Account Support:**\n` +
    `You can connect multiple Google accounts to this workspace.\n` +
    `All events will be created/updated/deleted in ALL connected accounts.`
  );
}

async function handleMyChatMember(update, env) {
  const chatId = update.my_chat_member.chat.id;
  const newStatus = update.my_chat_member.new_chat_member.status;
  const userId = update.my_chat_member.from.id;
  
  // Bot was added to a group
  if (newStatus === 'member' || newStatus === 'administrator') {
    console.log(`Bot added to chat ${chatId} by user ${userId}`);
    
    // If added by admin, auto-approve
    if (isAdmin(env, userId)) {
      await approveChat(env, chatId, userId);
      await sendMessage(env, chatId, '✅ **Chat Approved**\n\nYou can now use the bot in this chat!\n\n**Commands:**\n• Reply to message with `#cal` - Create event\n• `#alt [changes]` - Modify last event\n• `#del` - Delete last event');
    } else {
      await sendMessage(env, chatId, '👋 **Hello!**\n\nThis bot is private and requires authorization.\n\nAsk the admin to approve this chat by running `/approve` here.');
    }
  }
}

async function handleApproveCommand(update, env) {
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;
  
  // Approve this chat
  await approveChat(env, chatId, userId);
  
  await sendMessage(env, chatId, `✅ **Chat Approved**\n\nChat ID: \`${chatId}\`\n\nThis chat can now use the bot.`);
}

async function handleRevokeCommand(update, env) {
  const chatId = update.message.chat.id;
  
  // Revoke this chat
  await revokeChat(env, chatId);
  
  await sendMessage(env, chatId, `❌ **Chat Revoked**\n\nThis chat can no longer use the bot.`);
}

async function handleListChatsCommand(update, env) {
  const chatId = update.message.chat.id;
  
  const chats = await listWhitelistedChats(env);
  
  if (chats.length === 0) {
    await sendMessage(env, chatId, '📋 **Whitelisted Chats**\n\nNo chats approved yet.');
    return;
  }
  
  let message = '📋 **Whitelisted Chats**\n\n';
  for (const chat of chats) {
    message += `• Chat ID: \`${chat.chatId}\`\n`;
    message += `  Approved: ${new Date(chat.approvedAt).toLocaleString()}\n`;
    message += `  By: ${chat.approvedBy}\n\n`;
  }
  
  await sendMessage(env, chatId, message);
}

async function handleCalCommand(update, env) {
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;
  const text = update.message.text;
  const replyToMessage = update.message.reply_to_message;
  
  // Check if OAuth is enabled
  const useOAuth = env.USE_OAUTH === 'true';
  
  if (!useOAuth) {
    await sendMessage(env, chatId, '❌ OAuth mode required for this feature. Please set USE_OAUTH=true');
    return;
  }
  
  // Check if workspace has any connections
  const { getWorkspaceConnections } = await import('./persistence.js');
  const connections = await getWorkspaceConnections(env, chatId);
  
  if (connections.length === 0) {
    await sendMessage(env, chatId, 
      '🔗 **No Google Accounts Connected**\n\n' +
      'This workspace hasn\'t been linked to any Google Calendar yet.\n' +
      'Run `#aut` to connect a Google account.\n\n' +
      '💡 You can connect multiple accounts - events will be created in all of them!'
    );
    return;
  }
  
  // Extract event text
  let eventText;
  if (replyToMessage && replyToMessage.text) {
    eventText = replyToMessage.text;
  } else {
    eventText = text.replace(/#cal\b/i, '').trim();
  }
  
  if (!eventText) {
    await sendMessage(env, chatId, '❌ Please provide event details after #cal or reply to a message.\n\n**Examples:**\n• #cal team meeting tomorrow 3pm\n• Reply to any message with: #cal');
    return;
  }
  
  try {
    console.log(`[BROADCAST] Parsing event text for ${connections.length} accounts: ${eventText}`);
    
    // Step 1: Get timezone from first calendar (for parsing context)
    let timezone = env.TIMEZONE || 'Asia/Singapore';
    const { getValidAccessTokenForConnection } = await import('./oauth.js');
    const firstToken = await getValidAccessTokenForConnection(env, connections[0]);
    
    if (firstToken) {
      const { getCalendarContext } = await import('./calendar.js');
      const calendarContext = await getCalendarContext(firstToken, 5);
      timezone = calendarContext.timezone;
      console.log(`Using timezone: ${timezone}`);
    }
    
    // Step 2: Build temporal context
    const { buildTemporalContext, formatTemporalContextForLLM } = await import('./temporalContext.js');
    const temporalContext = buildTemporalContext(timezone);
    const formattedContext = formatTemporalContextForLLM(temporalContext);
    
    // Step 3: Parse with LLM
    const parsed = await parseEventText(eventText, env, formattedContext);
    console.log('Parsed event:', JSON.stringify(parsed));
    
    // Step 4: Check for clarification needed
    if (parsed.clarificationNeeded) {
      await sendMessage(env, chatId, `🤔 **Need Clarification**\n\n${parsed.clarificationQuestion || 'Please provide more details about the event.'}`);
      return;
    }
    
    // Step 5: Validate confidence
    if (parsed.confidence === 'low') {
      await sendMessage(env, chatId, 
        `⚠️ **Low Confidence Parse**\n\n` +
        `I understood:\n` +
        `• Title: ${parsed.title}\n` +
        `• Date: ${parsed.startDate || parsed.start}\n\n` +
        `Is this correct? If not, please rephrase with clearer date/time information.`
      );
    }
    
    // Step 6: Validate and normalize
    const validation = validateAndNormalize(parsed, env);
    if (!validation.valid) {
      await sendMessage(env, chatId, `❌ ${validation.question}`);
      return;
    }
    
    const event = validation.event;
    
    // Step 7: Generate bot event UID
    const { generateEventUID } = await import('./eventUid.js');
    const botEventUid = generateEventUID();
    
    console.log(`[BROADCAST] Creating event ${botEventUid} across ${connections.length} accounts`);
    
    // Step 8: Broadcast create event
    const { broadcastCreateEvent } = await import('./calendar.js');
    const results = await broadcastCreateEvent(env, chatId, botEventUid, event);
    
    // Step 9: Store selected event for this user (with UID for future reference)
    await setSelectedEvent(env, chatId, userId, botEventUid, { ...event, bot_event_uid: botEventUid });
    
    // Step 10: Send confirmation with broadcast results
    let message = `✅ **Calendar Event Created!**\n\n`;
    message += `**${event.title}**\n`;
    
    if (event.allDay) {
      message += `📅 ${event.startDate} (All day)\n`;
    } else {
      const start = event.start.replace('+08:00', '').replace('T', ' ');
      const end = event.end.replace('+08:00', '').replace('T', ' ');
      message += `📅 ${start} → ${end.split(' ')[1]}\n`;
    }
    
    message += `📍 ${event.location || 'No location'}\n`;
    message += `🔖 Reference: \`${botEventUid}\`\n\n`;
    
    // Broadcast results
    message += `📤 **Broadcast Results:**\n`;
    message += `✅ Success: ${results.successes.length}/${results.totalAccounts}\n`;
    
    if (results.failures.length > 0) {
      message += `❌ Failed: ${results.failures.length}\n\n`;
      message += `**Failed Accounts:**\n`;
      for (const failure of results.failures) {
        message += `• ${failure.email}: ${failure.reason}\n`;
      }
    } else {
      message += `\n**Connected Accounts:**\n`;
      for (const success of results.successes) {
        message += `• ${success.email}\n`;
      }
    }
    
    await sendMessage(env, chatId, message);
    
    console.log(`[BROADCAST] Event ${botEventUid} created: ${results.successes.length}/${results.totalAccounts} succeeded`);
    
  } catch (error) {
    console.error('Cal command error:', error);
    await sendMessage(env, chatId, `❌ **Error:** ${error.message}\n\nPlease try again.`);
  }
}

async function handleAltCommand(update, env) {
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;
  const text = update.message.text;
  
  // Check if OAuth is enabled
  const useOAuth = env.USE_OAUTH === 'true';
  
  if (!useOAuth) {
    await sendMessage(env, chatId, '❌ OAuth mode required for this feature. Please set USE_OAUTH=true');
    return;
  }
  
  // Check if workspace has any connections
  const { getWorkspaceConnections } = await import('./persistence.js');
  const connections = await getWorkspaceConnections(env, chatId);
  
  if (connections.length === 0) {
    await sendMessage(env, chatId, 
      '🔗 **No Google Accounts Connected**\n\n' +
      'This workspace hasn\'t been linked to any Google Calendar yet.\n' +
      'Run `#aut` to connect a Google account.'
    );
    return;
  }
  
  // Extract alteration text
  const match = text.match(/#alt\s+(.+)/i);
  if (!match) {
    await sendMessage(env, chatId, 
      '❌ **Usage:** `#alt <changes>`\n\n' +
      '**Examples:**\n' +
      '• `#alt next fri` - Move to next Friday\n' +
      '• `#alt 3pm` - Change time to 3 PM\n' +
      '• `#alt project sync` - Rename event\n' +
      '• `#alt 12 jan 2-3pm` - Change date and time\n' +
      '• `#alt all day` - Convert to all-day event'
    );
    return;
  }
  
  const alterationText = match[1].trim();
  
  try {
    // Resolve event UID from user input or selected event
    const { resolveEventUID } = await import('./eventUid.js');
    const botEventUid = await resolveEventUID(env, chatId, userId, alterationText);
    
    if (!botEventUid) {
      await sendMessage(env, chatId, 
        '❌ **No Event Selected**\n\n' +
        'Use `#cal` to create an event first, then you can modify it with `#alt`.'
      );
      return;
    }
    
    // Get selected event for baseline
    const selected = await getSelectedEvent(env, chatId, userId);
    if (!selected) {
      await sendMessage(env, chatId, 
        '❌ **No Event Selected**\n\n' +
        'Use `#cal` to create an event first, then you can modify it with `#alt`.'
      );
      return;
    }
    
    console.log(`[BROADCAST] Parsing alteration for event ${botEventUid}:`, selected.event);
    console.log(`Alteration text: ${alterationText}`);
    
    // Parse alteration using PATCH semantics
    const patchResult = await parseEventAlteration(
      alterationText, 
      selected.event, 
      env, 
      null, 
      env.TIMEZONE
    );
    
    console.log('Patch result:', JSON.stringify(patchResult, null, 2));
    
    // Check if clarification is needed
    if (patchResult.needs_clarification || patchResult.confidence < 0.5) {
      const question = patchResult.clarification_question || 
        'I\'m not sure what you want to change. Please be more specific (e.g., "next fri", "3pm", "team meeting").';
      
      await sendMessage(env, chatId, `🤔 **Need Clarification**\n\n${question}`);
      return;
    }
    
    // Validate patch has changes
    const validation = validatePatch(patchResult.patch);
    if (!validation.valid) {
      await sendMessage(env, chatId, `❌ ${validation.error}\n\n**Examples:**\n• \`#alt next fri\` - Move date\n• \`#alt 3pm\` - Change time\n• \`#alt project meeting\` - Rename`);
      return;
    }
    
    // Merge patch with existing event
    const mergedEvent = mergeEventPatch(selected.event, patchResult.patch, env.TIMEZONE);
    console.log('Merged event:', JSON.stringify(mergedEvent, null, 2));
    
    // Validate merged event
    const eventValidation = validateAndNormalize(mergedEvent, env);
    if (!eventValidation.valid) {
      await sendMessage(env, chatId, `❌ ${eventValidation.question}`);
      return;
    }
    
    const finalEvent = eventValidation.event;
    
    console.log(`[BROADCAST] Updating event ${botEventUid} across ${connections.length} accounts`);
    
    // Broadcast update event
    const { broadcastUpdateEvent } = await import('./calendar.js');
    const results = await broadcastUpdateEvent(env, chatId, botEventUid, finalEvent);
    
    // Update stored event
    await setSelectedEvent(env, chatId, userId, botEventUid, { ...finalEvent, bot_event_uid: botEventUid });
    
    // Generate change summary
    const changeSummary = generateChangeSummary(selected.event, finalEvent);
    
    // Send confirmation with broadcast results
    let message = `✅ **Event Updated!**\n\n`;
    message += `**${finalEvent.title}**\n`;
    
    if (finalEvent.allDay) {
      message += `📅 ${finalEvent.startDate} (All day)\n`;
    } else {
      const start = finalEvent.start.replace('+08:00', '').replace('T', ' ');
      const end = finalEvent.end.replace('+08:00', '').replace('T', ' ');
      message += `📅 ${start} → ${end.split(' ')[1]}\n`;
    }
    
    message += `📍 ${finalEvent.location || 'No location'}\n`;
    message += `🔖 Reference: \`${botEventUid}\`\n\n`;
    
    if (changeSummary && changeSummary !== 'No changes detected') {
      message += `**Changes:** ${changeSummary}\n\n`;
    }
    
    message += `📤 **Broadcast Results:**\n`;
    message += `✅ Success: ${results.successes.length}/${results.totalAccounts}\n`;
    
    if (results.failures.length > 0) {
      message += `❌ Failed: ${results.failures.length}\n\n`;
      message += `**Failed Accounts:**\n`;
      for (const failure of results.failures) {
        message += `• ${failure.email}: ${failure.reason}\n`;
      }
    } else {
      message += `\n**Updated In:**\n`;
      for (const success of results.successes) {
        message += `• ${success.email}\n`;
      }
    }
    
    await sendMessage(env, chatId, message);
    
    console.log(`[BROADCAST] Event ${botEventUid} updated: ${results.successes.length}/${results.totalAccounts} succeeded`);
    
  } catch (error) {
    console.error('Alt command error:', error);
    await sendMessage(env, chatId, 
      `❌ **Error:** ${error.message}\n\n` +
      `Please try again with clearer details.`
    );
  }
}

async function handleDelCommand(update, env) {
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;
  const text = update.message.text;
  
  // Check if OAuth is enabled
  const useOAuth = env.USE_OAUTH === 'true';
  
  if (!useOAuth) {
    await sendMessage(env, chatId, '❌ OAuth mode required for this feature. Please set USE_OAUTH=true');
    return;
  }
  
  // Check if workspace has any connections
  const { getWorkspaceConnections } = await import('./persistence.js');
  const connections = await getWorkspaceConnections(env, chatId);
  
  if (connections.length === 0) {
    await sendMessage(env, chatId, 
      '🔗 **No Google Accounts Connected**\n\n' +
      'This workspace hasn\'t been linked to any Google Calendar yet.\n' +
      'Run `#aut` to connect a Google account.'
    );
    return;
  }
  
  try {
    // Resolve event UID from user input or selected event
    const { resolveEventUID } = await import('./eventUid.js');
    const botEventUid = await resolveEventUID(env, chatId, userId, text);
    
    if (!botEventUid) {
      await sendMessage(env, chatId, 
        '❌ **No Event Selected**\n\n' +
        'Use `#cal` to create an event first, then you can delete it with `#del`.\n\n' +
        'Or specify the event reference: `#del EVT-xxxxxxxx`'
      );
      return;
    }
    
    console.log(`[BROADCAST] Deleting event ${botEventUid} from ${connections.length} accounts`);
    
    // Get selected event for title (for confirmation message)
    const selected = await getSelectedEvent(env, chatId, userId);
    const eventTitle = selected?.event?.title || 'Event';
    
    // Broadcast delete event
    const { broadcastDeleteEvent } = await import('./calendar.js');
    const results = await broadcastDeleteEvent(env, chatId, botEventUid);
    
    // Clear selected event for this user
    await clearSelectedEvent(env, chatId, userId);
    
    // Send confirmation with broadcast results
    let message = `✅ **Event Deleted!**\n\n`;
    message += `**${eventTitle}** has been removed from connected calendars.\n`;
    message += `🔖 Reference: \`${botEventUid}\`\n\n`;
    
    message += `📤 **Broadcast Results:**\n`;
    message += `✅ Success: ${results.successes.length}/${results.totalAccounts}\n`;
    
    if (results.failures.length > 0) {
      message += `❌ Failed: ${results.failures.length}\n\n`;
      message += `**Failed Accounts:**\n`;
      for (const failure of results.failures) {
        message += `• ${failure.email}: ${failure.reason}\n`;
      }
    } else {
      message += `\n**Deleted From:**\n`;
      for (const success of results.successes) {
        message += `• ${success.email}${success.note ? ` (${success.note})` : ''}\n`;
      }
    }
    
    await sendMessage(env, chatId, message);
    
    console.log(`[BROADCAST] Event ${botEventUid} deleted: ${results.successes.length}/${results.totalAccounts} succeeded`);
    
  } catch (error) {
    console.error('Del command error:', error);
    await sendMessage(env, chatId, `❌ **Error:** ${error.message}`);
  }
}

async function handleDisCommand(update, env) {
  const chatId = update.message.chat.id;
  const userId = update.message.from.id;
  const text = update.message.text;
  const chatType = update.message.chat.type;
  
  // Check permission for disconnect (same as #aut - admin only for groups)
  const { canLinkCalendar } = await import('./chatAdmin.js');
  const permission = await canLinkCalendar(env, chatId, userId, chatType);
  
  if (!permission.allowed) {
    if (permission.reason === 'not_admin') {
      await sendMessage(env, chatId,
        '🔒 **Admin Only**\n\n' +
        'Only group administrators can disconnect Google accounts from this workspace.'
      );
    } else {
      await sendMessage(env, chatId, '❌ Permission check failed. Please try again.');
    }
    return;
  }
  
  // Extract email from command
  const match = text.match(/#dis\s+(.+)/i);
  const emailArg = match ? match[1].trim() : null;
  
  try {
    const { getWorkspaceConnections, findConnectionByEmail, revokeGoogleConnection, deleteEventMappingsForAccount } = await import('./persistence.js');
    const connections = await getWorkspaceConnections(env, chatId);
    
    // If no email provided, list all connections
    if (!emailArg) {
      if (connections.length === 0) {
        await sendMessage(env, chatId, 
          '📋 **No Google Accounts Connected**\n\n' +
          'This workspace has no connected Google accounts.\n' +
          'Use `#aut` to connect a Google account.'
        );
        return;
      }
      
      let message = `📋 **Connected Google Accounts** (${connections.length})\n\n`;
      for (const conn of connections) {
        message += `• **${conn.google_email}**\n`;
        message += `  Connected: ${new Date(conn.created_at).toLocaleDateString()}\n`;
        message += `  By: User ${conn.connected_by_telegram_user_id}\n\n`;
      }
      message += `\n**To disconnect an account:**\n\`#dis user@gmail.com\``;
      
      await sendMessage(env, chatId, message);
      return;
    }
    
    // Find connection by email
    const connection = await findConnectionByEmail(env, chatId, emailArg);
    
    if (!connection) {
      await sendMessage(env, chatId, 
        `❌ **Account Not Found**\n\n` +
        `No connection found for **${emailArg}** in this workspace.\n\n` +
        `Use \`#dis\` (without email) to see connected accounts.`
      );
      return;
    }
    
    // Disconnect the account
    await revokeGoogleConnection(env, chatId, connection.google_sub);
    
    // Clean up event mappings for this account
    await deleteEventMappingsForAccount(env, chatId, connection.google_sub);
    
    await sendMessage(env, chatId, 
      `✅ **Account Disconnected**\n\n` +
      `**${connection.google_email}** has been disconnected from this workspace.\n\n` +
      `• Event mappings cleaned up\n` +
      `• Access revoked\n\n` +
      `The account owner can reconnect anytime with \`#aut\`.`
    );
    
    console.log(`[DISCONNECT] ${connection.google_email} disconnected from chat ${chatId} by user ${userId}`);
    
  } catch (error) {
    console.error('Dis command error:', error);
    await sendMessage(env, chatId, `❌ **Error:** ${error.message}`);
  }
}

export async function sendMessage(env, chatId, text) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Telegram API error:', error);
    }
  } catch (error) {
    console.error('Failed to send message:', error);
  }
}

function formatEventConfirmation(action, event, changeSummary = null) {
  let message = `✅ Calendar event ${action}!\n\n**${event.title}**\n`;
  
  if (event.allDay) {
    message += `📅 ${event.startDate} (All day)\n`;
  } else {
    // Format times nicely
    const start = event.start.replace('+08:00', '').replace('T', ' ');
    const end = event.end.replace('+08:00', '').replace('T', ' ');
    message += `📅 ${start} → ${end.split(' ')[1]}\n`;
  }
  
  message += `📍 ${event.location || 'No location'}\n`;
  
  // Add change summary for updates
  if (action === 'updated' && changeSummary && changeSummary !== 'No changes detected') {
    message += `\n**Changes:** ${changeSummary}\n`;
  }
  
  message += '\nCheck your Google Calendar!';
  
  return message;
}
