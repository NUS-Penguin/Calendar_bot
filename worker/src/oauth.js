/**
 * Google OAuth 2.0 flow manager
 * Supports multi-account workspace model
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Minimal scope for calendar events only
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

/**
 * Generate HMAC signature for state integrity
 */
async function generateStateSignature(payload, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const signatureArray = Array.from(new Uint8Array(signature));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify state signature
 */
async function verifyStateSignature(payload, signature, secret) {
  const expectedSignature = await generateStateSignature(payload, secret);
  return signature === expectedSignature;
}

/**
 * Generate OAuth consent URL for chat linking
 * @param {string} chatId - The chat being linked
 * @param {number} initiatedBy - User who triggered #aut
 * @param {string} chatType - 'private', 'group', 'supergroup'
 */
export function generateOAuthURL(env, chatId, initiatedBy, chatType) {
  const nonce = crypto.randomUUID();
  const payload = `${chatId}:${initiatedBy}:${chatType}:${nonce}`;
  
  // Generate HMAC signature for integrity
  const secret = env.OAUTH_STATE_SECRET || env.ENCRYPTION_KEY || 'change-in-production';
  const statePromise = generateStateSignature(payload, secret).then(sig => {
    return btoa(`${payload}:${sig}`);
  });
  
  // For now, use synchronous base64 (we'll handle async in generateOAuthUrl wrapper)
  const state = btoa(payload + ':pending');
  
  const redirectUri = `${env.WORKER_URL || 'https://c4lendar-worker.calendar-bot.workers.dev'}/oauth/callback`;
  
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',  // Get refresh token
    prompt: 'consent',       // Force consent to get refresh token
    state: state
  });
  
  return {
    url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    state: state,
    nonce: nonce
  };
}

/**
 * Parse and validate state parameter with signature verification
 */
export async function parseAndVerifyState(state, secret) {
  try {
    const decoded = atob(state);
    const parts = decoded.split(':');
    
    if (parts.length < 5) {
      return null; // Invalid format
    }
    
    const [chatId, initiatedBy, chatType, nonce, signature] = parts;
    const payload = `${chatId}:${initiatedBy}:${chatType}:${nonce}`;
    
    // Verify signature
    const valid = await verifyStateSignature(payload, signature, secret);
    if (!valid) {
      console.error('State signature verification failed');
      return null;
    }
    
    return { 
      chatId: parseInt(chatId), 
      initiatedBy: parseInt(initiatedBy), 
      chatType, 
      nonce 
    };
  } catch (e) {
    console.error('State parse error:', e);
    return null;
  }
}

/**
 * Get Google user info (sub, email) from access token
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<{sub: string, email: string}>}
 */
export async function getGoogleUserInfo(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }
  
  const data = await response.json();
  return {
    sub: data.id,           // Stable Google user ID
    email: data.email
  };
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from OAuth callback
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<Object>} Token response with access_token, refresh_token, and user info (sub and email)
 */
export async function exchangeCodeForTokens(code, env) {
  const params = new URLSearchParams({
    code: code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${env.WORKER_URL}/oauth/callback`,
    grant_type: 'authorization_code'
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  
  const tokens = await response.json();
  
  // Get user info (sub and email)
  const userInfo = await getGoogleUserInfo(tokens.access_token);
  
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    token_type: tokens.token_type,
    scope: tokens.scope,
    sub: userInfo.sub,      // Stable Google user ID
    email: userInfo.email,
    expires_at: Date.now() + (tokens.expires_in * 1000)
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(env, refreshToken) {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token'
  });
  
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Token refresh failed:', error);
    
    // Token may be revoked
    if (response.status === 400) {
      return null;  // Signal re-auth needed
    }
    
    throw new Error(`Token refresh failed: ${error}`);
  }
  
  const tokens = await response.json();
  
  return {
    access_token: tokens.access_token,
    expires_in: tokens.expires_in,
    expires_at: Date.now() + (tokens.expires_in * 1000)
  };
}

/**
 * Get valid access token for a connection (with auto-refresh)
 * @param {Object} env - Worker environment
 * @param {Object} connection - Connection object from getGoogleConnection
 * @returns {Promise<string|null>} Valid access token or null if refresh failed
 */
export async function getValidAccessTokenForConnection(env, connection) {
  // Check if token needs refresh (expires in <1min)
  const now = Date.now();
  if (connection.expires_at && now >= connection.expires_at - 60000) {
    console.log(`Token expired for ${connection.google_email}, refreshing...`);
    
    const refreshed = await refreshAccessToken(env, connection.refresh_token);
    if (!refreshed) {
      // Refresh failed: connection may be revoked
      console.error(`Failed to refresh token for ${connection.google_email}`);
      return null;
    }
    
    // Update stored connection
    const { updateConnectionAccessToken } = await import('./persistence.js');
    await updateConnectionAccessToken(
      env, 
      connection.chat_id, 
      connection.google_sub, 
      refreshed.access_token, 
      refreshed.expires_at
    );
    
    console.log(`✓ Refreshed token for ${connection.google_email}`);
    return refreshed.access_token;
  }
  
  return connection.access_token || null;
}

/**
 * High-level function to generate OAuth URL (wrapper for index.js)
 * Now includes proper HMAC signature
 */
export async function generateOAuthUrl(chatId, initiatedBy, chatType, env) {
  const nonce = crypto.randomUUID();
  const payload = `${chatId}:${initiatedBy}:${chatType}:${nonce}`;
  
  // Generate HMAC signature
  const secret = env.OAUTH_STATE_SECRET || env.ENCRYPTION_KEY || 'change-in-production';
  const signature = await generateStateSignature(payload, secret);
  const state = btoa(`${payload}:${signature}`);
  
  const redirectUri = `${env.WORKER_URL || 'https://c4lendar-worker.calendar-bot.workers.dev'}/oauth/callback`;
  
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: state
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Handle OAuth callback - exchanges code for tokens and stores connection
 * Now stores connection using multi-account model
 */
export async function handleOAuthCallback(code, state, env) {
  const secret = env.OAUTH_STATE_SECRET || env.ENCRYPTION_KEY || 'change-in-production';
  
  // Validate and parse state with signature verification
  const stateData = await parseAndVerifyState(state, secret);
  if (!stateData) {
    throw new Error('Invalid or tampered authorization state');
  }
  
  // Also check KV state (for expiry)
  const stateKey = `oauth_state:${state}`;
  const kvStateData = await env.EVENTS.get(stateKey, 'json');
  
  if (!kvStateData) {
    throw new Error('Invalid or expired authorization state');
  }
  
  // Age check (<10min)
  if (Date.now() - kvStateData.createdAt > 600000) {
    await env.EVENTS.delete(stateKey);
    throw new Error('State expired');
  }
  
  // Delete state (one-time use)
  await env.EVENTS.delete(stateKey);
  
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(env, code);
  
  // Store connection using multi-account model
  const { storeGoogleConnection } = await import('./persistence.js');
  await storeGoogleConnection(
    env,
    stateData.chatId,
    tokens.sub,           // Google user ID (stable)
    tokens.email,
    tokens.refresh_token,
    tokens.scope,
    stateData.initiatedBy
  );
  
  return {
    chatId: stateData.chatId,
    email: tokens.email,
    sub: tokens.sub
  };
}

