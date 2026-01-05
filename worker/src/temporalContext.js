/**
 * Temporal Context Provider
 * 
 * RESPONSIBILITY: System-side temporal reasoning
 * - Provides current date, year, timezone
 * - Computes week boundaries
 * - Generates reference windows for LLM
 * - NO date logic should be in the LLM
 */

/**
 * Build complete temporal context for LLM parsing
 * 
 * @param {string} timezone - IANA timezone (e.g., "Asia/Singapore")
 * @param {Date} now - Current date/time (for testing, defaults to Date.now())
 * @returns {Object} Temporal context with all required fields
 */
export function buildTemporalContext(timezone = 'Asia/Singapore', now = null) {
  const currentDate = now ? new Date(now) : new Date();
  
  // Convert to target timezone
  const tzDate = new Date(currentDate.toLocaleString('en-US', { timeZone: timezone }));
  
  // Today's date in YYYY-MM-DD format
  const todayDate = formatDate(tzDate);
  
  // Week boundaries (Monday-Sunday)
  const weekStart = getWeekStart(tzDate);
  const weekEnd = getWeekEnd(tzDate);
  
  // Next week boundaries
  const nextWeekStart = addDays(weekStart, 7);
  const nextWeekEnd = addDays(weekEnd, 7);
  
  // Reference window: today + 2 weeks (adjustable)
  const referenceStart = todayDate;
  const referenceEnd = formatDate(addDays(tzDate, 14));
  
  return {
    todayDate,
    timezone,
    weekStartsOn: 'Monday',
    currentWeek: {
      start: formatDate(weekStart),
      end: formatDate(weekEnd)
    },
    nextWeek: {
      start: formatDate(nextWeekStart),
      end: formatDate(nextWeekEnd)
    },
    referenceWindow: {
      start: referenceStart,
      end: referenceEnd
    },
    // Additional context
    year: tzDate.getFullYear(),
    month: tzDate.getMonth() + 1,
    dayOfWeek: getDayName(tzDate),
    timestamp: currentDate.toISOString()
  };
}

/**
 * Get the start of the current week (Monday)
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday = 1, Sunday = 0
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the current week (Sunday)
 */
function getWeekEnd(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? 0 : 7 - day); // Sunday = 0
  d.setDate(d.getDate() + diff);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Add days to a date
 */
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get day name (Monday, Tuesday, etc.)
 */
function getDayName(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

/**
 * Resolve "next Monday", "this Friday", "tomorrow" etc.
 * 
 * SYSTEM RESPONSIBILITY: Compute concrete dates from relative references
 * 
 * @param {string} relativeDate - "tomorrow", "next monday", "this friday"
 * @param {Object} context - Temporal context from buildTemporalContext()
 * @returns {string} YYYY-MM-DD date string
 */
export function resolveRelativeDate(relativeDate, context) {
  const input = relativeDate.toLowerCase().trim();
  const today = new Date(context.todayDate + 'T00:00:00');
  
  // Tomorrow
  if (input.match(/^(tmr|tomorrow)$/)) {
    return formatDate(addDays(today, 1));
  }
  
  // Today
  if (input.match(/^today$/)) {
    return context.todayDate;
  }
  
  // Yesterday (for reference)
  if (input.match(/^yesterday$/)) {
    return formatDate(addDays(today, -1));
  }
  
  // Weekday resolution: "next monday", "this friday"
  const weekdayMatch = input.match(/^(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (weekdayMatch) {
    const modifier = weekdayMatch[1]; // "next" or "this"
    const targetDay = weekdayMatch[2];
    return resolveWeekday(targetDay, modifier, today, context);
  }
  
  // "in X days"
  const daysMatch = input.match(/^in\s+(\d+)\s+days?$/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    return formatDate(addDays(today, days));
  }
  
  // "next week"
  if (input.match(/^next\s+week$/)) {
    return context.nextWeek.start;
  }
  
  // "this week"
  if (input.match(/^this\s+week$/)) {
    return context.currentWeek.start;
  }
  
  // If no match, return null (caller should handle)
  return null;
}

/**
 * Resolve "next Monday", "this Friday" to concrete date
 * 
 * RULES:
 * - "this [weekday]": upcoming occurrence in current week, or today if it's that day
 * - "next [weekday]": upcoming occurrence in next week
 */
function resolveWeekday(targetDay, modifier, today, context) {
  const dayMap = {
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6,
    'sunday': 0
  };
  
  const targetDayNum = dayMap[targetDay];
  const todayDayNum = today.getDay();
  
  if (modifier === 'this') {
    // "this friday": find the next occurrence within this week
    let daysUntil = targetDayNum - todayDayNum;
    if (daysUntil < 0) {
      // Already passed this week, assume next week
      daysUntil += 7;
    }
    return formatDate(addDays(today, daysUntil));
  } else if (modifier === 'next') {
    // "next friday": next week's occurrence
    let daysUntil = targetDayNum - todayDayNum;
    if (daysUntil <= 0) {
      daysUntil += 7;
    } else {
      daysUntil += 7; // Always next week
    }
    return formatDate(addDays(today, daysUntil));
  }
  
  return null;
}

/**
 * Format temporal context for LLM prompt
 * 
 * MANDATORY LLM INPUT CONTRACT
 */
export function formatTemporalContextForLLM(context) {
  return `TodayDate: ${context.todayDate}
Timezone: ${context.timezone}
WeekStartsOn: ${context.weekStartsOn}
CurrentWeek: ${context.currentWeek.start} to ${context.currentWeek.end}
NextWeek: ${context.nextWeek.start} to ${context.nextWeek.end}
ReferenceWindow:
  start: ${context.referenceWindow.start}
  end: ${context.referenceWindow.end}`;
}

/**
 * Get timezone offset string (e.g., "+08:00" for Asia/Singapore)
 */
export function getTimezoneOffset(timezone) {
  // Simplified mapping (production should use proper timezone library)
  const offsets = {
    'Asia/Singapore': '+08:00',
    'America/New_York': '-05:00',
    'Europe/London': '+00:00',
    'America/Los_Angeles': '-08:00',
    'UTC': '+00:00'
  };
  
  return offsets[timezone] || '+00:00';
}

/**
 * Detect timezone from Google Calendar settings (to be called after OAuth)
 * 
 * @param {string} accessToken - OAuth access token
 * @returns {string} IANA timezone string
 */
export async function detectTimezoneFromCalendar(accessToken) {
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      console.warn('Failed to fetch timezone from Calendar, using default');
      return 'Asia/Singapore';
    }
    
    const data = await response.json();
    return data.value || 'Asia/Singapore';
  } catch (error) {
    console.error('Error detecting timezone:', error);
    return 'Asia/Singapore';
  }
}
