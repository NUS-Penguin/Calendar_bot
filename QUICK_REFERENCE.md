# C4lendar Bot - Quick Reference Card

## 🎯 What's New: Multi-Account Workspace Support

**One chat, many calendars!** Connect multiple Google accounts to a single Telegram chat. Every event is automatically created, updated, or deleted across **all connected accounts**.

Perfect for:
- 👨‍👩‍👧‍👦 Family calendars (mom, dad, kids)
- 👥 Team calendars (all team members)
- 🏢 Cross-organization events (company A + company B)

---

## 📋 Commands

### 🔗 #aut - Connect Google Account
Links a Google Calendar account to this chat/group.

**Usage:**
```
#aut
```

**Notes:**
- In groups: Admin only
- Can connect multiple accounts to same chat
- Each person can connect their own account
- All events broadcast to ALL connected accounts

**Example:**
```
User: #aut
Bot: 🔗 Link Google Calendar
     Click: https://...

     💡 Multi-Account Support:
     You can connect multiple Google accounts.
     All events will be created in ALL connected accounts.
```

---

### 📅 #cal - Create Event
Creates a calendar event in **all connected accounts**.

**Usage:**
```
#cal <event description>
```

**Examples:**
```
#cal team meeting tomorrow 3pm
#cal dentist appointment Friday 2pm
#cal vacation june 15-20
#cal all hands meeting next monday 10am
```

**Result:**
```
✅ Calendar Event Created!

**Team Meeting**
📅 2026-01-10 15:00 → 16:00
📍 No location
🔖 Reference: EVT-7a3f9c21

📤 Broadcast Results:
✅ Success: 3/3

Connected Accounts:
• alice@company.com
• bob@company.com
• charlie@company.com
```

---

### ✏️ #alt - Modify Event
Updates the most recent event across **all connected accounts**.

**Usage:**
```
#alt <changes>
```

**Examples:**
```
#alt next friday              → Change date
#alt 4pm                       → Change time
#alt project kickoff meeting   → Change title
#alt 2-3pm                     → Change duration
#alt all day                   → Make all-day event
#alt add location: Office 42   → Add location
```

**Result:**
```
✅ Event Updated!

**Project Kickoff Meeting**
📅 2026-01-17 16:00 → 17:00
📍 No location
🔖 Reference: EVT-7a3f9c21

Changes: Title changed

📤 Broadcast Results:
✅ Success: 3/3
```

---

### 🗑️ #del - Delete Event
Deletes the most recent event from **all connected accounts**.

**Usage:**
```
#del
#del EVT-7a3f9c21    (delete specific event by reference)
```

**Result:**
```
✅ Event Deleted!

**Team Meeting** has been removed from connected calendars.
🔖 Reference: EVT-7a3f9c21

📤 Broadcast Results:
✅ Success: 3/3

Deleted From:
• alice@company.com
• bob@company.com
• charlie@company.com
```

---

### 🔌 #dis - Disconnect Account (NEW!)
Manages connected Google accounts.

**List all connections:**
```
#dis
```

**Result:**
```
📋 Connected Google Accounts (3)

• alice@company.com
  Connected: 2026-01-05
  By: User 123456

• bob@company.com
  Connected: 2026-01-04
  By: User 789012

• charlie@company.com
  Connected: 2026-01-03
  By: User 345678

To disconnect an account:
#dis user@gmail.com
```

**Disconnect specific account:**
```
#dis alice@company.com
```

**Result:**
```
✅ Account Disconnected

alice@company.com has been disconnected from this workspace.

• Event mappings cleaned up
• Access revoked

The account owner can reconnect anytime with #aut.
```

**Notes:**
- In groups: Admin only
- Disconnecting removes all event mappings
- Future events won't affect disconnected account
- Account can reconnect with `#aut`

---

## 🎓 How It Works

### Single Account (Old Way)
```
Chat connects 1 account → Events go to 1 calendar
```

### Multi-Account Workspace (New Way!)
```
Chat has 3 accounts:
  • alice@company.com
  • bob@company.com
  • charlie@company.com

Someone runs: #cal team meeting tomorrow 3pm

Bot creates 3 events:
  ✓ Event in Alice's calendar
  ✓ Event in Bob's calendar
  ✓ Event in Charlie's calendar

All three see the same event in their Google Calendar!
```

### Event Tracking
Each event gets a unique reference ID:
```
EVT-7a3f9c21
```

This ID tracks the event across all accounts, so:
- `#alt` updates it everywhere
- `#del` deletes it everywhere
- Even if someone disconnects, others still tracked

---

## 💡 Tips & Tricks

### Family Calendar Setup
```
1. Mom runs: #aut      (connects mom@gmail.com)
2. Dad runs: #aut      (connects dad@gmail.com)
3. Kid runs: #aut      (connects kid@gmail.com)

Now anyone in chat can run:
#cal soccer practice saturday 9am

All three see it in their calendars!
```

### Team Calendar Setup
```
1. PM connects team calendar
2. Dev lead connects dev calendar
3. QA lead connects qa calendar

#cal sprint planning monday 10am
→ Shows up in all 3 team calendars
```

### Temporary Disconnect
```
Going on vacation? Don't want work events?

#dis work@company.com
(take vacation)
#aut
(reconnect when back)
```

---

## 🔒 Security & Privacy

### Who Can Connect?
- **Private chats:** Anyone
- **Groups:** Admins only
- Each person connects their own Google account

### Who Can Create Events?
- Anyone in an authorized chat
- Events broadcast to ALL connected accounts
- No per-user filtering

### Who Can Disconnect?
- **Private chats:** Anyone  
- **Groups:** Admins only
- You can only disconnect from current chat

### Data Storage
- Refresh tokens encrypted (AES-GCM)
- OAuth state signed (HMAC-SHA256)
- Tokens isolated per chat
- Event mappings tracked per account

---

## 🐛 Troubleshooting

### "No Google Accounts Connected"
**Fix:** Run `#aut` to connect an account first

### "Token refresh failed"
**Fix:** Account needs reconnection
```
#dis old@gmail.com
#aut
```

### "Authorization Expired"
**Fix:** Reconnect
```
#aut
```

### Partial Failure (2/3 succeeded)
**What it means:** Event created in 2 accounts, failed in 1
**Fix:** Check which account failed (shown in message)
- If token issue: Reconnect that account
- If API issue: Try again later

### Event in some calendars but not others
**Check:**
```
#dis    (see which accounts connected)
```

**Fix:** Disconnect and reconnect problematic account

---

## 📊 Limits

- **Google Calendar API:** 10,000 requests/day per account
- **Connections:** No hard limit (reasonable: <10 per chat)
- **Events:** No limit
- **Event history:** Indefinite (until deleted)

---

## ❓ FAQ

**Q: Can I connect the same account to multiple chats?**  
A: Yes! Same account can be in Chat A and Chat B independently.

**Q: What if I delete the event in Google Calendar directly?**  
A: Bot won't know. Use `#del` to delete via bot.

**Q: Can I create event in just one account?**  
A: No, broadcast is all-or-nothing. Workaround: disconnect others with `#dis`.

**Q: What happens if I revoke access in Google?**  
A: Bot will detect next time and report "Token refresh failed". Run `#aut` to reconnect.

**Q: Can I see who connected which account?**  
A: Yes! Run `#dis` to see connection details.

**Q: Does this work with Google Workspace accounts?**  
A: Yes! Works with both personal Gmail and Workspace accounts.

---

## 🚀 Getting Started

**First Time Setup:**
```
1. Start private chat with @YourBot
2. Run: #aut
3. Click link to authorize Google
4. Run: #cal test event tomorrow 3pm
5. Check your Google Calendar!
```

**Add Second Account:**
```
1. In same chat, run: #aut again
2. Authorize second account
3. Run: #cal another test tomorrow 4pm
4. Check BOTH calendars (event in both!)
```

**Manage Accounts:**
```
#dis                    → List all
#dis old@gmail.com      → Disconnect one
```

---

## 📚 Learn More

- [WORKSPACE_BROADCAST_MIGRATION.md](WORKSPACE_BROADCAST_MIGRATION.md) - Technical migration guide
- [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) - Implementation details
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture

---

**Version:** Workspace Broadcast 2.0  
**Date:** January 2026  
**License:** See LICENSE
