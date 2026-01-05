/**
 * Authorization module - Chat whitelist management
 */

/**
 * Check if a chat is authorized to use the bot
 */
export async function isAuthorized(env, chatId) {
  // Admin user ID (you) - always authorized
  const ADMIN_USER_ID = parseInt(env.ADMIN_USER_ID || '0');
  
  // For DMs with admin, always allow
  if (chatId === ADMIN_USER_ID) {
    return true;
  }
  
  // Check if chat is in whitelist
  const whitelistKey = `whitelist:${chatId}`;
  const isWhitelisted = await env.EVENTS.get(whitelistKey);
  
  return isWhitelisted === 'true';
}

/**
 * Add a chat to whitelist
 */
export async function approveChat(env, chatId, approvedBy) {
  const whitelistKey = `whitelist:${chatId}`;
  const metadata = {
    approvedBy,
    approvedAt: new Date().toISOString(),
  };
  
  await env.EVENTS.put(whitelistKey, 'true', {
    metadata: JSON.stringify(metadata)
  });
}

/**
 * Remove a chat from whitelist
 */
export async function revokeChat(env, chatId) {
  const whitelistKey = `whitelist:${chatId}`;
  await env.EVENTS.delete(whitelistKey);
}

/**
 * Check if user is admin
 */
export function isAdmin(env, userId) {
  const ADMIN_USER_ID = parseInt(env.ADMIN_USER_ID || '0');
  return userId === ADMIN_USER_ID;
}

/**
 * List all whitelisted chats
 */
export async function listWhitelistedChats(env) {
  const list = await env.EVENTS.list({ prefix: 'whitelist:' });
  
  return list.keys.map(key => {
    const chatId = key.name.replace('whitelist:', '');
    const metadata = key.metadata ? JSON.parse(key.metadata) : {};
    return {
      chatId,
      ...metadata
    };
  });
}
