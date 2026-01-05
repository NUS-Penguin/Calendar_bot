/**
 * Event validation and normalization
 */

export function validateAndNormalize(parsed, env) {
  // Check confidence threshold
  if (parsed.confidence < 0.5) {
    return {
      valid: false,
      question: 'Could you provide a clearer date/time?\n\n**Examples:**\n• "tomorrow 3pm"\n• "Jan 15 at 2:00pm"\n• "next Friday 10am"'
    };
  }
  
  // Validate timed event
  if (!parsed.allDay) {
    if (!parsed.start || !parsed.title) {
      return {
        valid: false,
        question: 'Missing event title or start time. Please provide both.\n\n**Example:** "team meeting tomorrow 3pm"'
      };
    }
    
    // Default end time if missing (1 hour after start)
    if (!parsed.end) {
      const start = new Date(parsed.start);
      const durationMinutes = env.DEFAULT_DURATION_MINUTES || 60;
      const end = new Date(start.getTime() + durationMinutes * 60000);
      
      // Format with timezone
      const endIso = end.toISOString().replace('Z', '');
      parsed.end = endIso + '+08:00';
    }
    
    // Validate start is before end
    if (new Date(parsed.start) >= new Date(parsed.end)) {
      return {
        valid: false,
        question: 'Start time must be before end time. Please check your times.'
      };
    }
    
    return { valid: true, event: parsed };
  }
  
  // Validate all-day event
  if (parsed.allDay) {
    if (!parsed.startDate || !parsed.title) {
      return {
        valid: false,
        question: 'Missing event title or date. Please provide both.\n\n**Example:** "running 19th jan"'
      };
    }
    
    // Ensure endDate is set (next day for single-day events)
    if (!parsed.endDate) {
      const start = new Date(parsed.startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      parsed.endDate = end.toISOString().split('T')[0];
    }
    
    // Validate startDate is before endDate
    if (new Date(parsed.startDate) >= new Date(parsed.endDate)) {
      return {
        valid: false,
        question: 'Start date must be before end date.'
      };
    }
    
    return { valid: true, event: parsed };
  }
  
  return {
    valid: false,
    question: 'Could not parse event. Please provide date and time clearly.'
  };
}
