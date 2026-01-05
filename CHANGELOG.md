# Changelog

All notable changes to C4lendar Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Event templates for recurring patterns
- Calendar event search functionality
- Timezone detection from user location
- Event reminders via Telegram
- Calendar view command (#view)

---

## [1.0.0] - 2026-01-05

### Added - Initial Public Release

#### Core Features
- **Multi-Account Workspace Model**: Each Telegram chat can connect multiple Google Calendar accounts
- **Broadcast Calendar Operations**: Events automatically synced across all connected accounts
- **Natural Language Processing**: Create events using conversational text via Groq LLM
- **Event UID System**: Stable event tracking with `EVT-xxxxxxxx` identifiers
- **OAuth 2.0 Integration**: Secure Google Calendar authorization with HMAC-signed state
- **Token Encryption**: AES-256-GCM encryption for OAuth refresh tokens at rest
- **Cloudflare Workers**: Serverless deployment with global low-latency

#### Commands
- `/start` - Initialize bot and show welcome message
- `#cal <text>` - Create calendar event from natural language
- `#alt <UID> <changes>` - Update existing event by UID
- `#del <UID>` - Delete calendar event by UID
- `#aut` - Link Google Calendar account to current chat
- `#dis` - Disconnect Google account from workspace

#### Technical Implementation
- **Persistence Layer** (`persistence.js`): KV storage with encryption utilities
- **OAuth Handler** (`oauth.js`): Complete OAuth 2.0 flow with state verification
- **Calendar Manager** (`calendar.js`): Multi-account broadcast operations
- **Telegram Handler** (`telegram.js`): Command routing and message processing
- **Event UID Module** (`eventUid.js`): UID generation and resolution
- **Groq Integration** (`groq.js`): LLM-powered event text parsing
- **Validators** (`validators.js`): Input sanitization and validation
- **Temporal Context** (`temporalContext.js`): Date/time utilities

#### Security
- HMAC-SHA256 signature verification for OAuth state
- AES-256-GCM encryption for refresh tokens
- Secure secret management via Wrangler secrets
- CORS and security headers enforcement
- Input validation on all user-provided data

#### Documentation
- Comprehensive README with quickstart guide
- SECURITY.md with vulnerability reporting policy
- CONTRIBUTING.md with development guidelines
- ARCHITECTURE.md describing system design
- .env.example template for configuration
- QUICK_REFERENCE.md user command guide

#### Infrastructure
- Cloudflare Workers deployment configuration
- KV namespace for event mappings and connections
- Google Apps Script legacy fallback support
- Wrangler deployment tooling

### Changed
- Migrated from single-account to multi-account architecture
- Replaced inline event storage with UID-based mapping system
- Enhanced OAuth flow with workspace-aware state management
- Improved error handling with user-friendly messages

### Security
- Sanitized `wrangler.toml` to remove production IDs
- Enhanced `.gitignore` to prevent secret leakage
- Implemented comprehensive security best practices
- Added encryption layer for sensitive data

---

## Version History Notes

### Pre-1.0 Development

This project evolved through several iterations:

1. **Legacy GAS Implementation**: Original Google Apps Script backend
2. **Single-Account OAuth**: Initial Cloudflare Workers migration
3. **Multi-Account Refactor**: Workspace broadcast architecture
4. **Security Hardening**: Open-source preparation (this release)

### Migration from Legacy

If upgrading from a pre-1.0 version with GAS:

1. Existing events will need to be recreated (event IDs changed to UID format)
2. Users must reconnect Google accounts via OAuth (#aut command)
3. GAS fallback can be enabled via `ENABLE_GAS_FALLBACK=true`
4. Legacy storage format is not compatible with workspace model

---

## [0.9.0] - Internal Development

### Added
- Initial Cloudflare Workers implementation
- Single-account OAuth flow
- Basic calendar operations (create/update/delete)
- Groq LLM integration for parsing
- Google Apps Script legacy support

### Known Issues
- Single account limitation per chat
- No cross-account event synchronization

---

## [0.1.0] - 2024-12 - Prototype

### Added
- Initial prototype using Google Apps Script
- Basic Telegram webhook handling
- Direct calendar API integration
- Manual event parsing

---

## Release Guidelines

### Versioning

- **MAJOR** (x.0.0): Breaking changes, API redesign
- **MINOR** (0.x.0): New features, backward compatible
- **PATCH** (0.0.x): Bug fixes, documentation updates

### Release Process

1. Update CHANGELOG.md with all changes
2. Update version in package.json
3. Tag release: `git tag -a v1.0.0 -m "Release v1.0.0"`
4. Push tag: `git push origin v1.0.0`
5. Create GitHub release with notes
6. Deploy to production: `wrangler deploy`

---

## Links

- **Repository**: https://github.com/OWNER/C4lendar_bot
- **Issues**: https://github.com/OWNER/C4lendar_bot/issues
- **Releases**: https://github.com/OWNER/C4lendar_bot/releases

---

**Legend**:
- `Added` - New features
- `Changed` - Changes to existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Vulnerability patches
