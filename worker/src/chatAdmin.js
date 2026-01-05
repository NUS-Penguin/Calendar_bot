/**
 * Chat admin permission checker
 * Determines if a user can link Google Calendar in a given chat
 */

/**
 * Check if user can link Google account in this chat
 * - Private chats: Always true
 * - Groups/supergroups: Must be Telegram admin or ADMIN_USER_ID
 * 
 * @param {Object} env - Worker environment with TELEGRAM_BOT_TOKEN and ADMIN_USER_ID
 * @param {number} chatId - Telegram chat ID
 * @param {number} userId - Telegram user ID
 * @param {string} chatType - 'private', 'group', 'supergroup', 'channel'
 * @returns {Object} - { allowed: boolean, reason: string }
 */
export async function canLinkCalendar(env, chatId, userId, chatType) {
  // Admin override: bot owner can always link
  if (userId.toString() === env.ADMIN_USER_ID) {
    return { allowed: true, reason: 'bot_admin' };
  }
  
  // Private chats: always allow
  if (chatType === 'private') {
    return { allowed: true, reason: 'private_chat' };
  }
  
  // Groups/supergroups: Check if user is Telegram admin
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getChatMember`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          user_id: userId
        })
      }
    );
    
    if (!response.ok) {
      console.error('getChatMember failed:', await response.text());
      return { allowed: false, reason: 'api_error' };
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      console.error('getChatMember error:', data.description);
      return { allowed: false, reason: 'api_error' };
    }
    
    const status = data.result?.status;
    
    // Allow if user is admin or creator
    if (status === 'administrator' || status === 'creator') {
      return { allowed: true, reason: 'telegram_admin' };
    }
    
    return { allowed: false, reason: 'not_admin' };
    
  } catch (error) {
    console.error('Admin check failed:', error);
    return { allowed: false, reason: 'error' };
  }
}
