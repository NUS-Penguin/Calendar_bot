# 🔒 Security & Authorization Setup

## Overview

The bot uses **whitelist-based access control**. Only approved chats can use the bot commands.

---

## Quick Setup

### 1. Get Your Telegram User ID

```
1. Open Telegram
2. Message @userinfobot
3. Copy your numeric user ID (e.g., 123456789)
```

### 2. Configure Admin

Edit `worker/wrangler.toml`:

```toml
[vars]
ADMIN_USER_ID = "123456789"  # Replace with YOUR user ID
```

### 3. Deploy

```powershell
cd worker
wrangler deploy
```

---

## How It Works

### Authorization Flow

```
1. User adds bot to group/DM
   ↓
2. Bot checks: Is chat whitelisted?
   ↓
   NO → Send "Not Authorized" message
   YES → Process commands normally
```

### Admin Commands

**`/approve`** - Authorize current chat
- Only admin can run this
- Adds chat to whitelist (stored in KV)
- Bot immediately starts working in that chat

**`/revoke`** - Remove chat authorization
- Only admin can run this
- Removes chat from whitelist
- Bot stops responding in that chat

**`/listchats`** - View all authorized chats
- Only admin can run this
- Shows chat IDs and approval details

---

## Usage Scenarios

### Scenario 1: Personal Use (DM)

```
1. Message your bot directly
2. Since you're the admin, it auto-authorizes
3. Use #cal, #alt, #del commands immediately
```

### Scenario 2: Private Group

```
1. Add bot to your private group
2. Run: /approve
3. Bot confirms: "✅ Chat Approved"
4. Everyone in group can now use bot
```

### Scenario 3: Friend Requests Access

```
Friend: "Can I add your bot to my group?"
You: "Sure, but I need to approve it first"

Friend adds bot to their group
  ↓
Bot sends: "Not authorized. Ask admin to approve."
  ↓
You join their group temporarily
  ↓
You run: /approve
  ↓
Bot confirms: "✅ Chat Approved"
  ↓
You leave group (bot keeps working)
```

---

## Security Features

### ✅ What's Protected

- **Command execution** - Only whitelisted chats
- **Event creation** - Only approved users
- **Admin commands** - Only your Telegram user ID
- **Auto-rejection** - Unknown chats get denied instantly

### 🔒 Security Model

1. **Whitelist stored in Cloudflare KV**
   - Key: `whitelist:{chatId}`
   - Value: `true` + metadata (who approved, when)

2. **Admin verification**
   - Compares `userId` to `ADMIN_USER_ID` env var
   - No hardcoded values in code

3. **Authorization check on every message**
   - Runs before any command processing
   - Fails closed (denies by default)

---

## Testing Authorization

### Test 1: Unauthorized Chat

```powershell
# In a NEW group (not approved)
User: "Meeting tomorrow 3pm"
Other User: [Reply] #cal

Bot: "🔒 Not Authorized
This bot is private. Ask the admin to approve this chat with /approve."
```

### Test 2: Admin Approval

```powershell
# Same group
Admin: /approve

Bot: "✅ Chat Approved
Chat ID: -100123456789
This chat can now use the bot."
```

### Test 3: Now It Works

```powershell
# Same group, after approval
User: "Meeting tomorrow 3pm"
Other User: [Reply] #cal

Bot: "✅ Event created: Meeting
📅 Tomorrow 3:00 PM"
```

---

## Troubleshooting

### Bot not responding at all

```powershell
# Check ADMIN_USER_ID is set correctly
cd worker
cat wrangler.toml | Select-String "ADMIN_USER_ID"

# Should show YOUR user ID, not placeholder
```

### Can't run /approve

```
Problem: "Not Authorized" even when admin tries /approve

Fix: Admin commands bypass auth check. This means:
  1. ADMIN_USER_ID is wrong in wrangler.toml
  2. Need to redeploy: wrangler deploy
  3. Verify your user ID with @userinfobot
```

### Want to revoke access later

```
1. Join the group
2. Run: /revoke
3. Bot stops working in that chat
4. Can re-approve later with /approve
```

---

## Audit Log

View all approved chats:

```powershell
# In DM with bot (or any authorized chat)
/listchats
```

Output example:
```
📋 Whitelisted Chats

• Chat ID: -1001234567890
  Approved: 2026-01-04 20:15:30
  By: 123456789

• Chat ID: -1009876543210
  Approved: 2026-01-04 21:30:45
  By: 123456789
```

---

## Best Practices

1. **Keep ADMIN_USER_ID secret**
   - Don't share your user ID publicly
   - It's stored in wrangler.toml (not a secret, but be cautious)

2. **Review authorized chats periodically**
   - Run `/listchats` monthly
   - Revoke chats you don't recognize

3. **Don't approve unknown groups**
   - Only approve chats you trust
   - Remember: Everyone in that chat can use your calendar bot

4. **Backup whitelist**
   ```powershell
   # Export all whitelisted chats
   cd worker
   wrangler kv key list --binding=EVENTS --prefix=whitelist: > backup.json
   ```

---

## Advanced: Multiple Admins

To add more admins, modify `worker/src/auth.js`:

```javascript
export function isAdmin(env, userId) {
  const admins = [
    parseInt(env.ADMIN_USER_ID || '0'),
    123456789,  // Second admin
    987654321   // Third admin
  ];
  
  return admins.includes(userId);
}
```

Then redeploy:
```powershell
wrangler deploy
```

---

## FAQ

**Q: Can group members see my personal calendar?**  
A: No. Bot only creates events in YOUR Google Calendar (via GAS URL). Group members can trigger event creation, but calendar is yours.

**Q: What if someone approves their own group?**  
A: Impossible. Only user with ADMIN_USER_ID can run `/approve`.

**Q: Can I make bot fully public?**  
A: Yes, but not recommended. Remove auth check in `telegram.js` line 24. But anyone could spam your calendar.

**Q: Does bot work in DMs?**  
A: Yes. If someone DMs your bot:
- If they're admin → Works immediately
- If not admin → Needs `/approve` from admin (you need their chat ID)

---

**Security is enabled! Only you and approved chats can use the bot.** 🔒
