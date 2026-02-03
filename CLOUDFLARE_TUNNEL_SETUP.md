# 🌐 Cloudflare Tunnel Setup for Strango

Cloudflare Tunnel allows you to securely expose your Strango application to the internet without opening ports on your firewall or configuring port forwarding.

## 📋 Prerequisites

- ✅ Cloudflared installed (already done)
- ✅ Cloudflare account (free tier works)
- ✅ Domain name (optional - Cloudflare provides free subdomains)

## 🚀 Quick Start (Temporary Tunnel)

### 1. Start Your Strango Server
```bash
npm start
```
Your server will be running on `http://localhost:4000`

### 2. Create Temporary Tunnel
```bash
# For quick testing (temporary URL)
cloudflared tunnel --url http://localhost:4000
```

This gives you a temporary URL like: `https://random-words-123.trycloudflare.com`

## 🏗️ Production Setup (Persistent Tunnel)

### 1. Login to Cloudflare
```bash
cloudflared tunnel login
```
This opens your browser to authenticate with Cloudflare.

### 2. Create a Named Tunnel
```bash
cloudflared tunnel create strango-app
```

### 3. Create Configuration File
Create `cloudflared-config.yml` in your project root:

```yaml
tunnel: strango-app
credentials-file: C:\Users\%USERNAME%\.cloudflared\[tunnel-id].json

ingress:
  # Main application
  - hostname: your-domain.com
    service: http://localhost:4000
  
  # Admin dashboard (optional - restrict access)
  - hostname: admin.your-domain.com
    service: http://localhost:4000
    path: /admin.html
  
  # Catch-all rule (required)
  - service: http_status:404
```

### 4. Configure DNS
```bash
# Point your domain to the tunnel
cloudflared tunnel route dns strango-app your-domain.com
cloudflared tunnel route dns strango-app admin.your-domain.com
```

### 5. Run the Tunnel
```bash
cloudflared tunnel --config cloudflared-config.yml run
```

## 🔧 Strango-Specific Configuration

### Update Socket.IO Client Configuration
In your `public/app.js`, update the Socket.IO connection:

```javascript
// For production with Cloudflare Tunnel
const socket = io({
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true,
  // Cloudflare handles SSL termination
  secure: true,
  // Increase timeout for tunnel latency
  timeout: 20000,
  // Enable compression
  compression: true
});
```

### Environment Variables for Production
```bash
# Set these in your production environment
NODE_ENV=production
PORT=4000
MAX_CONNECTIONS=2000
CLOUDFLARE_TUNNEL=true
```

## 🚀 Deployment Scripts

### Windows Batch Script (`start-tunnel.bat`)
```batch
@echo off
echo Starting Strango with Cloudflare Tunnel...

REM Start the Node.js server in background
start /B npm start

REM Wait for server to start
timeout /t 5 /nobreak > nul

REM Start Cloudflare tunnel
cloudflared tunnel --config cloudflared-config.yml run

pause
```

### PowerShell Script (`start-tunnel.ps1`)
```powershell
Write-Host "🚀 Starting Strango with Cloudflare Tunnel..." -ForegroundColor Green

# Start Node.js server
Start-Process -FilePath "npm" -ArgumentList "start" -WindowStyle Hidden

# Wait for server startup
Start-Sleep -Seconds 5

# Start Cloudflare tunnel
& cloudflared tunnel --config cloudflared-config.yml run
```

## 🔒 Security Considerations

### 1. Access Control
```yaml
# In cloudflared-config.yml, add access policies
ingress:
  - hostname: admin.your-domain.com
    service: http://localhost:4000
    path: /admin.html
    # Add Cloudflare Access for admin protection
    originRequest:
      httpHostHeader: admin.your-domain.com
```

### 2. Rate Limiting
Cloudflare automatically provides:
- DDoS protection
- Rate limiting
- Bot protection
- SSL/TLS encryption

### 3. Admin Dashboard Protection
Consider using Cloudflare Access to protect `/admin.html`:
1. Go to Cloudflare Dashboard → Zero Trust → Access
2. Create application for `admin.your-domain.com`
3. Set authentication policies

## 📊 Monitoring & Logs

### View Tunnel Status
```bash
cloudflared tunnel info strango-app
```

### View Tunnel Logs
```bash
cloudflared tunnel --config cloudflared-config.yml run --loglevel debug
```

### Metrics Dashboard
Access tunnel metrics at: `https://dash.cloudflare.com/`

## 🛠️ Troubleshooting

### Common Issues

1. **WebRTC Not Working**
   - Ensure STUN servers are accessible through tunnel
   - Check browser console for ICE connection errors

2. **Socket.IO Connection Issues**
   - Verify `transports: ['websocket', 'polling']`
   - Check for CORS issues in server configuration

3. **High Latency**
   - Use nearest Cloudflare data center
   - Enable compression in tunnel config

### Debug Commands
```bash
# Test local server
curl http://localhost:4000

# Test tunnel connectivity
cloudflared tunnel --url http://localhost:4000 --loglevel debug

# Check tunnel status
cloudflared tunnel list
```

## 🌟 Benefits for Strango

1. **Global CDN**: Faster loading worldwide
2. **DDoS Protection**: Built-in security
3. **SSL/TLS**: Automatic HTTPS
4. **Analytics**: Traffic insights
5. **Zero Configuration**: No firewall changes needed
6. **High Availability**: Cloudflare's 99.9% uptime

## 📱 Mobile Testing

With Cloudflare Tunnel, you can test Strango on mobile devices:
1. Get your tunnel URL
2. Open on any mobile device
3. Test voice chat functionality
4. Verify responsive design

## 🚀 Production Deployment

For production, consider:
1. Custom domain with Cloudflare DNS
2. Cloudflare Access for admin protection
3. PM2 for process management
4. Monitoring with Cloudflare Analytics
5. Load balancing for multiple instances

---

**Ready to go global with Strango! 🌍**