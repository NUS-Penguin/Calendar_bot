/**
 * Event merge utilities for partial updates (#alt command)
 * Combines existing event + LM patch → new event payload
 */

/**
 * Merge existing event with patch from LM
 * Preserves fields not present in patch
 * Handles all-day <-> timed conversions
 * 
 * @param {Object} existing - Current event data
 * @param {Object} patch - Patch object from LM (only changed fields)
 * @param {string} timezone - Timezone for date calculations
 * @returns {Object} - Merged event ready for Google Calendar API
 */
export function mergeEventPatch(existing, patch, timezone = 'Asia/Singapore') {
  const merged = { ...existing };
  
  // 1. Handle all-day conversion explicitly
  if ('allDay' in patch) {
    if (patch.allDay === true) {
      // Convert timed → all-day
      merged.allDay = true;
      
      // Use patch dates if provided, else extract from existing start
      if (patch.startDate) {
        merged.startDate = patch.startDate;
        merged.endDate = patch.endDate || addDays(patch.startDate, 1);
      } else if (existing.start) {
        // Extract date from existing timed event
        merged.startDate = existing.start.split('T')[0];
        merged.endDate = addDays(merged.startDate, 1);
      }
      
      // Remove timed fields
      delete merged.start;
      delete merged.end;
      
    } else if (patch.allDay === false) {
      // Convert all-day → timed
      merged.allDay = false;
      
      // Use patch times if provided
      if (patch.start && patch.end) {
        merged.start = patch.start;
        merged.end = patch.end;
      } else if (patch.start) {
        merged.start = patch.start;
        merged.end = addMinutes(patch.start, existing.duration || 60);
      } else {
        // Default: 9am on existing date
        const date = existing.startDate || existing.start.split('T')[0];
        merged.start = `${date}T09:00:00${getTimezoneOffset(timezone)}`;
        merged.end = addMinutes(merged.start, 60);
      }
      
      // Remove all-day fields
      delete merged.startDate;
      delete merged.endDate;
    }
  }
  
  // 2. Handle date/time changes for timed events
  if (!merged.allDay) {
    if (patch.start && patch.end) {
      // Both start and end provided - use directly
      merged.start = patch.start;
      merged.end = patch.end;
      
    } else if (patch.start) {
      // Only start time changed - preserve duration
      merged.start = patch.start;
      
      if (existing.start && existing.end) {
        // Calculate existing duration
        const existingDuration = calculateDuration(existing.start, existing.end);
        merged.end = addMinutes(patch.start, existingDuration);
      } else {
        // Default to 60 minutes
        merged.end = addMinutes(patch.start, 60);
      }
      
    } else if (patch.end) {
      // Only end time changed
      merged.end = patch.end;
    }
  }
  
  // 3. Handle date/time changes for all-day events
  if (merged.allDay) {
    if (patch.startDate) {
      merged.startDate = patch.startDate;
      merged.endDate = patch.endDate || addDays(patch.startDate, 1);
    }
  }
  
  // 4. Handle title change
  if (patch.title !== undefined) {
    merged.title = patch.title || 'Event';  // Default to "Event" if empty
  }
  
  // 5. Handle location change
  if (patch.location !== undefined) {
    merged.location = patch.location;
  }
  
  // 6. Handle notes change
  if (patch.notes !== undefined) {
    merged.notes = patch.notes;
  }
  
  // 7. Handle type change
  if (patch.type !== undefined) {
    merged.type = patch.type;
  }
  
  // 8. Validate result
  if (!merged.allDay && (!merged.start || !merged.end)) {
    throw new Error('Invalid merged event: timed event missing start or end');
  }
  
  if (merged.allDay && (!merged.startDate || !merged.endDate)) {
    throw new Error('Invalid merged event: all-day event missing startDate or endDate');
  }
  
  return merged;
}

/**
 * Calculate duration between two ISO timestamps in minutes
 */
function calculateDuration(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return Math.round((end - start) / 60000);  // milliseconds to minutes
}

/**
 * Add minutes to ISO timestamp
 */
function addMinutes(iso, minutes) {
  const date = new Date(iso);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString().replace('Z', '+08:00');  // Preserve timezone format
}

/**
 * Add days to YYYY-MM-DD date string
 */
function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Get timezone offset string (e.g., "+08:00")
 */
function getTimezoneOffset(timezone) {
  // Simplified - assumes Asia/Singapore = +08:00
  // For production, use a proper timezone library
  return '+08:00';
}

/**
 * Generate a human-readable summary of what changed
 * 
 * @param {Object} existing - Original event
 * @param {Object} merged - Updated event
 * @returns {string} - Summary like "Moved to Jan 10, 3pm"
 */
export function generateChangeSummary(existing, merged) {
  const changes = [];
  
  // Check title change
  if (existing.title !== merged.title) {
    changes.push(`renamed to "${merged.title}"`);
  }
  
  // Check all-day conversion
  if (existing.allDay !== merged.allDay) {
    if (merged.allDay) {
      changes.push('converted to all-day event');
    } else {
      changes.push('converted to timed event');
    }
  }
  
  // Check date/time changes
  if (!merged.allDay) {
    // Timed event
    const oldStart = existing.start;
    const newStart = merged.start;
    
    if (oldStart !== newStart) {
      const oldDate = oldStart.split('T')[0];
      const newDate = newStart.split('T')[0];
      const oldTime = formatTime(oldStart);
      const newTime = formatTime(newStart);
      
      if (oldDate !== newDate && oldTime !== newTime) {
        changes.push(`moved to ${formatDate(newDate)} at ${newTime}`);
      } else if (oldDate !== newDate) {
        changes.push(`moved to ${formatDate(newDate)}`);
      } else if (oldTime !== newTime) {
        changes.push(`time changed to ${newTime}`);
      }
    }
    
    // Check end time
    if (existing.end !== merged.end) {
      const oldEnd = formatTime(existing.end);
      const newEnd = formatTime(merged.end);
      if (oldEnd !== newEnd) {
        changes.push(`end time changed to ${newEnd}`);
      }
    }
    
  } else {
    // All-day event
    if (existing.startDate !== merged.startDate) {
      changes.push(`moved to ${formatDate(merged.startDate)}`);
    }
  }
  
  // Check location change
  if (existing.location !== merged.location) {
    if (merged.location) {
      changes.push(`location set to "${merged.location}"`);
    } else {
      changes.push('location removed');
    }
  }
  
  if (changes.length === 0) {
    return 'No changes detected';
  }
  
  return changes.join(', ');
}

/**
 * Format ISO timestamp to readable time (e.g., "3:00 PM")
 */
function formatTime(iso) {
  const date = new Date(iso);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

/**
 * Format YYYY-MM-DD to readable date (e.g., "Jan 10")
 */
function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Validate patch has at least one field
 */
export function validatePatch(patch) {
  const hasChanges = Object.keys(patch).length > 0;
  if (!hasChanges) {
    return {
      valid: false,
      error: 'No changes detected in your message. Please specify what you want to update (date, time, or title).'
    };
  }
  return { valid: true };
}
