# Contributing to C4lendar Bot

Thank you for considering contributing to C4lendar Bot! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)

## Code of Conduct

This project follows a simple code of conduct:
- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other contributors

## Getting Started

### Prerequisites

- **Node.js**: v18 or higher
- **Wrangler CLI**: `npm install -g wrangler`
- **Cloudflare Account**: Free tier is sufficient
- **Git**: For version control

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/C4lendar_bot.git
   cd C4lendar_bot
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/C4lendar_bot.git
   ```

## Development Setup

### 1. Install Dependencies

```bash
cd worker
npm install
```

### 2. Configure Environment

```bash
# Copy template
cp ../.env.example .env

# Edit with your values
# Required: TELEGRAM_BOT_TOKEN, GROQ_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
```

### 3. Create Development KV Namespace

```bash
wrangler kv:namespace create "EVENTS" --preview
# Copy the preview_id to wrangler.toml under [[kv_namespaces]]
```

### 4. Set Development Secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN --env dev
wrangler secret put GROQ_API_KEY --env dev
wrangler secret put GOOGLE_CLIENT_ID --env dev
wrangler secret put GOOGLE_CLIENT_SECRET --env dev
wrangler secret put ADMIN_USER_ID --env dev
wrangler secret put ENCRYPTION_KEY --env dev
wrangler secret put OAUTH_STATE_SECRET --env dev
```

### 5. Run Local Development Server

```bash
npm run dev
# Worker will be available at http://localhost:8787
```

### 6. Test with Telegram

Since Telegram webhooks require HTTPS, use a tunnel for local testing:

```bash
# Option 1: Cloudflare Tunnel (recommended)
cloudflared tunnel --url http://localhost:8787

# Option 2: ngrok
ngrok http 8787
```

Then set the webhook:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://your-tunnel-url.trycloudflare.com"
```

## Project Architecture

### File Structure

```
worker/
├── src/
│   ├── index.js           # Main webhook handler
│   ├── telegram.js        # Command routing and handlers
│   ├── calendar.js        # Google Calendar API operations
│   ├── oauth.js           # OAuth 2.0 flow
│   ├── persistence.js     # KV storage layer
│   ├── eventUid.js        # Event UID generation/resolution
│   ├── groq.js            # LLM event parsing
│   ├── validators.js      # Input validation
│   ├── temporalContext.js # Date/time utilities
│   └── [legacy files]     # auth.js, gas.js, chatAdmin.js
├── package.json
└── wrangler.toml
```

### Key Concepts

#### 1. **Workspace Model**
Each Telegram chat is a "workspace" that can connect multiple Google accounts:
```javascript
// Storage key format
`workspace:${chatId}:connections` → Array<ConnectionObject>
```

#### 2. **Event UIDs**
Stable identifiers for tracking events across accounts:
```javascript
// Format: EVT-xxxxxxxx (8 random alphanumeric chars)
generateEventUID() // → "EVT-a7b9c2d1"
```

#### 3. **Broadcast Operations**
Calendar actions fan out to all connected accounts:
```javascript
await broadcastCreateEvent(chatId, eventData, env)
// Creates event in ALL connected accounts
```

#### 4. **Token Encryption**
OAuth refresh tokens encrypted with AES-256-GCM:
```javascript
const encrypted = await encryptToken(refreshToken, encryptionKey)
const decrypted = await decryptToken(encrypted, encryptionKey)
```

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-timezone-support`
- `fix/oauth-redirect-issue`
- `docs/update-readme`
- `refactor/simplify-validators`

### Development Workflow

1. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes**:
   - Follow [Coding Standards](#coding-standards)
   - Add comments for complex logic
   - Update documentation if needed

3. **Test locally**:
   ```bash
   npm run dev
   # Test with Telegram bot
   ```

4. **Commit changes**:
   ```bash
   git add .
   git commit -m "feat: add timezone support for events"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

## Testing

### Manual Testing

Test all affected commands:
```
# In Telegram
#cal Test event tomorrow at 2pm
#alt EVT-xxx Changed to 3pm
#del EVT-xxx
#aut
#dis
```

### Testing Checklist

- [ ] Command parsing works correctly
- [ ] Error handling displays user-friendly messages
- [ ] OAuth flow completes successfully
- [ ] Multi-account broadcast works
- [ ] Event UIDs are generated and resolved
- [ ] Encryption/decryption works
- [ ] Worker logs show no errors

### Debugging

View Worker logs:
```bash
wrangler tail
```

Check Telegram webhook info:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

## Submitting Changes

### Pull Request Process

1. **Update documentation**:
   - Update README.md if adding features
   - Add JSDoc comments to new functions
   - Update ARCHITECTURE.md for major changes

2. **Create pull request**:
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe changes and motivation
   - Include testing steps

3. **PR template**:
   ```markdown
   ## Description
   Brief description of changes
   
   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update
   
   ## Testing
   Steps to test the changes
   
   ## Checklist
   - [ ] Code follows project style
   - [ ] Self-reviewed code
   - [ ] Commented complex areas
   - [ ] Updated documentation
   - [ ] No new warnings
   - [ ] Tested locally
   ```

4. **Code review**:
   - Address reviewer feedback
   - Make requested changes
   - Update PR description if scope changes

5. **Merge**:
   - Squash commits if requested
   - Maintainer will merge when approved

## Coding Standards

### JavaScript Style

Follow modern ES6+ conventions:

```javascript
// ✅ GOOD: Use const/let, not var
const result = await fetchData();
let counter = 0;

// ✅ GOOD: Destructuring
const { chatId, userId } = update.message;

// ✅ GOOD: Arrow functions for short callbacks
const eventIds = events.map(e => e.id);

// ✅ GOOD: Template literals
const message = `Event ${eventUid} created successfully`;

// ✅ GOOD: Async/await over promises
const data = await env.EVENTS.get(key);

// ❌ BAD: var, outdated syntax
var x = 10;
```

### Naming Conventions

```javascript
// Functions: camelCase, descriptive verbs
async function createCalendarEvent() { }
function validateEventUid() { }

// Variables: camelCase, descriptive nouns
const eventData = {};
const userMessage = "";

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const DEFAULT_TIMEZONE = "UTC";

// Private functions: prefix with underscore (optional)
function _parseEventDate() { }
```

### Function Documentation

Use JSDoc for exported functions:

```javascript
/**
 * Creates a calendar event in all connected accounts
 * @param {string} chatId - Telegram chat ID
 * @param {Object} eventData - Event details (summary, start, end)
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<{eventUid: string, results: Array}>} Created event UID and results
 */
async function broadcastCreateEvent(chatId, eventData, env) {
  // Implementation
}
```

### Error Handling

Always handle errors gracefully:

```javascript
// ✅ GOOD: User-friendly error messages
try {
  await createEvent(eventData);
} catch (error) {
  console.error('Calendar API error:', error);
  return 'Failed to create event. Please try again.';
}

// ❌ BAD: Exposing internals
catch (error) {
  return `Error: ${error.stack}`;  // Don't do this
}
```

### Input Validation

Always validate user input:

```javascript
import { validateChatId, validateEventUid } from './validators.js';

// ✅ GOOD: Validate before use
const chatId = validateChatId(update.message.chat.id);
if (!chatId) {
  return 'Invalid chat ID';
}

// ❌ BAD: Trusting user input
const chatId = update.message.chat.id;  // Could be malicious
```

### Security Considerations

```javascript
// ✅ GOOD: Encrypt sensitive data
const encrypted = await encryptToken(token, key);

// ✅ GOOD: Verify HMAC signatures
await parseAndVerifyState(state, secret);

// ✅ GOOD: Use parameterized KV keys
await env.EVENTS.put(`event:${chatId}:${uid}`, data);

// ❌ BAD: Plaintext storage
await env.EVENTS.put('token', refreshToken);

// ❌ BAD: String concatenation (injection risk)
const key = "event:" + userInput;
```

## Commit Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting, semicolons)
- `refactor`: Code restructuring (no behavior change)
- `perf`: Performance improvements
- `test`: Adding tests
- `chore`: Maintenance (dependencies, build)

### Examples

```bash
feat(calendar): add timezone support for events

Add ability to specify timezone in event creation using
natural language parsing. Defaults to configured TIMEZONE.

Closes #42

---

fix(oauth): handle expired refresh tokens gracefully

Previously would crash when token expired. Now catches
error and prompts user to reconnect account.

---

docs(readme): update installation instructions

Added steps for KV namespace creation and secret configuration.

---

refactor(persistence): extract encryption utilities

Moved encryptToken/decryptToken to separate module for reusability.
```

## Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Google Calendar API](https://developers.google.com/calendar)
- [Project Architecture](ARCHITECTURE.md)

## Questions?

- **General questions**: Open a [GitHub Discussion](https://github.com/OWNER/C4lendar_bot/discussions)
- **Bug reports**: Create an [Issue](https://github.com/OWNER/C4lendar_bot/issues)
- **Security concerns**: See [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing!** 🎉
