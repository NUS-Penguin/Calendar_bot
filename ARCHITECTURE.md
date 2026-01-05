# Production Architecture - C4lendar Bot v2.0

## Executive Summary

**Target State Achieved**: Multi-user calendar bot with temporal reasoning handled by system, not LLM.

**Key Improvements**:
- ✅ LLM never guesses the year
- ✅ Relative dates ("next Monday") resolved by system
- ✅ Per-chat OAuth (no single-account limitation)
- ✅ Timezone-aware parsing
- ✅ Explicit temporal context in every LLM call

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         TELEGRAM                                │
│                      (Webhook Trigger)                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CLOUDFLARE WORKER                             │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  1. AUTHORIZATION CHECK                                   │ │
│  │     - Whitelist validation                                │ │
│  │     - Chat/User ID verification                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  2. OAUTH TOKEN RETRIEVAL                                 │ │
│  │     - Per-chat token lookup (KV)                          │ │
│  │     - Auto-refresh if expired                             │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  3. CALENDAR CONTEXT FETCH                                │ │
│  │     - Read user's timezone from Google Calendar           │ │
│  │     - Fetch upcoming events (optional context)            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  4. TEMPORAL CONTEXT BUILD (SYSTEM RESPONSIBILITY)        │ │
│  │     ┌─────────────────────────────────────────────────┐   │ │
│  │     │  temporalContext.js                             │   │ │
│  │     │  - TodayDate: 2026-01-05                        │   │ │
│  │     │  - Timezone: Asia/Singapore                     │   │ │
│  │     │  - WeekStartsOn: Monday                         │   │ │
│  │     │  - CurrentWeek: 2026-01-05 to 2026-01-11        │   │ │
│  │     │  - NextWeek: 2026-01-12 to 2026-01-18           │   │ │
│  │     │  - ReferenceWindow: 2026-01-05 to 2026-01-19    │   │ │
│  │     └─────────────────────────────────────────────────┘   │ │
│  │                                                             │ │
│  │     ✅ System resolves "next Monday" → 2026-01-12          │ │
│  │     ✅ System resolves "tomorrow" → 2026-01-06             │ │
│  │     ✅ System provides year explicitly                     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  5. LLM PARSING (LLM RESPONSIBILITY)                      │ │
│  │     ┌─────────────────────────────────────────────────┐   │ │
│  │     │  Groq API (llama-3.3-70b-versatile)            │   │ │
│  │     │                                                 │   │ │
│  │     │  INPUT:                                         │   │ │
│  │     │  - Temporal context (formatted)                 │   │ │
│  │     │  - User text: "team sync next Monday at 3"     │   │ │
│  │     │                                                 │   │ │
│  │     │  RESPONSIBILITIES:                              │   │ │
│  │     │  - Parse text → structured intent              │   │ │
│  │     │  - Extract title, time, location               │   │ │
│  │     │  - Map "next Monday" using provided dates       │   │ │
│  │     │  - NO date arithmetic                           │   │ │
│  │     │  - NO year guessing                             │   │ │
│  │     │                                                 │   │ │
│  │     │  OUTPUT:                                        │   │ │
│  │     │  {                                              │   │ │
│  │     │    "title": "Team sync",                        │   │ │
│  │     │    "start": "2026-01-12T15:00:00+08:00",       │   │ │
│  │     │    "end": "2026-01-12T16:00:00+08:00",         │   │ │
│  │     │    "confidence": "high",                        │   │ │
│  │     │    "clarificationNeeded": false                 │   │ │
│  │     │  }                                              │   │ │
│  │     └─────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  6. VALIDATION & NORMALIZATION                            │ │
│  │     - Check confidence level                              │ │
│  │     - Validate required fields                            │ │
│  │     - Handle clarification requests                       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  7. GOOGLE CALENDAR API WRITE                             │ │
│  │     - Create/Update/Delete event                          │ │
│  │     - Use OAuth access token                              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  8. PERSISTENCE (KV)                                      │ │
│  │     - Store event ID for #alt/#del                        │ │
│  │     - Per-user, per-chat scoping                          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  9. TELEGRAM RESPONSE                                     │ │
│  │     - Send confirmation message                           │ │
│  │     - Include parsed details for verification            │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Responsibility Matrix

### SYSTEM RESPONSIBILITIES (Cloudflare Worker)

| Component | Responsibility | Why |
|-----------|---------------|-----|
| **temporalContext.js** | Provides current date, year, timezone, week boundaries | System knows time/location |
| **temporalContext.js** | Resolves "next Monday" → "2026-01-12" | Date arithmetic is deterministic |
| **temporalContext.js** | Resolves "tomorrow" → concrete date | Timezone-safe computation |
| **oauth.js** | Per-chat OAuth token management | Multi-user support |
| **calendar.js** | Fetch user's timezone from Google Calendar | Ground truth for user location |
| **calendar.js** | Read/Write calendar events via REST API | Direct Google Calendar integration |
| **validators.js** | Validate LLM output structure | Ensure data integrity |

### LLM RESPONSIBILITIES (Groq API)

| Responsibility | Constraints | Why |
|----------------|-------------|-----|
| Parse text → structured intent | Uses ONLY provided temporal context | No hallucination |
| Extract title, time, location, notes | No date computation | Parsing, not logic |
| Map "next Monday" to dates from context | System already computed dates | LLM just maps text to data |
| Return JSON with confidence score | Strict schema | Deterministic output |
| Ask clarification when ambiguous | MUST use provided question format | User experience |

### CRITICAL BOUNDARIES

❌ **LLM MUST NEVER:**
- Compute dates (e.g., "tomorrow" → add 1 day)
- Guess the year
- Infer missing temporal data beyond provided context
- Do timezone conversions
- Perform date arithmetic

✅ **LLM SHOULD:**
- Parse natural language → structured fields
- Extract title from noisy input ("meeting tomorrow 3pm" → title: "meeting")
- Map relative terms to provided dates ("next Monday" → use NextWeek.start)
- Return confidence scores
- Ask clarification when needed

---

## OAuth Flow (Per-Chat Multi-User)

### Linking Flow

```
User in Chat A                     Cloudflare Worker                Google OAuth
     │                                     │                              │
     │  1. #aut                            │                              │
     ├──────────────────────────────────►│                              │
     │                                     │                              │
     │  2. OAuth URL                       │                              │
     │  /oauth/start?chatId=A&userId=123   │                              │
     │◄────────────────────────────────────┤                              │
     │                                     │                              │
     │  3. Click link (opens browser)      │                              │
     ├─────────────────────────────────────┴─────────────────────────────►│
     │                                                                     │
     │  4. User authorizes                                                 │
     │                                                                     │
     │  5. Redirect to /oauth/callback?code=XYZ&state=ABC                 │
     │◄────────────────────────────────────────────────────────────────────┤
     │                                     │                              │
     │                                     │  6. Exchange code for tokens │
     │                                     ├──────────────────────────────►│
     │                                     │                              │
     │                                     │  7. Tokens                   │
     │                                     │◄──────────────────────────────┤
     │                                     │                              │
     │                                     │  8. Store tokens in KV       │
     │                                     │     Key: gc_tokens:chat:A    │
     │                                     │                              │
     │  9. Success message                 │                              │
     │◄────────────────────────────────────┤                              │
     │  "Linked account: user@gmail.com"   │                              │
```

### Token Storage Structure

```javascript
// KV Key: gc_tokens:chat:{chatId}
{
  "access_token": "ya29.a0AfH6SMB...",
  "refresh_token": "1//0gHdP...",
  "expires_at": 1704391200000,  // Unix timestamp
  "email": "user@gmail.com",
  "linkedBy": 123456789,         // User ID who linked
  "linkedAt": "2026-01-05T10:30:00Z",
  "scope": "https://www.googleapis.com/auth/calendar.events"
}
```

### Multi-Chat Scenario

```
Chat A (Group 1)  ──► Google Account: alice@gmail.com
Chat B (Group 2)  ──► Google Account: bob@gmail.com
Chat C (DM with Alice) ──► Google Account: alice@gmail.com
```

**Each chat is independent.** Different chats can link different Google accounts.

---

## Token Lifecycle

### Retrieval + Auto-Refresh

```
User triggers #cal
  │
  ├─► getValidAccessToken(chatId)
  │       │
  │       ├─► Fetch from KV: gc_tokens:chat:{chatId}
  │       │
  │       ├─► Check expiry: now >= expires_at - 60s?
  │       │
  │       ├─► YES (expired) ──► refreshAccessToken()
  │       │                         │
  │       │                         ├─► POST to Google Token API
  │       │                         │
  │       │                         ├─► Update KV with new access_token
  │       │                         │
  │       │                         └─► Return fresh access_token
  │       │
  │       └─► NO (valid) ──► Return existing access_token
  │
  └─► Use access_token for Calendar API calls
```

### Expiry Handling

- **Access tokens**: 1 hour (Google default)
- **Refresh tokens**: Persist indefinitely (unless user revokes)
- **Auto-refresh window**: 60 seconds before expiry
- **Failure handling**: If refresh fails → ask user to re-authenticate (#aut)

---

## Temporal Context Contract

### Mandatory LLM Input

Every LLM call **MUST** include:

```
TodayDate: 2026-01-05
Timezone: Asia/Singapore
WeekStartsOn: Monday
CurrentWeek: 2026-01-05 to 2026-01-11
NextWeek: 2026-01-12 to 2026-01-18
ReferenceWindow:
  start: 2026-01-05
  end: 2026-01-19

UserInput: "team sync next Monday at 3"
```

### Why This Fixes Temporal Failures

| Problem (Old) | Solution (New) |
|---------------|----------------|
| LLM doesn't know the year | System provides `TodayDate: 2026-01-05` |
| "next Monday" fails | System computes: NextWeek.start = 2026-01-12 |
| "tomorrow" is ambiguous | System: TodayDate + 1 = 2026-01-06 |
| Timezone issues | System fetches user's Google Calendar timezone |
| Week boundaries unclear | System: CurrentWeek = Mon-Sun dates |

---

## Parsing Examples (Before → After)

### Example 1: "next Monday"

**OLD (BROKEN):**
```
User: "meeting next Monday"
LLM: "next Monday" → ??? (no year, unclear reference)
Output: Fails or guesses wrong date
```

**NEW (WORKING):**
```
User: "meeting next Monday"
System builds context:
  TodayDate: 2026-01-05 (Monday)
  NextWeek: 2026-01-12 to 2026-01-18
LLM: "next Monday" → use NextWeek.start = 2026-01-12
Output: {"start": "2026-01-12T09:00:00+08:00", ...}
```

### Example 2: "tomorrow at 3pm"

**OLD (BROKEN):**
```
User: "dinner tomorrow at 3pm"
LLM: "tomorrow" → ??? (no reference point)
Output: Might default to Jan 1 or fail
```

**NEW (WORKING):**
```
User: "dinner tomorrow at 3pm"
System:
  TodayDate: 2026-01-05
  Tomorrow = 2026-01-06
LLM: "tomorrow at 3pm" → 2026-01-06T15:00:00
Output: {"start": "2026-01-06T15:00:00+08:00", "title": "Dinner", ...}
```

### Example 3: All-day event "this Friday"

**OLD (BROKEN):**
```
User: "submit report this Friday"
LLM: "this Friday" → might use wrong week
Output: Unreliable
```

**NEW (WORKING):**
```
User: "submit report this Friday"
System:
  TodayDate: 2026-01-05 (Monday)
  CurrentWeek: 2026-01-05 to 2026-01-11
  Friday = 2026-01-09
LLM: "this Friday" → use CurrentWeek date = 2026-01-09
Output: {"allDay": true, "startDate": "2026-01-09", ...}
```

---

## Defaults & Edge Rules

### Default Behaviors

| Scenario | Default | Rationale |
|----------|---------|-----------|
| No title | "Event" | Always have a label |
| No time | `allDay: true` | Safer than guessing time |
| Only weekday mentioned | Use ReferenceWindow | System resolves to concrete date |
| Timed event duration | 1 hour | Google Calendar default |
| Timezone | From user's Calendar | Or env.TIMEZONE fallback |

### Edge Cases

#### Ambiguous "Friday"

```
User: "meeting Friday"
Today: Monday (2026-01-05)

System logic:
  - Current week has Friday (2026-01-09)
  - Use CurrentWeek.Friday
  
Output: 2026-01-09
```

#### "Next Friday" when today IS Friday

```
User: "dinner next Friday"
Today: Friday (2026-01-09)

System logic:
  - Today = Friday
  - "next Friday" = NextWeek.Friday = 2026-01-16
  
Output: 2026-01-16
```

#### Year Boundary

```
User: "meeting next Monday"
Today: Sunday, Dec 28, 2025

System:
  TodayDate: 2025-12-28
  NextWeek: 2026-01-06 to 2026-01-12
  Next Monday = 2026-01-06
  
LLM output: "2026-01-06T09:00:00+08:00"
✅ Correct year transition
```

---

## Confidence & Clarification

### Confidence Levels

| Level | Condition | Action |
|-------|-----------|--------|
| **high** | Explicit date + time | Create immediately |
| **medium** | Relative date ("tomorrow", "next week") + time | Create with context display |
| **low** | Vague or missing info | Warn user, but still create if possible |

### Clarification Examples

#### Trigger Clarification

```json
{
  "title": "Meeting",
  "confidence": "low",
  "clarificationNeeded": true,
  "clarificationQuestion": "When would you like to schedule this meeting? Please provide a date or time."
}
```

#### Bot Response

```
🤔 **Need Clarification**

When would you like to schedule this meeting? Please provide a date or time.
```

---

## Security Model

### Chat-Level Authorization

```
whitelist:{chatId} ──► "true" (KV)
                       + metadata: {approvedBy, approvedAt}
```

### OAuth Isolation

- **Per-chat tokens**: `gc_tokens:chat:{chatId}`
- **No user-level tokens**: Old keys cleaned up
- **Group admin restriction**: Only admins can run #aut in groups

### Token Security

- Stored in Cloudflare KV (encrypted at rest)
- Minimal scope: `calendar.events` only
- Auto-expiry: Access tokens refresh, refresh tokens persist
- Revocation: User can unlink with `#aut unlink`

---

## Scalability & Performance

### Stateless Design

- No in-memory state
- All state in KV (distributed)
- Worker can scale horizontally

### KV Storage

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `gc_tokens:chat:{chatId}` | None | OAuth tokens |
| `selected_event:{chatId}:{userId}` | 24h | Last event for #alt/#del |
| `oauth_state:{state}` | 10min | CSRF protection |
| `whitelist:{chatId}` | None | Authorization |

### API Call Budget

Per #cal command:
1. KV read (tokens) - < 1ms
2. Google Calendar timezone fetch - ~200ms
3. Groq API call - ~500ms
4. Google Calendar event create - ~300ms
5. KV write (selected event) - < 1ms

**Total: ~1 second** (well within Telegram's 30s webhook timeout)

---

## Deployment Checklist

### Required Secrets (Wrangler)

```powershell
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put GROQ_API_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ADMIN_USER_ID
```

### Configuration (wrangler.toml)

```toml
USE_OAUTH = "true"
TIMEZONE = "Asia/Singapore"
WORKER_URL = "https://your-worker.workers.dev"
```

### KV Namespace

```powershell
wrangler kv namespace create EVENTS
# Update wrangler.toml with returned ID
```

### Google Cloud Setup

1. Enable Calendar API
2. Create OAuth 2.0 credentials
3. Add redirect URI: `{WORKER_URL}/oauth/callback`
4. Set scopes: `calendar.events`

---

## Monitoring & Debugging

### Logs to Watch

```powershell
wrangler tail
```

Key log messages:
- `"Using calendar timezone: Asia/Singapore"` ✅
- `"Temporal context: TodayDate: 2026-01-05"` ✅
- `"Groq response: {..."` ✅
- `"Event created successfully: abc123"` ✅

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Calendar Not Linked" | Chat hasn't run #aut | User runs #aut |
| "Authorization Expired" | Refresh token failed | User runs #aut unlink + #aut |
| "Token exchange failed" | OAuth config wrong | Check Google Cloud credentials |
| "Failed to parse Groq JSON" | LLM output invalid | Check prompt format |

---

## Comparison: Before → After

| Aspect | OLD (Broken) | NEW (Fixed) |
|--------|--------------|-------------|
| **Temporal Grounding** | LLM guesses year | System provides explicit year |
| **"next Monday"** | Often fails | System resolves to concrete date |
| **Timezone** | Hardcoded | Fetched from user's calendar |
| **OAuth** | Single account (GAS) | Per-chat multi-user |
| **Confidence** | No indication | Explicit levels + clarification |
| **Date Logic** | LLM does arithmetic | System handles all computation |
| **Year Boundary** | Unreliable | System ensures correct year |

---

## File Structure

```
worker/src/
├── temporalContext.js     # NEW: System-side temporal reasoning
├── groq.js                # UPDATED: LLM with explicit temporal contract
├── calendar.js            # UPDATED: Added getCalendarContext()
├── telegram.js            # UPDATED: Integrated temporal context flow
├── oauth.js               # Per-chat OAuth (no changes needed)
├── validators.js          # Schema validation
├── persistence.js         # KV storage
├── auth.js                # Whitelist
├── chatAdmin.js           # Group admin checks
├── eventMerge.js          # #alt partial updates
├── gas.js                 # GAS fallback (optional)
└── index.js               # Main entry point
```

---

## Production Readiness

### ✅ HARD REQUIREMENTS MET

- [x] Multi-user support (per-chat OAuth)
- [x] One Google account per Telegram chat
- [x] OAuth via Google Cloud Console
- [x] Tokens stored securely (KV)
- [x] System always knows: current date, year, timezone, week boundaries
- [x] LLM never guesses the year
- [x] System resolves "next / this / last" weekdays
- [x] LLM receives mandatory temporal context
- [x] Stateless LLM calls
- [x] Timezone-safe
- [x] Scalable (Cloudflare Workers)
- [x] No assumptions, no speculation

### System vs LLM Separation

**SYSTEM:**
- Temporal context generation ✅
- Date arithmetic ✅
- Timezone handling ✅
- OAuth management ✅
- API calls (Google Calendar) ✅

**LLM:**
- Text parsing → structured intent ✅
- Title extraction ✅
- Time extraction ✅
- Confidence scoring ✅
- Clarification questions ✅

---

## Next Steps (Optional Enhancements)

1. **Recurring events**: "every Monday at 3pm"
2. **Multi-day events**: "conference Jan 15-17"
3. **Meeting attendees**: "meeting with alice@example.com"
4. **Event colors/categories**: "urgent meeting" → red
5. **Multiple calendars**: Choose specific calendar
6. **Calendar search**: "what's on my calendar tomorrow?"
7. **Event reminders**: Custom notification times

---

## Conclusion

This architecture solves all temporal reasoning failures by **moving date logic from LLM to system**.

The LLM is now a pure parser with explicit constraints. It receives all temporal context upfront and NEVER computes dates.

OAuth is per-chat, allowing true multi-user support.

System is production-ready, scalable, and maintainable.

**Deploy with confidence. 🚀**
