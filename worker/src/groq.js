/**
 * Groq LLM API client for parsing event text
 */

/**
 * Parse alteration text for PARTIAL event updates
 * Returns a PATCH object indicating which fields should change
 */
export async function parseEventAlteration(text, existingEvent, env, nowIso = null, tz = 'Asia/Singapore') {
  const now = nowIso || new Date().toISOString();
  const systemPrompt = buildAlterationPrompt(now, tz || env.TIMEZONE, existingEvent);
  
  console.log('Calling Groq API for alteration...');
  console.log('Existing event:', JSON.stringify(existingEvent));
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: 'json_object' }
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Groq API error:', error);
    throw new Error(`Groq API error: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  const content = data.choices[0].message.content;
  
  console.log('Groq alteration response:', content);
  
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to parse Groq JSON:', content);
    throw new Error(`Failed to parse Groq response as JSON: ${content}`);
  }
}

export async function parseEventText(text, env, temporalContext) {
  const systemPrompt = buildSystemPrompt(temporalContext, text);
  
  console.log('Calling Groq API with temporal context...');
  console.log('Temporal context:', temporalContext);
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', // Fast, accurate, free tier
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Groq API error:', error);
    throw new Error(`Groq API error: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  const content = data.choices[0].message.content;
  
  console.log('Groq response:', content);
  
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to parse Groq JSON:', content);
    throw new Error(`Failed to parse Groq response as JSON: ${content}`);
  }
}

function buildSystemPrompt(temporalContext, userInput) {
  const tzOffset = getTimezoneOffsetFromContext(temporalContext);
  
  return `You are a calendar event parser with EXPLICIT temporal grounding.

${temporalContext}

UserInput: "${userInput}"

**YOUR RESPONSIBILITY:**
- Parse text → structured intent
- Extract title, time, location, notes
- Map weekdays to dates using the provided CurrentWeek/NextWeek
- DO NOT compute dates yourself
- DO NOT guess the year
- DO NOT infer missing temporal data

**SYSTEM RESPONSIBILITY (already done for you):**
- Resolves "next Monday" → concrete date
- Handles "tomorrow" → concrete date
- Supplies current year, timezone, week boundaries
- YOU receive already-resolved temporal context

**CRITICAL RULES:**

1. **Use provided temporal context:**
   - TodayDate is authoritative
   - "tomorrow" = TodayDate + 1 day
   - "next Monday" = use NextWeek.start
   - "this Friday" = use CurrentWeek dates

2. **Weekday mapping:**
   - "next Monday" → NextWeek.start (already computed)
   - "this Friday" → find Friday in CurrentWeek
   - "Friday" (alone) → if today < Friday, use CurrentWeek; else NextWeek

3. **Date format requirements:**
   - Timed events: ISO-8601 with timezone (e.g., "2026-01-15T14:00:00${tzOffset}")
   - All-day events: YYYY-MM-DD (e.g., "2026-01-15")
   - ALWAYS use the year from TodayDate

4. **Title extraction (clean):**
   - "Running 19th Jan" → title: "Running"
   - "Team meeting tomorrow 3pm" → title: "Team meeting"
   - Remove dates/times from title

5. **Defaults:**
   - No title → "Event"
   - No time → allDay: true
   - Timed event duration → 1 hour

**OUTPUT SCHEMA:**

For timed events:
{
  "title": "Meeting with John",
  "allDay": false,
  "start": "2026-01-15T14:00:00${tzOffset}",
  "end": "2026-01-15T15:00:00${tzOffset}",
  "location": "Conference Room A",
  "notes": "Discuss Q1 budget",
  "confidence": "high",
  "clarificationNeeded": false,
  "clarificationQuestion": null
}

For all-day events:
{
  "title": "Submit Report",
  "allDay": true,
  "startDate": "2026-01-20",
  "endDate": "2026-01-21",
  "location": "",
  "notes": "",
  "confidence": "high",
  "clarificationNeeded": false,
  "clarificationQuestion": null
}

**Confidence levels:**
- "high": Clear date/time with explicit user input
- "medium": Relative date (tomorrow, next week) resolved using context
- "low": Ambiguous or missing information

**Clarification triggers:**
- Ambiguous date outside ReferenceWindow
- Conflicting information
- Missing critical information (no date at all)

**EXAMPLES:**

Input: "team sync next Monday at 3"
Context shows: NextWeek.start = "2026-01-12"
Output: {"title":"Team sync","allDay":false,"start":"2026-01-12T15:00:00${tzOffset}","end":"2026-01-12T16:00:00${tzOffset}","location":"","notes":"","confidence":"high","clarificationNeeded":false,"clarificationQuestion":null}

Input: "submit report Friday"
Context shows: TodayDate = "2026-01-05" (Monday), CurrentWeek has Friday = "2026-01-09"
Output: {"title":"Submit Report","allDay":true,"startDate":"2026-01-09","endDate":"2026-01-10","location":"","notes":"","confidence":"high","clarificationNeeded":false,"clarificationQuestion":null}

Input: "meeting next year"
Output: {"title":"Meeting","allDay":true,"startDate":"2027-01-05","endDate":"2027-01-06","location":"","notes":"","confidence":"low","clarificationNeeded":true,"clarificationQuestion":"Do you mean January 2027? Please specify the month and date."}

Input: "call someone sometime"
Output: {"title":"Call","allDay":false,"start":"2026-01-05T09:00:00${tzOffset}","end":"2026-01-05T10:00:00${tzOffset}","location":"","notes":"","confidence":"low","clarificationNeeded":true,"clarificationQuestion":"When would you like to schedule this call? Please provide a date or time."}

**RETURN ONLY JSON. No markdown. No explanation. No assumptions beyond the provided context.**`;
}

function getTimezoneOffsetFromContext(temporalContext) {
  // Extract timezone offset from context
  const offsets = {
    'Asia/Singapore': '+08:00',
    'America/New_York': '-05:00',
    'Europe/London': '+00:00',
    'America/Los_Angeles': '-08:00',
    'UTC': '+00:00'
  };
  
  return offsets[temporalContext.split('\n')[1]?.split(': ')[1]] || '+08:00';
}

function buildAlterationPrompt(nowIso, tz, existingEvent) {
  const existingJson = JSON.stringify(existingEvent, null, 2);
  
  return `You are a calendar event ALTERATION parser. Current time: ${nowIso} (${tz}).

**EXISTING EVENT:**
${existingJson}

The user wants to MODIFY this event. Parse their text to identify ONLY the fields they want to change.

**CRITICAL RULES:**
1. Output a PATCH - ONLY include fields that should CHANGE
2. Preserve fields NOT mentioned by the user
3. Date/time changes must respect the event's current type:
   - If currently timed, updating only date preserves time
   - If currently all-day, updating only time converts to timed
   - If user says "all day", convert to all-day event
4. Duration preservation:
   - If updating start time only, preserve existing duration
   - If user specifies end time, use it
   - Default new timed events to 1 hour

**OUTPUT SCHEMA:**
{
  "intent": "PATCH_EVENT",
  "fields_present": {
    "title": false,
    "date": true,
    "start_time": false,
    "end_time": false,
    "duration": false,
    "allDay": false,
    "location": false,
    "notes": false
  },
  "patch": {
    // ONLY include fields that should change
    // Example: {"start": "2026-01-10T15:00:00+08:00", "end": "2026-01-10T16:00:00+08:00"}
  },
  "interpretation": {
    "summary": "Move to January 10th, keep 3-4pm time"
  },
  "confidence": 0.9,
  "needs_clarification": false,
  "clarification_question": null
}

**FIELD DETECTION RULES:**

1. **Title change**: User provides a new name without date/time keywords
   - "project sync" → change title only
   - "team standup" → change title only
   
2. **Date change**: User provides date but no time
   - "next fri" → change date, preserve time
   - "12 jan" → change to Jan 12, preserve time
   - "tomorrow" → change to tomorrow, preserve time
   
3. **Time change**: User provides time but no date
   - "3pm" → change time to 15:00, preserve date
   - "2-3pm" → change to 14:00-15:00, preserve date
   - "7ish" → change to 19:00, preserve date
   
4. **Date + Time change**: User provides both
   - "next fri 3pm" → change to next Friday at 15:00
   - "12 jan 2pm" → change to Jan 12 at 14:00
   
5. **All-day conversion**: User says "all day"
   - "all day" → convert to all-day, use date from existing start
   - "all day tmr" → convert to all-day tomorrow
   
6. **Location change**: User mentions a place
   - "at conference room b" → change location only
   - "zoom link" → change location only
   
7. **Duration change**: User provides explicit duration
   - "30 mins" → change duration to 30 minutes
   - "2 hours" → change duration to 2 hours

**CONFIDENCE SCORING:**
- 0.9-1.0: Clear, unambiguous change
- 0.7-0.9: Clear intent, minor ambiguity
- 0.5-0.7: Requires assumption about intent
- 0.0-0.5: Ambiguous - set needs_clarification=true

**CLARIFICATION TRIGGERS:**
- User text is too vague ("change it", "update")
- Ambiguous date ("this friday" when today is Friday)
- Conflicting information ("3pm" when existing is all-day - ask if convert to timed)
- No recognizable change detected

**EXAMPLES:**

Existing: {"title":"Meeting","allDay":false,"start":"2026-01-10T15:00:00+08:00","end":"2026-01-10T16:00:00+08:00"}
Input: "next fri"
Output: {"intent":"PATCH_EVENT","fields_present":{"date":true},"patch":{"start":"2026-01-09T15:00:00+08:00","end":"2026-01-09T16:00:00+08:00"},"interpretation":{"summary":"Move to Friday Jan 9, keep 3-4pm"},"confidence":0.95,"needs_clarification":false,"clarification_question":null}

Existing: {"title":"Submit Report","allDay":true,"startDate":"2026-01-09","endDate":"2026-01-10"}
Input: "3pm"
Output: {"intent":"PATCH_EVENT","fields_present":{"start_time":true,"allDay":true},"patch":{"allDay":false,"start":"2026-01-09T15:00:00+08:00","end":"2026-01-09T16:00:00+08:00"},"interpretation":{"summary":"Convert to timed event at 3pm on Jan 9"},"confidence":0.85,"needs_clarification":false,"clarification_question":null}

Existing: {"title":"Event","allDay":false,"start":"2026-01-10T14:00:00+08:00","end":"2026-01-10T15:00:00+08:00"}
Input: "project sync"
Output: {"intent":"PATCH_EVENT","fields_present":{"title":true},"patch":{"title":"Project sync"},"interpretation":{"summary":"Rename to 'Project sync'"},"confidence":0.95,"needs_clarification":false,"clarification_question":null}

Existing: {"title":"Meeting","allDay":false,"start":"2026-01-10T15:00:00+08:00","end":"2026-01-10T16:00:00+08:00"}
Input: "all day"
Output: {"intent":"PATCH_EVENT","fields_present":{"allDay":true},"patch":{"allDay":true,"startDate":"2026-01-10","endDate":"2026-01-11"},"interpretation":{"summary":"Convert to all-day event on Jan 10"},"confidence":0.95,"needs_clarification":false,"clarification_question":null}

Existing: {"title":"Call","allDay":false,"start":"2026-01-10T10:00:00+08:00","end":"2026-01-10T11:00:00+08:00"}
Input: "change it"
Output: {"intent":"PATCH_EVENT","fields_present":{},"patch":{},"interpretation":{"summary":"No specific change detected"},"confidence":0.1,"needs_clarification":true,"clarification_question":"What would you like to change? You can update the date (e.g. 'next fri'), time (e.g. '3pm'), or title (e.g. 'team meeting')."}

Existing: {"title":"Dentist","allDay":false,"start":"2026-01-15T14:00:00+08:00","end":"2026-01-15T14:30:00+08:00"}
Input: "12 jan 3-5pm"
Output: {"intent":"PATCH_EVENT","fields_present":{"date":true,"start_time":true,"end_time":true},"patch":{"start":"2026-01-12T15:00:00+08:00","end":"2026-01-12T17:00:00+08:00"},"interpretation":{"summary":"Move to Jan 12, 3-5pm"},"confidence":0.95,"needs_clarification":false,"clarification_question":null}

**IMPORTANT**: Return ONLY the JSON object, no markdown formatting, no explanation.`;
}

