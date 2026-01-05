# Database Schema & Storage Design

## Overview

Since the C4lendar Bot runs on Cloudflare Workers with KV storage (key-value), we'll adapt the relational schema into a KV-compatible design with proper indexing strategies.

---

## Schema 1: google_connections

### Purpose
Store all Google account connections for each workspace (chat).

### Relational Model (Reference)
```sql
CREATE TABLE google_connections (
  id                              INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id                         TEXT NOT NULL,
  google_sub                      TEXT NOT NULL,      -- Stable Google user ID
  google_email                    TEXT NOT NULL,      -- Lowercase normalized
  refresh_token_encrypted         TEXT NOT NULL,      -- AES-GCM encrypted
  scopes                          TEXT NOT NULL,      -- Space-separated OAuth scopes
  revoked                         INTEGER DEFAULT 0,  -- 0=active, 1=disconnected
  connected_by_telegram_user_id   INTEGER,            -- Metadata: who ran #aut
  created_at                      TEXT NOT NULL,      -- ISO 8601
  updated_at                      TEXT NOT NULL,      -- ISO 8601
  
  UNIQUE(chat_id, google_sub)
);

CREATE INDEX idx_connections_chat ON google_connections(chat_id, revoked);
CREATE INDEX idx_connections_email ON google_connections(google_email);
CREATE INDEX idx_connections_sub ON google_connections(google_sub);
```

### KV Storage Design

#### Primary Key Pattern
```
Key: gc:conn:{chat_id}:{google_sub}
Value: JSON blob
{
  "chat_id": "-1001234567890",
  "google_sub": "115678901234567890123",
  "google_email": "alice@gmail.com",
  "refresh_token_encrypted": "AaB3cD...encrypted_base64...",
  "scopes": "https://www.googleapis.com/auth/calendar.events",
  "revoked": 0,
  "connected_by_telegram_user_id": 555555,
  "created_at": "2026-01-05T10:30:00.000Z",
  "updated_at": "2026-01-05T10:30:00.000Z"
}
```

**Uniqueness**: Enforced by key structure (chat_id + google_sub)

#### Secondary Index: Email Lookup
```
Key: gc:idx:email:{lowercase_email}
Value: Array of chat_id values where this email is connected
["1234567890", "-1001234567890"]
```

**Use case**: When user runs `#dis alice@gmail.com`, quickly find all chats where this email is connected.

#### Operations

**1. Store Connection**
```javascript
async function storeGoogleConnection(env, connection) {
  const key = `gc:conn:${connection.chat_id}:${connection.google_sub}`;
  const data = {
    chat_id: connection.chat_id,
    google_sub: connection.google_sub,
    google_email: connection.google_email.toLowerCase(),
    refresh_token_encrypted: connection.refresh_token_encrypted,
    scopes: connection.scopes,
    revoked: connection.revoked || 0,
    connected_by_telegram_user_id: connection.connected_by_telegram_user_id,
    created_at: connection.created_at,
    updated_at: connection.updated_at
  };
  
  await env.EVENTS.put(key, JSON.stringify(data));
  
  // Update email index
  await addToEmailIndex(env, connection.google_email, connection.chat_id);
}

async function addToEmailIndex(env, email, chatId) {
  const indexKey = `gc:idx:email:${email.toLowerCase()}`;
  const existing = await env.EVENTS.get(indexKey, 'json') || [];
  
  if (!existing.includes(chatId)) {
    existing.push(chatId);
    await env.EVENTS.put(indexKey, JSON.stringify(existing));
  }
}
```

**2. Get All Active Connections for Chat**
```javascript
async function getActiveConnections(env, chatId) {
  const prefix = `gc:conn:${chatId}:`;
  const list = await env.EVENTS.list({ prefix });
  
  // Fetch all connection blobs in parallel
  const connections = await Promise.all(
    list.keys.map(async (key) => {
      const data = await env.EVENTS.get(key.name, 'json');
      return data;
    })
  );
  
  // Filter active only (revoked=0)
  return connections.filter(c => c && c.revoked === 0);
}
```

**3. Get Connection by Email (in specific chat)**
```javascript
async function getConnectionByEmail(env, chatId, email) {
  const normalizedEmail = email.toLowerCase();
  const prefix = `gc:conn:${chatId}:`;
  const list = await env.EVENTS.list({ prefix });
  
  for (const key of list.keys) {
    const data = await env.EVENTS.get(key.name, 'json');
    if (data && data.google_email === normalizedEmail) {
      return data;
    }
  }
  
  return null;
}
```

**4. Get Connection by Google Sub**
```javascript
async function getConnectionBySub(env, chatId, googleSub) {
  const key = `gc:conn:${chatId}:${googleSub}`;
  return await env.EVENTS.get(key, 'json');
}
```

**5. Update Connection (mark revoked, update tokens, etc.)**
```javascript
async function updateGoogleConnection(env, connection) {
  connection.updated_at = new Date().toISOString();
  const key = `gc:conn:${connection.chat_id}:${connection.google_sub}`;
  await env.EVENTS.put(key, JSON.stringify(connection));
}
```

**6. Delete Connection**
```javascript
async function deleteGoogleConnection(env, chatId, googleSub, email) {
  const key = `gc:conn:${chatId}:${googleSub}`;
  await env.EVENTS.delete(key);
  
  // Update email index
  await removeFromEmailIndex(env, email, chatId);
}

async function removeFromEmailIndex(env, email, chatId) {
  const indexKey = `gc:idx:email:${email.toLowerCase()}`;
  const existing = await env.EVENTS.get(indexKey, 'json') || [];
  
  const updated = existing.filter(id => id !== chatId);
  
  if (updated.length > 0) {
    await env.EVENTS.put(indexKey, JSON.stringify(updated));
  } else {
    await env.EVENTS.delete(indexKey);
  }
}
```

---

## Schema 2: event_map

### Purpose
Map logical bot events to per-account Google Calendar event IDs. Required for #del and #alt to work reliably across multiple accounts.

### Relational Model (Reference)
```sql
CREATE TABLE event_map (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id             TEXT NOT NULL,
  bot_event_uid       TEXT NOT NULL,      -- Stable ULID (26 chars)
  google_sub          TEXT NOT NULL,      -- Which account owns this Google event
  google_event_id     TEXT NOT NULL,      -- Google Calendar event ID
  event_title         TEXT,               -- For debugging/display
  event_start         TEXT,               -- ISO 8601 start time
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  
  UNIQUE(chat_id, bot_event_uid, google_sub)
);

CREATE INDEX idx_event_map_bot_uid ON event_map(chat_id, bot_event_uid);
CREATE INDEX idx_event_map_google_id ON event_map(google_event_id);
CREATE INDEX idx_event_map_chat_time ON event_map(chat_id, created_at DESC);
```

### KV Storage Design

#### Primary Key Pattern
```
Key: gc:event:{chat_id}:{bot_event_uid}:{google_sub}
Value: JSON blob
{
  "chat_id": "-1001234567890",
  "bot_event_uid": "01JBZQ8F7VKPNX3QZ9M8J5K2W7",
  "google_sub": "115678901234567890123",
  "google_event_id": "abc123xyz789",
  "event_title": "Team standup",
  "event_start": "2026-01-06T09:00:00+08:00",
  "created_at": "2026-01-05T10:30:00.000Z",
  "updated_at": "2026-01-05T10:30:00.000Z"
}
```

**Uniqueness**: Enforced by key structure (chat_id + bot_event_uid + google_sub)

#### Secondary Index: Recent Events per Chat
```
Key: gc:event:recent:{chat_id}
Value: Array of recent bot_event_uids (newest first, max 50)
[
  {
    "bot_event_uid": "01JBZQ8F7VKPNX3QZ9M8J5K2W7",
    "event_title": "Team standup",
    "event_start": "2026-01-06T09:00:00+08:00",
    "created_at": "2026-01-05T10:30:00.000Z"
  },
  {
    "bot_event_uid": "01JBZP1A2BCDEXAMPLE1234",
    "event_title": "Project review",
    "event_start": "2026-01-05T14:00:00+08:00",
    "created_at": "2026-01-05T08:15:00.000Z"
  }
]
```

**Use case**: 
- `#del` without identifier deletes most recent
- Fuzzy resolution for `#del team standup`
- Display recent events for disambiguation

#### Operations

**1. Store Event Mapping**
```javascript
async function storeEventMapping(env, mapping) {
  const key = `gc:event:${mapping.chat_id}:${mapping.bot_event_uid}:${mapping.google_sub}`;
  const data = {
    chat_id: mapping.chat_id,
    bot_event_uid: mapping.bot_event_uid,
    google_sub: mapping.google_sub,
    google_event_id: mapping.google_event_id,
    event_title: mapping.event_title,
    event_start: mapping.event_start,
    created_at: mapping.created_at,
    updated_at: mapping.updated_at
  };
  
  await env.EVENTS.put(key, JSON.stringify(data));
  
  // Update recent events index
  await addToRecentEventsIndex(env, mapping.chat_id, {
    bot_event_uid: mapping.bot_event_uid,
    event_title: mapping.event_title,
    event_start: mapping.event_start,
    created_at: mapping.created_at
  });
}

async function addToRecentEventsIndex(env, chatId, eventSummary) {
  const indexKey = `gc:event:recent:${chatId}`;
  const existing = await env.EVENTS.get(indexKey, 'json') || [];
  
  // Check if already exists
  if (!existing.find(e => e.bot_event_uid === eventSummary.bot_event_uid)) {
    // Add to beginning (newest first)
    existing.unshift(eventSummary);
    
    // Keep only last 50
    const trimmed = existing.slice(0, 50);
    
    await env.EVENTS.put(indexKey, JSON.stringify(trimmed));
  }
}
```

**2. Get All Mappings for Bot Event**
```javascript
async function getEventMappings(env, chatId, botEventUid) {
  const prefix = `gc:event:${chatId}:${botEventUid}:`;
  const list = await env.EVENTS.list({ prefix });
  
  const mappings = await Promise.all(
    list.keys.map(key => env.EVENTS.get(key.name, 'json'))
  );
  
  return mappings.filter(m => m !== null);
}
```

**3. Get Most Recent Bot Event UID**
```javascript
async function getMostRecentBotEventUid(env, chatId) {
  const indexKey = `gc:event:recent:${chatId}`;
  const recent = await env.EVENTS.get(indexKey, 'json') || [];
  
  if (recent.length === 0) return null;
  
  return recent[0].bot_event_uid;
}
```

**4. Resolve Bot Event UID by Short Reference**
```javascript
async function resolveBotEventUid(env, chatId, shortUid) {
  // shortUid is first 8 chars like "01JBZQ8F"
  const indexKey = `gc:event:recent:${chatId}`;
  const recent = await env.EVENTS.get(indexKey, 'json') || [];
  
  const match = recent.find(e => e.bot_event_uid.startsWith(shortUid.toUpperCase()));
  
  return match ? match.bot_event_uid : null;
}
```

**5. Fuzzy Resolve Event (by title/time)**
```javascript
async function fuzzyResolveEvent(env, chatId, query) {
  const indexKey = `gc:event:recent:${chatId}`;
  const recent = await env.EVENTS.get(indexKey, 'json') || [];
  
  const lowerQuery = query.toLowerCase();
  
  // Search by title substring
  const matches = recent.filter(e => 
    e.event_title.toLowerCase().includes(lowerQuery)
  );
  
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].bot_event_uid;
  
  // Multiple matches - return most recent
  return matches[0].bot_event_uid;
}
```

**6. Update Event Mapping (after #alt)**
```javascript
async function updateEventMapping(env, mapping) {
  const key = `gc:event:${mapping.chat_id}:${mapping.bot_event_uid}:${mapping.google_sub}`;
  mapping.updated_at = new Date().toISOString();
  await env.EVENTS.put(key, JSON.stringify(mapping));
  
  // Update recent index
  await updateRecentEventsIndex(env, mapping.chat_id, {
    bot_event_uid: mapping.bot_event_uid,
    event_title: mapping.event_title,
    event_start: mapping.event_start,
    created_at: mapping.created_at
  });
}

async function updateRecentEventsIndex(env, chatId, eventSummary) {
  const indexKey = `gc:event:recent:${chatId}`;
  const existing = await env.EVENTS.get(indexKey, 'json') || [];
  
  // Find and update
  const index = existing.findIndex(e => e.bot_event_uid === eventSummary.bot_event_uid);
  
  if (index !== -1) {
    existing[index] = eventSummary;
    await env.EVENTS.put(indexKey, JSON.stringify(existing));
  }
}
```

**7. Delete Event Mappings**
```javascript
async function deleteEventMappings(env, chatId, botEventUid) {
  // Delete all mappings for this bot event
  const prefix = `gc:event:${chatId}:${botEventUid}:`;
  const list = await env.EVENTS.list({ prefix });
  
  await Promise.all(
    list.keys.map(key => env.EVENTS.delete(key.name))
  );
  
  // Update recent index
  await removeFromRecentEventsIndex(env, chatId, botEventUid);
}

async function removeFromRecentEventsIndex(env, chatId, botEventUid) {
  const indexKey = `gc:event:recent:${chatId}`;
  const existing = await env.EVENTS.get(indexKey, 'json') || [];
  
  const updated = existing.filter(e => e.bot_event_uid !== botEventUid);
  
  await env.EVENTS.put(indexKey, JSON.stringify(updated));
}
```

**8. Delete Event Mappings for Account (when #dis)**
```javascript
async function deleteEventMappingsForAccount(env, chatId, googleSub) {
  // List all events for this chat
  const chatPrefix = `gc:event:${chatId}:`;
  const list = await env.EVENTS.list({ prefix: chatPrefix });
  
  // Filter to this google_sub
  const toDelete = list.keys.filter(key => key.name.endsWith(`:${googleSub}`));
  
  await Promise.all(
    toDelete.map(key => env.EVENTS.delete(key.name))
  );
  
  console.log(`Deleted ${toDelete.length} event mappings for ${googleSub} in chat ${chatId}`);
}
```

---

## Token Encryption Implementation

### AES-GCM Encryption Functions

**Required Environment Variable**:
```
ENCRYPTION_KEY=<32+ character random string>
```

**Implementation**:

```javascript
/**
 * Encrypt refresh token using AES-GCM
 * @param {string} plaintext - Refresh token to encrypt
 * @param {Object} env - Worker environment
 * @returns {string} Base64-encoded encrypted data (IV + ciphertext)
 */
async function encryptToken(plaintext, env) {
  // Derive 32-byte key from ENCRYPTION_KEY
  const keyMaterial = new TextEncoder().encode(
    env.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)
  );
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Generate random 12-byte IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    plaintextBytes
  );
  
  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  // Return base64-encoded
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt refresh token using AES-GCM
 * @param {string} encryptedBase64 - Base64-encoded encrypted data
 * @param {Object} env - Worker environment
 * @returns {string} Decrypted refresh token
 */
async function decryptToken(encryptedBase64, env) {
  // Decode base64
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  
  // Split IV and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  // Derive key
  const keyMaterial = new TextEncoder().encode(
    env.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)
  );
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Decrypt
  const plaintextBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(plaintextBytes);
}
```

**Usage in OAuth Callback**:
```javascript
// After exchanging code for tokens
const tokens = await exchangeCodeForTokens(env, code);

// Encrypt refresh token before storage
const refreshTokenEncrypted = await encryptToken(tokens.refresh_token, env);

// Store connection
await storeGoogleConnection(env, {
  chat_id: chatId,
  google_sub: userInfo.id,
  google_email: userInfo.email.toLowerCase(),
  refresh_token_encrypted: refreshTokenEncrypted,  // Encrypted!
  scopes: tokens.scope,
  revoked: 0,
  connected_by_telegram_user_id: userId,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});
```

**Usage in Token Refresh**:
```javascript
async function refreshAndGetAccessToken(env, connection) {
  // Decrypt refresh token
  const refreshToken = await decryptToken(connection.refresh_token_encrypted, env);
  
  // Use it to refresh
  const refreshed = await refreshAccessToken(env, refreshToken);
  
  return refreshed ? refreshed.access_token : null;
}
```

---

## ULID Generation for bot_event_uid

**Why ULID?**
- Lexicographically sortable (timestamp prefix)
- URL-safe (no special characters)
- 26 characters (compact)
- Collision-resistant

**Implementation**:

```javascript
/**
 * Generate ULID (Universally Unique Lexicographically Sortable Identifier)
 * Format: 01JBZQ8F7VKPNX3QZ9M8J5K2W7 (26 chars)
 * First 10 chars: timestamp (milliseconds since epoch)
 * Last 16 chars: random
 */
function generateULID() {
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford's Base32
  const ENCODING_LEN = ENCODING.length;
  
  // Timestamp part (10 chars, 48 bits)
  const now = Date.now();
  let time = '';
  let ts = now;
  
  for (let i = 9; i >= 0; i--) {
    time = ENCODING.charAt(ts % ENCODING_LEN) + time;
    ts = Math.floor(ts / ENCODING_LEN);
  }
  
  // Random part (16 chars, 80 bits)
  let random = '';
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  
  for (let i = 0; i < 16; i++) {
    random += ENCODING.charAt(randomBytes[i] % ENCODING_LEN);
  }
  
  return time + random;
}
```

**Usage**:
```javascript
// In #cal handler
const botEventUid = generateULID();
// Result: "01JBZQ8F7VKPNX3QZ9M8J5K2W7"

// Store with short reference for user
const shortRef = botEventUid.slice(0, 8); // "01JBZQ8F"
await sendMessage(env, chatId, 
  `✅ Event created!\n\nRef: \`EVT-${shortRef}\``
);
```

---

## Migration from Current Schema

### Current Storage Keys
```
gc_tokens:chat:{chat_id} → Single token set
{
  "access_token": "...",
  "refresh_token": "...",  // PLAINTEXT!
  "expires_at": 1234567890,
  "email": "user@gmail.com",
  "linkedBy": 555555,
  "linkedAt": "2026-01-05T10:30:00.000Z",
  "scope": "https://..."
}

selected_event:{chat_id}:{user_id} → Temp event reference
{
  "eventId": "abc123",
  "event": {...},
  "createdAt": "..."
}
```

### Migration Steps

**1. Fetch existing token**:
```javascript
async function migrateExistingToken(env, chatId) {
  const oldKey = `gc_tokens:chat:${chatId}`;
  const oldData = await env.EVENTS.get(oldKey, 'json');
  
  if (!oldData || !oldData.refresh_token) {
    console.log(`No token to migrate for chat ${chatId}`);
    return;
  }
  
  // Get google_sub from Google API
  const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${oldData.access_token}` }
  });
  
  if (!userInfo.ok) {
    console.error(`Failed to fetch user info for chat ${chatId}`);
    return;
  }
  
  const { email, id: googleSub } = await userInfo.json();
  
  // Encrypt refresh token
  const refreshTokenEncrypted = await encryptToken(oldData.refresh_token, env);
  
  // Store in new format
  await storeGoogleConnection(env, {
    chat_id: chatId,
    google_sub: googleSub,
    google_email: email.toLowerCase(),
    refresh_token_encrypted: refreshTokenEncrypted,
    scopes: oldData.scope || 'https://www.googleapis.com/auth/calendar.events',
    revoked: 0,
    connected_by_telegram_user_id: oldData.linkedBy,
    created_at: oldData.linkedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  
  console.log(`✓ Migrated token for chat ${chatId} (${email})`);
  
  // Keep old key for now (don't delete until verified)
}
```

**2. Run migration for all chats**:
```javascript
async function migrateAllTokens(env) {
  const list = await env.EVENTS.list({ prefix: 'gc_tokens:chat:' });
  
  console.log(`Found ${list.keys.length} chats to migrate`);
  
  for (const key of list.keys) {
    const chatId = key.name.replace('gc_tokens:chat:', '');
    try {
      await migrateExistingToken(env, chatId);
    } catch (error) {
      console.error(`Migration failed for chat ${chatId}:`, error);
    }
  }
}
```

**3. Backfill event_map (optional, for recent events)**:
Since the old system used `selected_event:{chat_id}:{user_id}`, we can't reliably backfill event_map. However, we can:
- Start fresh with event_map (new events only)
- Keep `selected_event` keys temporarily for backward compatibility during transition
- After a few days, most recent events will be in new system

---

## Storage Quota Considerations

### KV Limits (Cloudflare Workers)
- **Key size**: Max 512 bytes
- **Value size**: Max 25 MB (more than enough for JSON)
- **Operations**: 1000 reads/second, 1000 writes/second per account

### Estimated Storage per Chat
```
Connections (10 accounts):
  gc:conn:{chat}:{sub} × 10 = ~5 KB

Event mappings (100 events × 10 accounts):
  gc:event:{chat}:{uid}:{sub} × 1000 = ~100 KB

Recent events index:
  gc:event:recent:{chat} (50 events) = ~5 KB

Total per chat: ~110 KB
```

**For 1000 active chats**: ~110 MB (well within limits)

### Cleanup Strategy

**Auto-expire old event mappings**:
```javascript
// When storing event mapping
await env.EVENTS.put(key, JSON.stringify(data), {
  expirationTtl: 90 * 86400  // 90 days
});
```

**Periodic cleanup of revoked connections**:
```javascript
async function cleanupRevokedConnections(env) {
  const list = await env.EVENTS.list({ prefix: 'gc:conn:' });
  
  for (const key of list.keys) {
    const conn = await env.EVENTS.get(key.name, 'json');
    
    if (conn && conn.revoked === 1) {
      const revokedDate = new Date(conn.updated_at);
      const daysSinceRevoked = (Date.now() - revokedDate.getTime()) / (1000 * 86400);
      
      // Delete after 30 days
      if (daysSinceRevoked > 30) {
        await env.EVENTS.delete(key.name);
        console.log(`Cleaned up revoked connection: ${conn.google_email} from chat ${conn.chat_id}`);
      }
    }
  }
}
```

---

## Summary

| Schema | KV Key Pattern | Purpose | TTL |
|--------|----------------|---------|-----|
| **google_connections** | `gc:conn:{chat_id}:{google_sub}` | Store account connections | None (manual revoke) |
| **event_map** | `gc:event:{chat_id}:{bot_uid}:{sub}` | Map bot events to Google IDs | 90 days |
| **recent_events** | `gc:event:recent:{chat_id}` | Fast event resolution | None (capped at 50) |
| **email_index** | `gc:idx:email:{email}` | Email → chat lookup | None |

**Encryption**: All refresh tokens encrypted with AES-GCM using `ENCRYPTION_KEY` env variable.

**Uniqueness**: Enforced by key structure (no duplicate keys possible in KV).

**Scalability**: Supports thousands of chats with hundreds of accounts each.

