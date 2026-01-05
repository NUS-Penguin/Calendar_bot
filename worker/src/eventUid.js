/**
 * Event UID generation and resolution utilities
 * Used for tracking events across multiple Google Calendar accounts
 */

/**
 * Generate a stable, unique bot event UID
 * Uses crypto.randomUUID() for simplicity
 * Format: EVT-<short-hash>
 * 
 * @returns {string} Event UID like "EVT-7a3f9c21"
 */
export function generateEventUID() {
  // Use crypto.randomUUID() and take first 8 chars
  const uuid = crypto.randomUUID();
  const shortId = uuid.split('-')[0]; // First segment of UUID
  return `EVT-${shortId}`;
}

/**
 * Parse event UID from user input
 * Supports formats:
 * - EVT-7a3f9c21 (direct reference)
 * - #del EVT-7a3f9c21
 * 
 * @param {string} text - User input
 * @returns {string|null} Extracted UID or null
 */
export function extractEventUID(text) {
  const match = text.match(/EVT-[0-9a-f]{8}/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Validate event UID format
 * @param {string} uid - Event UID to validate
 * @returns {boolean}
 */
export function isValidEventUID(uid) {
  return /^EVT-[0-9a-f]{8}$/i.test(uid);
}

/**
 * Resolve event UID from user input (fuzzy matching for legacy support)
 * This is for backward compatibility when migrating from per-user selected events
 * 
 * @param {Object} env - Worker environment
 * @param {string} chatId - Chat ID
 * @param {string} userId - User ID (for fallback to selected event)
 * @param {string|null} input - User input (may contain EVT-xxx or null)
 * @returns {Promise<string|null>} Resolved bot_event_uid or null
 */
export async function resolveEventUID(env, chatId, userId, input = null) {
  // Try to extract explicit UID from input
  if (input) {
    const extracted = extractEventUID(input);
    if (extracted && isValidEventUID(extracted)) {
      return extracted;
    }
  }
  
  // Fallback: get last selected event for this user (legacy support)
  const { getSelectedEvent } = await import('./persistence.js');
  const selected = await getSelectedEvent(env, chatId, userId);
  
  if (selected && selected.bot_event_uid) {
    return selected.bot_event_uid;
  }
  
  return null;
}
