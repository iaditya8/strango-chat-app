# 🚀 Strango - Quick Start Guide

## Running the Application

```bash
npm start
```

Server runs on: `http://localhost:4000`

---

## Testing Reconnection System

### Automated Tests

```bash
# Test single user disconnect
node test-reconnection.js

# Test both users disconnect
node test-both-disconnect.js
```

### Manual Testing (Browser)

1. Open two browser windows/tabs
2. Go to `http://localhost:4000` in both
3. Complete landing page in both
4. Click "Start" in both to match them
5. Refresh one tab → should auto-reconnect
6. Close both tabs, reopen within 60s → both can reconnect

---

## Key Features

✅ **Bidirectional Reconnection** - Both users can reconnect  
✅ **60-second window** - Time limit for reconnection  
✅ **Auto-reconnect** - Attempts reconnection on page load  
✅ **Abuse prevention** - Max 5 attempts per session  
✅ **Socket ID handling** - Survives connection changes  

---

## File Structure

```
strango/
├── server/
│   ├── server.js          # Main server with reconnection logic
│   └── matchmaking.js     # Pairing algorithm
├── public/
│   ├── index.html         # Main app
│   ├── app.js             # Client logic with reconnection
│   └── style.css          # Styling
├── .kiro/steering/        # AI assistant guidance
│   ├── product.md
│   ├── tech.md
│   └── structure.md
├── RECONNECTION_SYSTEM.md           # Detailed documentation
├── RECONNECTION_IMPLEMENTATION.md   # Implementation summary
└── test-*.js              # Test scripts
```

---

## Admin Dashboard

Access at: `http://localhost:4000/admin.html`

Shows:
- Total online users
- Active calls
- User details (name, country, partner, connection time)

---

## Troubleshooting

### Port 4000 already in use
```bash
# Windows
Get-NetTCPConnection -LocalPort 4000 | Select-Object -ExpandProperty OwningProcess
Stop-Process -Id <PID> -Force
```

### Reconnection not working
- Check browser console for errors
- Verify sessionStorage has `strango_reconnect_token`
- Check server logs for reconnection attempts
- Ensure within 60-second window

### WebRTC not working
- Allow microphone permissions
- Check STUN server connectivity
- Verify browser supports WebRTC

---

## Next Steps

1. **Deploy** - Host on a cloud platform
2. **SSL** - Add HTTPS for production
3. **Analytics** - Track usage and reconnection rates
4. **UI Polish** - Enhance reconnection feedback
5. **Mobile** - Test and optimize for mobile browsers

---

## Support

- Documentation: `RECONNECTION_SYSTEM.md`
- Implementation: `RECONNECTION_IMPLEMENTATION.md`
- Steering files: `.kiro/steering/`
