# C4lendar Bot 🗓️

A powerful Telegram bot for managing Google Calendar events using natural language. Create, update, and delete calendar events across multiple Google accounts from any Telegram chat.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Natural Language Processing**: Create events using everyday language like "Meeting tomorrow at 2pm for 1 hour"
- **Multi-Account Support**: Connect multiple Google Calendar accounts per chat workspace
- **Broadcast Operations**: Automatically sync events across all connected accounts
- **OAuth 2.0 Integration**: Secure Google Calendar authorization
- **End-to-End Encryption**: AES-256-GCM encryption for stored OAuth tokens
- **Serverless Architecture**: Runs on Cloudflare Workers for global low-latency
- **Privacy First**: No event data stored - only event IDs for management

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Initialize the bot | `/start` |
| `#cal` | Create a calendar event | `#cal Team meeting tomorrow at 3pm for 1 hour` |
| `#alt` | Update an existing event | `#alt EVT-abc123 Moved to 4pm` |
| `#del` | Delete a calendar event | `#del EVT-abc123` |
| `#aut` | Link a Google Calendar account | `#aut` |
| `#dis` | Disconnect a Google account | `#dis` |

## Architecture

```
Telegram User
     ↓
Telegram Bot API
     ↓
Cloudflare Workers (index.js)
     ↓
├─→ Groq LLM (Event Parsing)
├─→ Google OAuth 2.0
├─→ Google Calendar API (Multi-Account Broadcast)
└─→ Cloudflare KV (Event Mappings + Encrypted Tokens)
```

**Key Components:**

- **Telegram Handler** ([telegram.js](worker/src/telegram.js)): Command routing and message handling
- **Calendar Manager** ([calendar.js](worker/src/calendar.js)): Multi-account broadcast operations
- **OAuth Flow** ([oauth.js](worker/src/oauth.js)): HMAC-signed state verification
- **Persistence Layer** ([persistence.js](worker/src/persistence.js)): KV storage with encryption
- **Event UID System** ([eventUid.js](worker/src/eventUid.js)): Stable event tracking across accounts

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Cloudflare Account](https://dash.cloudflare.com/sign-up) (Free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- [Google Cloud Project](https://console.cloud.google.com/) with Calendar API enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/C4lendar_bot.git
   cd C4lendar_bot/worker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp ../.env.example .env
   # Edit .env with your actual values
   ```

4. **Create KV namespace**
   ```bash
   wrangler kv:namespace create "EVENTS"
   # Copy the ID to wrangler.toml
   ```

5. **Set secrets**
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put GROQ_API_KEY
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   wrangler secret put ADMIN_USER_ID
   wrangler secret put ENCRYPTION_KEY
   wrangler secret put OAUTH_STATE_SECRET
   ```

6. **Deploy**
   ```bash
   wrangler deploy
   ```

7. **Set Telegram webhook**
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
        -H "Content-Type: application/json" \
        -d '{"url": "https://your-worker.workers.dev"}'
   ```

## Configuration

See [.env.example](.env.example) for all configuration options.

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Calendar API**
4. Create **OAuth 2.0 Client ID** (Web application)
5. Add authorized redirect URI: `https://your-worker.workers.dev/oauth/callback`
6. Copy Client ID and Client Secret to secrets

### Security Configuration

Generate encryption keys:
```bash
openssl rand -base64 32  # For ENCRYPTION_KEY
openssl rand -base64 32  # For OAUTH_STATE_SECRET
```

## Usage Examples

### Create an Event
```
#cal Team standup tomorrow at 9am for 30 minutes
#cal Dentist appointment next Friday at 2pm
#cal Project deadline on Dec 15 2024 at 5pm
```

### Update an Event
```
#alt EVT-xyz789 Moved to 3pm
#alt EVT-xyz789 Changed to 2 hours
#alt EVT-xyz789 Meeting room B
```

### Connect Multiple Accounts
```
#aut                    ← Links first account
#aut                    ← Links second account
#dis                    ← Shows list to disconnect
```

All events created with `#cal` are automatically broadcast to all connected accounts in the chat workspace.

## Development

```bash
# Local development
npm run dev

# Type checking (if using TypeScript)
npm run typecheck

# Deploy to production
npm run deploy
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Security

- **Token Encryption**: All OAuth refresh tokens encrypted with AES-256-GCM
- **HMAC Verification**: OAuth state parameters signed with HMAC-SHA256
- **No Data Retention**: Only event IDs stored, no event content
- **Secure Headers**: CORS and security headers enforced

Report security vulnerabilities to the maintainer (see [SECURITY.md](SECURITY.md)).

## Project Structure

```
C4lendar_bot/
├── worker/                  # Cloudflare Worker source
│   ├── src/
│   │   ├── index.js        # Main webhook handler
│   │   ├── telegram.js     # Command handlers
│   │   ├── calendar.js     # Google Calendar API
│   │   ├── oauth.js        # OAuth 2.0 flow
│   │   ├── persistence.js  # KV storage layer
│   │   ├── eventUid.js     # Event UID utilities
│   │   ├── groq.js         # LLM event parsing
│   │   ├── validators.js   # Input validation
│   │   └── temporalContext.js  # Date/time utilities
│   ├── package.json
│   └── wrangler.toml       # Cloudflare config
├── gas/                    # Legacy Google Apps Script
├── docs/                   # Additional documentation
├── .env.example           # Environment template
├── ARCHITECTURE.md        # Technical architecture
├── CONTRIBUTING.md        # Contribution guidelines
└── README.md              # This file
```

## Troubleshooting

### Bot doesn't respond
- Verify webhook is set: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Check Worker logs: `wrangler tail`
- Ensure secrets are set correctly

### OAuth fails
- Verify redirect URI matches exactly in Google Console
- Check WORKER_URL in wrangler.toml
- Verify Google Calendar API is enabled

### Events not syncing
- Confirm accounts are connected: `#dis` (shows active connections)
- Check refresh token encryption key is consistent
- Review Worker logs for API errors

## License

[MIT License](LICENSE) - See LICENSE file for details.

## Acknowledgments

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Google Calendar API](https://developers.google.com/calendar)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Groq](https://groq.com/) for LLM inference

## Support

For bugs and feature requests, please [open an issue](https://github.com/yourusername/C4lendar_bot/issues).

---

**Made with ❤️ for productivity enthusiasts**

