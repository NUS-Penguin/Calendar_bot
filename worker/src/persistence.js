/**
 * Cloudflare KV persistence layer
 * Stores:
 * - Google account connections per workspace (chat_id + google_sub)
 * - Event mappings (bot_event_uid -> google_event_id per account)
 * - Selected events for #alt and #del commands
 */

// ============================================================================
// ENCRYPTION UTILITIES
// ============================================================================

/**
 * Encrypt refresh token using AES-GCM
 */
async function encryptToken(token, env) {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  
  // Use ENCRYPTION_KEY from env
  const keyMaterial = encoder.encode(env.ENCRYPTION_KEY || 'default-key-change-in-production');
  
  // Import key
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial.slice(0, 32), // 256-bit key
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Generate IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine IV + ciphertext
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  
  // Return base64
  return btoa(String.fromCharCode(...result));
}

/**
 * Decrypt refresh token using AES-GCM
 */
async function decryptToken(encryptedBase64, env) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Decode base64
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  
  // Extract IV and ciphertext
  const iv = encrypted.slice(0, 12);
  const ciphertext = encrypted.slice(12);
  
  // Use ENCRYPTION_KEY from env
  const keyMaterial = encoder.encode(env.ENCRYPTION_KEY || 'default-key-change-in-production');
  
  // Import key
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial.slice(0, 32),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return decoder.decode(decrypted);
}

// ============================================================================
// GOOGLE CONNECTIONS (MULTI-ACCOUNT PER WORKSPACE)
// ============================================================================

/**
 * Store a Google account connection for a workspace
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID (workspace)
 * @param {string} googleSub - Google user ID (stable, unique)
 * @param {string} googleEmail - Google email address
 * @param {string} refreshToken - OAuth refresh token (will be encrypted)
 * @param {string} scopes - OAuth scopes granted
 * @param {string} connectedByUserId - Telegram user who connected this account
 * @returns {Promise<void>}
 */
export async function storeGoogleConnection(env, chatId, googleSub, googleEmail, refreshToken, scopes, connectedByUserId) {
  const key = `gconn:${chatId}:${googleSub}`;
  
  // Encrypt refresh token
  const encryptedRefreshToken = await encryptToken(refreshToken, env);
  
  const data = {
    chat_id: chatId,
    google_sub: googleSub,
    google_email: googleEmail.toLowerCase(),
    refresh_token_enc: encryptedRefreshToken,
    scopes: scopes,
    revoked: false,
    connected_by_telegram_user_id: connectedByUserId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  await env.EVENTS.put(key, JSON.stringify(data));
  console.log(`Stored Google connection for chat ${chatId}: ${googleEmail} (sub: ${googleSub})`);
}

/**
 * Get all active Google connections for a workspace
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<Array>} Array of connection objects
 */
export async function getWorkspaceConnections(env, chatId) {
  const prefix = `gconn:${chatId}:`;
  const list = await env.EVENTS.list({ prefix });
  
  const connections = [];
  for (const item of list.keys) {
    const data = await env.EVENTS.get(item.name, 'json');
    if (data && !data.revoked) {
      // Decrypt refresh token
      try {
        data.refresh_token = await decryptToken(data.refresh_token_enc, env);
        delete data.refresh_token_enc; // Remove encrypted version from memory
        connections.push(data);
      } catch (error) {
        console.error(`Failed to decrypt token for ${item.name}:`, error);
      }
    }
  }
  
  console.log(`Found ${connections.length} active connections for chat ${chatId}`);
  return connections;
}

/**
 * Get a specific Google connection
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} googleSub - Google user ID
 * @returns {Promise<Object|null>}
 */
export async function getGoogleConnection(env, chatId, googleSub) {
  const key = `gconn:${chatId}:${googleSub}`;
  const data = await env.EVENTS.get(key, 'json');
  
  if (!data || data.revoked) {
    return null;
  }
  
  // Decrypt refresh token
  try {
    data.refresh_token = await decryptToken(data.refresh_token_enc, env);
    delete data.refresh_token_enc;
    return data;
  } catch (error) {
    console.error(`Failed to decrypt token for ${key}:`, error);
    return null;
  }
}

/**
 * Find connection by email (case-insensitive)
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} email - Google email address
 * @returns {Promise<Object|null>}
 */
export async function findConnectionByEmail(env, chatId, email) {
  const normalizedEmail = email.toLowerCase();
  const connections = await getWorkspaceConnections(env, chatId);
  return connections.find(conn => conn.google_email === normalizedEmail) || null;
}

/**
 * Update access token for a connection (after refresh)
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} googleSub - Google user ID
 * @param {string} accessToken - New access token
 * @param {number} expiresAt - Expiry timestamp
 */
export async function updateConnectionAccessToken(env, chatId, googleSub, accessToken, expiresAt) {
  const key = `gconn:${chatId}:${googleSub}`;
  const data = await env.EVENTS.get(key, 'json');
  
  if (!data) {
    throw new Error(`Connection not found: ${key}`);
  }
  
  data.access_token = accessToken;
  data.expires_at = expiresAt;
  data.updated_at = new Date().toISOString();
  
  await env.EVENTS.put(key, JSON.stringify(data));
}

/**
 * Mark a connection as revoked (or delete it)
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} googleSub - Google user ID
 */
export async function revokeGoogleConnection(env, chatId, googleSub) {
  const key = `gconn:${chatId}:${googleSub}`;
  const data = await env.EVENTS.get(key, 'json');
  
  if (!data) {
    return; // Already gone
  }
  
  // Option 1: Mark as revoked
  data.revoked = true;
  data.updated_at = new Date().toISOString();
  await env.EVENTS.put(key, JSON.stringify(data));
  
  // Option 2: Delete entirely (uncomment to use)
  // await env.EVENTS.delete(key);
  
  console.log(`Revoked connection for chat ${chatId}, sub ${googleSub}`);
}

// ============================================================================
// EVENT MAPPING (bot_event_uid -> google_event_id per account)
// ============================================================================

/**
 * Store event mapping after creating event
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} botEventUid - Bot-generated stable event UID
 * @param {string} googleSub - Google user ID
 * @param {string} googleEventId - Google Calendar event ID
 */
export async function storeEventMapping(env, chatId, botEventUid, googleSub, googleEventId) {
  const key = `emap:${chatId}:${botEventUid}:${googleSub}`;
  
  const data = {
    chat_id: chatId,
    bot_event_uid: botEventUid,
    google_sub: googleSub,
    google_event_id: googleEventId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  await env.EVENTS.put(key, JSON.stringify(data));
  console.log(`Stored event mapping: ${botEventUid} -> ${googleEventId} (${googleSub})`);
}

/**
 * Get all event mappings for a bot event UID
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} botEventUid - Bot event UID
 * @returns {Promise<Array>} Array of { google_sub, google_event_id }
 */
export async function getEventMappings(env, chatId, botEventUid) {
  const prefix = `emap:${chatId}:${botEventUid}:`;
  const list = await env.EVENTS.list({ prefix });
  
  const mappings = [];
  for (const item of list.keys) {
    const data = await env.EVENTS.get(item.name, 'json');
    if (data) {
      mappings.push({
        google_sub: data.google_sub,
        google_event_id: data.google_event_id
      });
    }
  }
  
  return mappings;
}

/**
 * Delete event mapping (after deleting event)
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} botEventUid - Bot event UID
 * @param {string} googleSub - Google user ID (optional, if omitted deletes all for UID)
 */
export async function deleteEventMapping(env, chatId, botEventUid, googleSub = null) {
  if (googleSub) {
    // Delete specific mapping
    const key = `emap:${chatId}:${botEventUid}:${googleSub}`;
    await env.EVENTS.delete(key);
    console.log(`Deleted event mapping: ${botEventUid} (${googleSub})`);
  } else {
    // Delete all mappings for this event UID
    const prefix = `emap:${chatId}:${botEventUid}:`;
    const list = await env.EVENTS.list({ prefix });
    
    for (const item of list.keys) {
      await env.EVENTS.delete(item.name);
    }
    console.log(`Deleted all event mappings for: ${botEventUid}`);
  }
}

/**
 * Delete all event mappings for a disconnected account
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} googleSub - Google user ID
 */
export async function deleteEventMappingsForAccount(env, chatId, googleSub) {
  // List all event maps for this chat
  const prefix = `emap:${chatId}:`;
  const list = await env.EVENTS.list({ prefix });
  
  let deleted = 0;
  for (const item of list.keys) {
    const data = await env.EVENTS.get(item.name, 'json');
    if (data && data.google_sub === googleSub) {
      await env.EVENTS.delete(item.name);
      deleted++;
    }
  }
  
  console.log(`Deleted ${deleted} event mappings for account ${googleSub} in chat ${chatId}`);
}

// ============================================================================
// LEGACY FUNCTIONS (kept for compatibility, but deprecated)
// ============================================================================

export async function getSelectedEvent(env, chatId, userId) {
  const key = `selected_event:${chatId}:${userId}`;
  
  try {
    const data = await env.EVENTS.get(key, 'json');
    console.log(`Retrieved selected event for chat ${chatId}, user ${userId}:`, data ? 'found' : 'not found');
    return data;
  } catch (error) {
    console.error('KV get error:', error);
    return null;
  }
}

export async function setSelectedEvent(env, chatId, userId, eventId, event) {
  const key = `selected_event:${chatId}:${userId}`;
  const data = {
    eventId,
    event,
    createdAt: new Date().toISOString()
  };
  
  try {
    await env.EVENTS.put(key, JSON.stringify(data), {
      expirationTtl: 86400  // 24 hours
    });
    console.log(`Stored selected event for chat ${chatId}, user ${userId}: ${eventId}`);
  } catch (error) {
    console.error('KV put error:', error);
    throw error;
  }
}

export async function clearSelectedEvent(env, chatId, userId) {
  const key = `selected_event:${chatId}:${userId}`;
  
  try {
    await env.EVENTS.delete(key);
    console.log(`Cleared selected event for chat ${chatId}, user ${userId}`);
  } catch (error) {
    console.error('KV delete error:', error);
    throw error;
  }
}

/**
 * Store OAuth tokens for a user
 * @param {Object} env - Worker environment with EVENTS KV
 * @param {string} userId - Telegram user ID
 * @param {Object} tokens - OAuth tokens object
 * @param {string} tokens.access_token - Access token
 * @param {string} tokens.refresh_token - Refresh token
 * @param {number} tokens.expires_in - Expiry seconds from now
 * @param {string} tokens.email - User's Google email
 */
export async function storeUserTokens(env, userId, tokens) {
  const key = `oauth:${userId}`;
  const data = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
    email: tokens.email,
    updatedAt: new Date().toISOString()
  };
  
  try {
    await env.EVENTS.put(key, JSON.stringify(data));
    console.log(`Stored OAuth tokens for user ${userId} (${tokens.email})`);
  } catch (error) {
    console.error('Failed to store OAuth tokens:', error);
    throw error;
  }
}

/**
 * Get OAuth tokens for a user
 * @param {Object} env - Worker environment with EVENTS KV
 * @param {string} userId - Telegram user ID
 * @returns {Object|null} - Tokens object or null if not found
 */
export async function getUserTokens(env, userId) {
  const key = `oauth:${userId}`;
  
  try {
    const data = await env.EVENTS.get(key, 'json');
    if (!data) {
      console.log(`No OAuth tokens found for user ${userId}`);
      return null;
    }
    
    console.log(`Retrieved OAuth tokens for user ${userId} (${data.email})`);
    return data;
  } catch (error) {
    console.error('Failed to get OAuth tokens:', error);
    return null;
  }
}

/**
 * Delete OAuth tokens for a user
 * @param {Object} env - Worker environment with EVENTS KV
 * @param {string} userId - Telegram user ID
 */
export async function deleteUserTokens(env, userId) {
  const key = `oauth:${userId}`;
  
  try {
    await env.EVENTS.delete(key);
    console.log(`Deleted OAuth tokens for user ${userId}`);
  } catch (error) {
    console.error('Failed to delete OAuth tokens:', error);
    throw error;
  }
}

/**
 * LEGACY CHAT-SCOPED TOKEN FUNCTIONS (DEPRECATED - use workspace connections)
 * Kept for backward compatibility during migration
 */

/**
 * Get OAuth tokens for a chat (DEPRECATED - returns first connection for compatibility)
 * @param {Object} env - Worker environment with EVENTS KV
 * @param {string} chatId - Telegram chat ID
 * @returns {Object|null} - Tokens object or null if not found
 */
export async function getChatTokens(env, chatId) {
  // Try legacy key first
  const legacyKey = `gc_tokens:chat:${chatId}`;
  const legacyData = await env.EVENTS.get(legacyKey, 'json');
  
  if (legacyData) {
    console.log(`Retrieved legacy OAuth tokens for chat ${chatId} (${legacyData.email})`);
    return legacyData;
  }
  
  // Otherwise, get first active connection
  const connections = await getWorkspaceConnections(env, chatId);
  if (connections.length === 0) {
    console.log(`No OAuth tokens found for chat ${chatId}`);
    return null;
  }
  
  // Return first connection in legacy format
  const conn = connections[0];
  console.log(`Retrieved OAuth tokens for chat ${chatId} (${conn.google_email}) [multi-account mode]`);
  return {
    email: conn.google_email,
    linkedBy: conn.connected_by_telegram_user_id,
    linkedAt: conn.created_at,
    refresh_token: conn.refresh_token,
    access_token: conn.access_token,
    expires_at: conn.expires_at
  };
}

/**
 * Store OAuth tokens for a chat (DEPRECATED - use storeGoogleConnection)
 * @param {Object} env - Worker environment with EVENTS KV
 * @param {string} chatId - Telegram chat ID
 * @param {Object} tokens - OAuth tokens object
 * @param {number} linkedBy - User who linked the calendar
 */
export async function storeChatTokens(env, chatId, tokens, linkedBy) {
  // Store in legacy location for backward compatibility
  const key = `gc_tokens:chat:${chatId}`;
  const data = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    email: tokens.email,
    linkedBy: linkedBy,
    linkedAt: new Date().toISOString(),
    scope: tokens.scope
  };
  
  try {
    await env.EVENTS.put(key, JSON.stringify(data));
    console.log(`Stored OAuth tokens for chat ${chatId} (${tokens.email}) [legacy]`);
  } catch (error) {
    console.error('Failed to store chat tokens:', error);
    throw error;
  }
}

/**
 * Delete OAuth tokens for a chat (DEPRECATED - use revokeGoogleConnection)
 * @param {Object} env - Worker environment with EVENTS KV
 * @param {string} chatId - Telegram chat ID
 */
export async function deleteChatTokens(env, chatId) {
  // Delete legacy token
  const legacyKey = `gc_tokens:chat:${chatId}`;
  await env.EVENTS.delete(legacyKey);
  
  // Also delete all new-style connections
  const connections = await getWorkspaceConnections(env, chatId);
  for (const conn of connections) {
    await revokeGoogleConnection(env, chatId, conn.google_sub);
  }
  
  console.log(`Deleted all OAuth tokens for chat ${chatId}`);
}
