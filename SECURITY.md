# Security Policy

## Supported Versions

Currently supported versions of C4lendar Bot:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of C4lendar Bot seriously. If you discover a security vulnerability, please follow these guidelines:

### Where to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please report security issues privately to:
- Email: [your-email@example.com]
- Subject: `[SECURITY] C4lendar Bot - [Brief Description]`

### What to Include

Please include the following information in your report:

1. **Description**: A clear description of the vulnerability
2. **Impact**: What an attacker could achieve by exploiting this
3. **Steps to Reproduce**: Detailed steps to reproduce the issue
4. **Affected Components**: Which files/modules are affected
5. **Suggested Fix**: If you have ideas for remediation
6. **Proof of Concept**: Code snippets or screenshots (if applicable)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix Timeline**: Varies by severity (see below)
- **Disclosure**: Coordinated disclosure after fix is released

### Severity Levels

| Severity | Response Time | Examples |
|----------|--------------|----------|
| **Critical** | 24-48 hours | Remote code execution, credential theft |
| **High** | 3-7 days | Authentication bypass, data leakage |
| **Medium** | 14 days | Information disclosure, DoS |
| **Low** | 30 days | Configuration issues, minor leaks |

## Security Best Practices

### For Users

#### 1. **Protect Your Secrets**
- Never commit `.env` files to version control
- Rotate secrets regularly (every 90 days recommended)
- Use strong, unique passwords for all services
- Store secrets in Wrangler secrets, not environment variables

#### 2. **OAuth Security**
```bash
# Generate strong encryption keys
openssl rand -base64 32  # ENCRYPTION_KEY
openssl rand -base64 32  # OAUTH_STATE_SECRET
```

#### 3. **Google OAuth Configuration**
- Restrict OAuth redirect URIs to your exact worker URL
- Enable only required scopes (`calendar.events`)
- Regularly audit authorized applications in Google Account settings
- Use separate Google Cloud projects for dev/prod

#### 4. **Telegram Bot Security**
- Keep bot token private and secure
- Revoke and regenerate if compromised (via @BotFather)
- Set ADMIN_USER_ID to prevent unauthorized admin access
- Monitor bot activity for suspicious behavior

#### 5. **Cloudflare Workers**
- Enable Cloudflare WAF rules
- Monitor Worker analytics for unusual traffic
- Use KV namespaces per environment (dev/prod)
- Enable rate limiting if available

### For Developers

#### 1. **Code Security**
```javascript
// ✅ GOOD: Use parameterized queries (KV operations)
await env.EVENTS.put(`event:${chatId}:${eventUid}`, data);

// ❌ BAD: String concatenation (avoid injection risks)
await env.EVENTS.put("event:" + userInput + ":uid", data);
```

#### 2. **Input Validation**
```javascript
// Always validate user input
import { validateChatId, validateEventUid } from './validators.js';

const chatId = validateChatId(update.message.chat.id);
const eventUid = validateEventUid(userInput);
```

#### 3. **Token Handling**
```javascript
// ✅ GOOD: Encrypt refresh tokens
const encrypted = await encryptToken(refreshToken, env.ENCRYPTION_KEY);
await env.EVENTS.put(key, encrypted);

// ❌ BAD: Store plaintext tokens
await env.EVENTS.put(key, refreshToken);  // NEVER DO THIS
```

#### 4. **OAuth State Verification**
```javascript
// Always verify HMAC signatures on OAuth callbacks
const { chatId, userId } = await parseAndVerifyState(
  stateParam, 
  env.OAUTH_STATE_SECRET
);
```

#### 5. **Error Handling**
```javascript
// ✅ GOOD: Generic error messages
catch (error) {
  console.error('OAuth error:', error);  // Log internally
  return 'Authentication failed. Please try again.';  // User message
}

// ❌ BAD: Exposing internal details
catch (error) {
  return `Error: ${error.message}`;  // May leak secrets/paths
}
```

## Known Security Considerations

### 1. **Cloudflare KV Storage**
- Data is encrypted at rest by Cloudflare
- Additional AES-256-GCM encryption applied to refresh tokens
- Event mappings stored in plaintext (only IDs, no event content)
- KV namespace IDs are not secret (but shouldn't be public)

### 2. **OAuth Token Refresh**
- Refresh tokens never expire (Google Calendar API)
- Recommendation: Manually disconnect and reconnect accounts periodically
- Tokens revoked automatically if user removes app in Google Account settings

### 3. **Telegram Bot API**
- Webhook URL is public (but requires valid bot token)
- Bot token acts as bearer authentication
- No additional rate limiting beyond Telegram's built-in limits

### 4. **Third-Party Services**
| Service | Purpose | Data Shared |
|---------|---------|-------------|
| Groq API | Event text parsing | Event description only (no IDs/tokens) |
| Google Calendar API | Event management | Full event data (required for functionality) |
| Telegram API | Bot messaging | Chat/user IDs, messages |

## Security Checklist

Before deploying to production:

- [ ] All secrets set via `wrangler secret put` (not .env)
- [ ] `.env` and `.dev.vars` added to `.gitignore`
- [ ] Google OAuth redirect URI matches exactly
- [ ] Encryption keys generated with `openssl rand -base64 32`
- [ ] ADMIN_USER_ID configured correctly
- [ ] KV namespace created and ID updated in `wrangler.toml`
- [ ] Telegram webhook set to HTTPS endpoint
- [ ] Worker deployed to custom domain (if using)
- [ ] Cloudflare WAF rules enabled
- [ ] Git history checked for exposed secrets

## Incident Response

If a security incident occurs:

1. **Immediately**:
   - Rotate all affected secrets (bot token, API keys, encryption keys)
   - Disable compromised worker or bot
   - Notify affected users

2. **Within 24 hours**:
   - Assess scope of breach
   - Patch vulnerability
   - Review logs for unauthorized access

3. **Within 7 days**:
   - Publish postmortem (if appropriate)
   - Update documentation
   - Implement preventive measures

## Cryptographic Details

### Encryption (AES-256-GCM)
```javascript
// Implementation: worker/src/persistence.js
Algorithm: AES-GCM
Key Size: 256 bits
IV: 12 bytes (random per encryption)
Tag: 16 bytes (authentication tag)
```

### HMAC Signing (OAuth State)
```javascript
// Implementation: worker/src/oauth.js
Algorithm: HMAC-SHA256
Key: OAUTH_STATE_SECRET (256 bits)
Payload: chatId|userId|timestamp
```

## Dependencies

Regular security updates:
```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

Monitor these dependencies for CVEs:
- Node.js runtime
- Cloudflare Workers runtime
- No npm packages in production (Worker uses native APIs)

## References

- [Cloudflare Workers Security](https://developers.cloudflare.com/workers/platform/security/)
- [Google OAuth 2.0 Best Practices](https://developers.google.com/identity/protocols/oauth2/best-practices)
- [Telegram Bot Security](https://core.telegram.org/bots/security)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)

## Contact

For security concerns: [your-email@example.com]

---

**Last Updated**: January 2026  
**Version**: 1.0.0
