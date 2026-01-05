/**
 * Google Calendar API client
 */

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Get user's calendar timezone and upcoming events
 * 
 * @param {string} accessToken - OAuth access token
 * @param {number} maxResults - Maximum events to fetch
 * @returns {Object} { timezone, events }
 */
export async function getCalendarContext(accessToken, maxResults = 10) {
  try {
    // Get calendar settings (timezone)
    const settingsResponse = await fetch(`${CALENDAR_API_BASE}/users/me/settings/timezone`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    let timezone = 'Asia/Singapore'; // Default
    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();
      timezone = settings.value || timezone;
    }
    
    // Get upcoming events (next 14 days)
    const now = new Date().toISOString();
    const twoWeeksLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    
    const eventsResponse = await fetch(
      `${CALENDAR_API_BASE}/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(now)}&` +
      `timeMax=${encodeURIComponent(twoWeeksLater)}&` +
      `maxResults=${maxResults}&` +
      `singleEvents=true&` +
      `orderBy=startTime`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    let events = [];
    if (eventsResponse.ok) {
      const data = await eventsResponse.json();
      events = (data.items || []).map(e => ({
        id: e.id,
        title: e.summary,
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        allDay: !e.start.dateTime
      }));
    }
    
    return { timezone, events };
  } catch (error) {
    console.error('Error fetching calendar context:', error);
    return { timezone: 'Asia/Singapore', events: [] };
  }
}

/**
 * Create event in user's calendar
 */
export async function createEvent(accessToken, event) {
  const calendarEvent = convertToGoogleFormat(event);
  
  const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(calendarEvent)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Calendar API error: ${error}`);
  }
  
  const created = await response.json();
  
  return {
    ok: true,
    eventId: created.id,
    title: created.summary,
    start: created.start.dateTime || created.start.date,
    end: created.end.dateTime || created.end.date,
    link: created.htmlLink
  };
}

/**
 * Update event in user's calendar
 */
export async function updateEvent(accessToken, eventId, updates) {
  const calendarEvent = convertToGoogleFormat(updates);
  
  const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(calendarEvent)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Calendar API error: ${error}`);
  }
  
  const updated = await response.json();
  
  return {
    ok: true,
    eventId: updated.id,
    title: updated.summary,
    start: updated.start.dateTime || updated.start.date,
    end: updated.end.dateTime || updated.end.date
  };
}

/**
 * Delete event from user's calendar
 */
export async function deleteEvent(accessToken, eventId) {
  const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok && response.status !== 410) {  // 410 = already deleted
    const error = await response.text();
    throw new Error(`Calendar API error: ${error}`);
  }
  
  return { ok: true };
}

/**
 * Convert our event format to Google Calendar API format
 */
function convertToGoogleFormat(event) {
  const googleEvent = {
    summary: event.title
  };
  
  if (event.allDay) {
    // All-day event
    googleEvent.start = { date: event.startDate };
    googleEvent.end = { date: event.endDate };
  } else {
    // Timed event
    googleEvent.start = { dateTime: event.start };
    googleEvent.end = { dateTime: event.end };
  }
  
  if (event.location) {
    googleEvent.location = event.location;
  }
  
  if (event.notes) {
    googleEvent.description = event.notes;
  }
  
  return googleEvent;
}

/**
 * Fallback: Create event via GAS (for migration period)
 */
export async function createEventGAS(env, event) {
  const payload = {
    action: 'create',
    ...event
  };
  
  const response = await fetch(env.GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`GAS API error: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Fallback: Update event via GAS
 */
export async function updateEventGAS(env, eventId, updates) {
  const payload = {
    action: 'update',
    eventId,
    ...updates
  };
  
  const response = await fetch(env.GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`GAS API error: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Fallback: Delete event via GAS
 */
export async function deleteEventGAS(env, eventId) {
  const payload = {
    action: 'delete',
    eventId
  };
  
  const response = await fetch(env.GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`GAS API error: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * High-level OAuth wrapper: Create event (handles token retrieval and refresh)
 */
export async function createEventOAuth(event, chatId, env) {
  const { getValidAccessToken } = await import('./oauth.js');
  
  const accessToken = await getValidAccessToken(env, chatId);
  if (!accessToken) {
    throw new Error('Please re-authenticate with #aut');
  }
  
  try {
    return await createEvent(accessToken, event);
  } catch (error) {
    // If 401, token might be invalid - ask user to re-auth
    if (error.message.includes('401')) {
      throw new Error('Please re-authenticate with #aut');
    }
    throw error;
  }
}

/**
 * High-level OAuth wrapper: Update event
 */
export async function updateEventOAuth(eventId, updates, chatId, env) {
  const { getValidAccessToken } = await import('./oauth.js');
  
  const accessToken = await getValidAccessToken(env, chatId);
  if (!accessToken) {
    throw new Error('Please re-authenticate with #aut');
  }
  
  try {
    return await updateEvent(accessToken, eventId, updates);
  } catch (error) {
    if (error.message.includes('401')) {
      throw new Error('Please re-authenticate with #aut');
    }
    throw error;
  }
}

/**
 * High-level OAuth wrapper: Delete event
 */
export async function deleteEventOAuth(eventId, chatId, env) {
  const { getValidAccessToken } = await import('./oauth.js');
  
  const accessToken = await getValidAccessToken(env, chatId);
  if (!accessToken) {
    throw new Error('Please re-authenticate with #aut');
  }
  
  try {
    return await deleteEvent(accessToken, eventId);
  } catch (error) {
    if (error.message.includes('401')) {
      throw new Error('Please re-authenticate with #aut');
    }
    throw error;
  }
}

// ============================================================================
// WORKSPACE BROADCAST OPERATIONS (MULTI-ACCOUNT)
// ============================================================================

/**
 * Broadcast create event to all connected accounts in workspace
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} botEventUid - Bot-generated event UID
 * @param {Object} event - Event object to create
 * @returns {Promise<Object>} { successes: [], failures: [], totalAccounts: N }
 */
export async function broadcastCreateEvent(env, chatId, botEventUid, event) {
  const { getWorkspaceConnections, storeEventMapping } = await import('./persistence.js');
  const { getValidAccessTokenForConnection } = await import('./oauth.js');
  
  const connections = await getWorkspaceConnections(env, chatId);
  
  if (connections.length === 0) {
    throw new Error('No Google accounts connected to this workspace');
  }
  
  const results = {
    successes: [],
    failures: [],
    totalAccounts: connections.length
  };
  
  // Fan out to all connections
  for (const conn of connections) {
    try {
      // Get valid access token (with auto-refresh)
      const accessToken = await getValidAccessTokenForConnection(env, conn);
      
      if (!accessToken) {
        results.failures.push({
          email: conn.google_email,
          reason: 'Token refresh failed',
          details: 'Please reconnect this account'
        });
        continue;
      }
      
      // Create event
      const result = await createEvent(accessToken, event);
      
      if (result.ok) {
        // Store event mapping
        await storeEventMapping(env, chatId, botEventUid, conn.google_sub, result.eventId);
        
        results.successes.push({
          email: conn.google_email,
          eventId: result.eventId,
          link: result.link
        });
      } else {
        results.failures.push({
          email: conn.google_email,
          reason: 'Creation failed',
          details: result.message || 'Unknown error'
        });
      }
      
    } catch (error) {
      console.error(`Failed to create event for ${conn.google_email}:`, error);
      results.failures.push({
        email: conn.google_email,
        reason: 'Exception',
        details: error.message
      });
    }
  }
  
  return results;
}

/**
 * Broadcast update event to all connected accounts in workspace
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} botEventUid - Bot event UID
 * @param {Object} updates - Event updates to apply
 * @returns {Promise<Object>} { successes: [], failures: [], totalAccounts: N }
 */
export async function broadcastUpdateEvent(env, chatId, botEventUid, updates) {
  const { getEventMappings, getGoogleConnection } = await import('./persistence.js');
  const { getValidAccessTokenForConnection } = await import('./oauth.js');
  
  const mappings = await getEventMappings(env, chatId, botEventUid);
  
  if (mappings.length === 0) {
    throw new Error('Event not found or already deleted');
  }
  
  const results = {
    successes: [],
    failures: [],
    totalAccounts: mappings.length
  };
  
  // Fan out to all mappings
  for (const mapping of mappings) {
    try {
      // Get connection
      const conn = await getGoogleConnection(env, chatId, mapping.google_sub);
      
      if (!conn || conn.revoked) {
        results.failures.push({
          email: `(disconnected: ${mapping.google_sub})`,
          reason: 'Account disconnected',
          details: 'Connection no longer active'
        });
        continue;
      }
      
      // Get valid access token
      const accessToken = await getValidAccessTokenForConnection(env, conn);
      
      if (!accessToken) {
        results.failures.push({
          email: conn.google_email,
          reason: 'Token refresh failed',
          details: 'Please reconnect this account'
        });
        continue;
      }
      
      // Update event
      const result = await updateEvent(accessToken, mapping.google_event_id, updates);
      
      if (result.ok) {
        results.successes.push({
          email: conn.google_email,
          eventId: mapping.google_event_id
        });
      } else {
        results.failures.push({
          email: conn.google_email,
          reason: 'Update failed',
          details: result.message || 'Unknown error'
        });
      }
      
    } catch (error) {
      console.error(`Failed to update event for mapping ${mapping.google_sub}:`, error);
      results.failures.push({
        email: `(${mapping.google_sub})`,
        reason: 'Exception',
        details: error.message
      });
    }
  }
  
  return results;
}

/**
 * Broadcast delete event to all connected accounts in workspace
 * @param {Object} env - Worker environment
 * @param {string} chatId - Telegram chat ID
 * @param {string} botEventUid - Bot event UID
 * @returns {Promise<Object>} { successes: [], failures: [], totalAccounts: N }
 */
export async function broadcastDeleteEvent(env, chatId, botEventUid) {
  const { getEventMappings, getGoogleConnection, deleteEventMapping } = await import('./persistence.js');
  const { getValidAccessTokenForConnection } = await import('./oauth.js');
  
  const mappings = await getEventMappings(env, chatId, botEventUid);
  
  if (mappings.length === 0) {
    throw new Error('Event not found or already deleted');
  }
  
  const results = {
    successes: [],
    failures: [],
    totalAccounts: mappings.length
  };
  
  // Fan out to all mappings
  for (const mapping of mappings) {
    try {
      // Get connection
      const conn = await getGoogleConnection(env, chatId, mapping.google_sub);
      
      if (!conn || conn.revoked) {
        // Still delete the mapping even if connection is gone
        await deleteEventMapping(env, chatId, botEventUid, mapping.google_sub);
        results.successes.push({
          email: `(disconnected: ${mapping.google_sub})`,
          note: 'Mapping removed (account disconnected)'
        });
        continue;
      }
      
      // Get valid access token
      const accessToken = await getValidAccessTokenForConnection(env, conn);
      
      if (!accessToken) {
        results.failures.push({
          email: conn.google_email,
          reason: 'Token refresh failed',
          details: 'Mapping will remain until reconnected'
        });
        continue;
      }
      
      // Delete event
      const result = await deleteEvent(accessToken, mapping.google_event_id);
      
      if (result.ok) {
        // Delete mapping
        await deleteEventMapping(env, chatId, botEventUid, mapping.google_sub);
        
        results.successes.push({
          email: conn.google_email,
          eventId: mapping.google_event_id
        });
      } else {
        results.failures.push({
          email: conn.google_email,
          reason: 'Deletion failed',
          details: result.message || 'Unknown error'
        });
      }
      
    } catch (error) {
      console.error(`Failed to delete event for mapping ${mapping.google_sub}:`, error);
      
      // Special case: if 404/410 (already deleted), consider it success and clean up mapping
      if (error.message.includes('404') || error.message.includes('410')) {
        await deleteEventMapping(env, chatId, botEventUid, mapping.google_sub);
        results.successes.push({
          email: `(${mapping.google_sub})`,
          note: 'Already deleted'
        });
      } else {
        results.failures.push({
          email: `(${mapping.google_sub})`,
          reason: 'Exception',
          details: error.message
        });
      }
    }
  }
  
  return results;
}
