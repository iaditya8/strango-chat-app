# 🔄 Bidirectional Reconnection System

## Overview
A symmetric, token-based reconnection system that allows **both users** to reconnect after accidental disconnects.

---

## 🎯 Key Features

✅ **Bidirectional**: Both User A and User B can reconnect  
✅ **Token-Based**: Uses session tokens (survives socket ID changes)  
✅ **60-Second Window**: Reconnection expires after 60 seconds  
✅ **Abuse Prevention**: Max 5 attempts per session  
✅ **Automatic**: Auto-attempts reconnection on page reload  
✅ **No Login Required**: Works with anonymous users  

---

## 🏗️ Architecture

### Server-Side State
```javascript
reconnectableSessions = Map {
  "reconnect_123_abc" => {
    userA: { socketId, name, connected: true/false },
    userB: { socketId, name, connected: true/false },
    roomId: "room_...",
    timestamp: Date.now(),
    attempts: 0
  }
}
```

### Client-Side Storage (sessionStorage)
```javascript
strango_reconnect_token: "reconnect_123_abc"
strango_partner_name: "John"
```

---

## 📊 Flow Diagrams

### Scenario 1: User A Disconnects

```
User A                    Server                    User B
  |                         |                         |
  | [Connected]             |        [Connected]      |
  |                         |                         |
  X [Disconnects]           |                         |
                            |                         |
                    Mark A disconnected               |
                            |                         |
                            |---partner-left--------->|
                            |                         |
  | [Reconnects]            |                         |
  |---reconnect-with-token->|                         |
                            |                         |
                    Check token valid                 |
                    Mark A connected                  |
                            |                         |
                            |--partner-reconnecting-->|
                            |                         |
                    Both connected?                   |
                    YES ✓                             |
                            |                         |
                            |<--partner-reconnected---|
                            |---partner-reconnected-->|
                            |                         |
  | [Reconnected! 🎉]       |      [Reconnected! 🎉]  |
```

### Scenario 2: Both Users Disconnect

```
User A                    Server                    User B
  |                         |                         |
  X [Disconnects]           |          [Disconnects]  X
                            |                         
                    Mark both disconnected            
                            |                         
  | [Reconnects]            |                         |
  |---reconnect-with-token->|                         |
                            |                         |
                    Mark A connected                  |
                    B still disconnected              |
                            |                         |
  |<--reconnect-waiting-----|                         |
  | "Waiting for partner"   |                         |
                            |                         |
                            |          [Reconnects]   |
                            |<--reconnect-with-token--|
                            |                         |
                    Mark B connected                  |
                    Both connected!                   |
                            |                         |
  |<--partner-reconnected---|                         |
                            |---partner-reconnected-->|
                            |                         |
  | [Reconnected! 🎉]       |      [Reconnected! 🎉]  |
```

### Scenario 3: Timeout (60 seconds)

```
User A                    Server                    User B
  |                         |                         |
  X [Disconnects]           |                         |
                            |                         |
                    Mark A disconnected               |
                    Start 60s timer                   |
                            |                         |
  ... [60+ seconds pass] ...                          |
                            |                         |
                    Session expired                   |
                    Delete token                      |
                            |                         |
  | [Tries to reconnect]    |                         |
  |---reconnect-with-token->|                         |
                            |                         |
  |<--reconnect-failed------|                         |
  | "Session expired"       |                         |
```

---

## 🔧 Implementation Details

### Server Events

#### `partner-found`
**Sent to:** Both users when matched  
**Payload:**
```javascript
{
  roomId: "room_...",
  initiator: true/false,
  partnerName: "John",
  conversationStarter: "...",
  reconnectToken: "reconnect_123_abc" // NEW
}
```

#### `reconnect-with-token`
**Received from:** User attempting reconnection  
**Payload:**
```javascript
{
  reconnectToken: "reconnect_123_abc"
}
```

**Server Logic:**
1. Validate token exists
2. Check 60-second expiry
3. Check max attempts (5)
4. Determine which user (A or B)
5. Update connection status
6. If both connected → emit `partner-reconnected`
7. If one connected → emit `reconnect-waiting`

#### `partner-reconnected`
**Sent to:** Both users when reconnection succeeds  
**Payload:**
```javascript
{
  roomId: "room_...",
  initiator: true/false,
  partnerName: "John",
  reconnectToken: "reconnect_123_abc" // Keep for future disconnects
}
```

#### `reconnect-waiting`
**Sent to:** User who reconnected first  
**Payload:**
```javascript
{
  partnerName: "John",
  message: "Waiting for partner to reconnect..."
}
```

#### `partner-reconnecting`
**Sent to:** User still connected when partner reconnects  
**Payload:**
```javascript
{
  partnerName: "John",
  message: "Your partner is reconnecting..."
}
```

#### `reconnect-failed`
**Sent to:** User when reconnection fails  
**Payload:**
```javascript
{
  reason: "Session expired" | "Partner is offline" | "Too many attempts" | ...
}
```

---

## 🛡️ Abuse Prevention

### 1. Time Limit
- **60-second window** from disconnect
- Prevents indefinite reconnection attempts
- Auto-cleanup of expired sessions

### 2. Attempt Limit
- **Max 5 attempts** per session
- Prevents spam/abuse
- Counter resets on successful reconnection

### 3. Token Validation
- Tokens are unique and unpredictable
- Cannot be guessed or brute-forced
- Format: `reconnect_{timestamp}_{random}`

### 4. Session Cleanup
- Expired sessions deleted every 10 seconds
- Prevents memory leaks
- Automatic garbage collection

---

## 🧪 Testing Scenarios

### Test 1: Normal Reconnection
1. Open two browser tabs
2. Connect both users
3. Refresh one tab
4. Should auto-reconnect within 1 second
5. ✅ Both users back in call

### Test 2: Both Disconnect
1. Connect two users
2. Close both tabs
3. Reopen both tabs within 60 seconds
4. Both should see reconnect button
5. First to click waits for second
6. ✅ Both reconnect when second clicks

### Test 3: Timeout
1. Connect two users
2. Close one tab
3. Wait 61 seconds
4. Reopen tab
5. ❌ Should show "Session expired"

### Test 4: Partner Offline
1. Connect two users
2. User A closes tab
3. User B clicks "Next" (finds new partner)
4. User A reopens tab and tries to reconnect
5. ❌ Should show "Partner is offline"

### Test 5: Abuse Prevention
1. Connect two users
2. User A disconnects/reconnects 6 times rapidly
3. ❌ 6th attempt should fail with "Too many attempts"

---

## 📝 Code Locations

### Server-Side
- **Token generation**: `server/server.js` line ~145
- **Session storage**: `server/server.js` line ~148
- **Reconnection handler**: `server/server.js` line ~270
- **Cleanup interval**: `server/server.js` line ~480

### Client-Side
- **Token storage**: `public/app.js` line ~360
- **Auto-reconnect**: `public/app.js` line ~140
- **Reconnect button**: `public/app.js` line ~720
- **Event handlers**: `public/app.js` line ~330

---

## 🎨 UX Flow

### User Sees:
1. **On disconnect**: "Partner disconnected"
2. **On reconnect**: Green button "🔄 Reconnect with [Name]"
3. **While waiting**: "Waiting for [Name] to reconnect..."
4. **On success**: "🔄 Reconnected successfully!"
5. **On failure**: "❌ Reconnection failed: [reason]"

---

## ✅ Advantages Over Previous System

| Feature | Old System | New System |
|---------|-----------|------------|
| **Bidirectional** | ❌ Only remaining user | ✅ Both users |
| **Survives refresh** | ❌ Lost on reload | ✅ Token in sessionStorage |
| **Socket ID change** | ❌ Breaks | ✅ Handles gracefully |
| **Abuse prevention** | ⚠️ Basic | ✅ Multi-layer |
| **Time window** | 5 minutes | 60 seconds (better UX) |
| **Auto-reconnect** | ❌ Manual only | ✅ Automatic |
| **Symmetry** | ❌ Asymmetric | ✅ Fully symmetric |

---

## 🚀 Future Enhancements

1. **Visual countdown**: Show remaining seconds
2. **Push notifications**: Alert user when partner reconnects
3. **Reconnection history**: Track success rate
4. **Adaptive timeout**: Extend for good users
5. **Analytics**: Monitor reconnection patterns

---

## 📚 Summary

This bidirectional reconnection system provides a **symmetric, abuse-proof, user-friendly** way for both users to recover from accidental disconnects. It uses session tokens to survive socket ID changes and provides clear feedback at every step.

**Key Principle**: Both users are equal partners in the reconnection process.
