// server/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { addToQueue, removeFromQueue, findMatchFor } = require('./matchmaking');

const app = express();
const server = http.createServer(app);

// PERFORMANCE: Optimize Socket.IO for high concurrency
const io = new Server(server, {
  // Increase connection limits
  maxHttpBufferSize: 1e6, // 1MB
  pingTimeout: 60000,
  pingInterval: 25000,
  // Enable compression
  compression: true,
  // Optimize transport
  transports: ['websocket', 'polling'],
  // Connection state recovery
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  }
});

// PERFORMANCE: Set process limits
process.setMaxListeners(0); // Remove EventEmitter limit




/* =========================
   CONVERSATION STARTERS
========================= */

const conversationStarters = [
  "What's the most interesting thing that happened to you this week?",
  "If you could have dinner with anyone, who would it be?",
  "What's your favorite way to spend a weekend?",
  "What's the best advice you've ever received?",
  "If you could travel anywhere right now, where would you go?",
  "What's something you believe that most people disagree with?",
  "What moment in your life changed you the most?",
  "What's your biggest fear and why?",
  "Would you rather fight 100 duck-sized horses or 1 horse-sized duck?",
  "What's your most embarrassing moment?",
  "If you were a superhero, what would your power be?",
  "What's the weirdest food combination you actually enjoy?",
  "If animals could talk, which would be the rudest?",
  "What's something new you learned recently?",
  "What skill would you love to master?",
  "What book changed your perspective on life?",
  "What's the most fascinating fact you know?",
  "If you could become an expert in anything overnight, what would it be?",
  "What's something you're proud of accomplishing recently?",
  "What always makes you feel better when you're down?",
  "What's something you're looking forward to?",
  "What's the best compliment you've ever received?"
];

function getConversationStarter() {
  return conversationStarters[Math.floor(Math.random() * conversationStarters.length)];
}

/* =========================
   GLOBAL STATE (OPTIMIZED)
========================= */

// PERFORMANCE: Use Maps for O(1) lookups instead of objects
const users = new Map();          // socketId -> user object
const reports = new Map();        // socketId -> report count
const bannedUsers = new Set();
const recentPartners = new Map(); // socketId -> { partnerId, timestamp, partnerName }
const reconnectRequests = new Map(); // socketId -> { requesterId, timestamp }

// NEW FEATURES: Additional state management
const userRatings = new Map();    // socketId -> { ratings: [], averageRating: number }
const appeals = new Map();        // appealId -> appeal object

// Connection tracking for limits
let activeConnections = 0;
const MAX_CONNECTIONS = process.env.MAX_CONNECTIONS || 2000;

// PERFORMANCE: Reconnection token system with Map for O(1) access
const reconnectableSessions = new Map(); // reconnectToken -> { userA, userB, roomId, timestamp, attempts }

function generateReconnectToken() {
  return `reconnect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/* =========================
   SKIP ABUSE PROTECTION (OPTIMIZED)
========================= */
const skipTracker = new Map(); // socketId -> timestamps array

const MAX_SKIPS = 3;
const SKIP_WINDOW_MS = 30000; // 30 seconds

// PERFORMANCE: Batch cleanup of old skip records
setInterval(() => {
  const now = Date.now();
  for (const [socketId, timestamps] of skipTracker.entries()) {
    const validTimestamps = timestamps.filter(t => now - t < SKIP_WINDOW_MS);
    if (validTimestamps.length === 0) {
      skipTracker.delete(socketId);
    } else {
      skipTracker.set(socketId, validTimestamps);
    }
  }
}, 30000);


/* =========================
   EXPRESS SETUP (OPTIMIZED)
========================= */

app.use(express.json({ limit: '1mb' }));

// PERFORMANCE: Enable compression and caching
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1d', // Cache static files for 1 day
  etag: true,
  lastModified: true
}));

// PERFORMANCE: Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

/* =========================
   ADMIN ENDPOINTS (OPTIMIZED)
========================= */

app.get('/admin/users', (req, res) => {
  const now = Date.now();

  // PERFORMANCE: Use Map iteration instead of Object.entries
  const list = [];
  for (const [id, u] of users.entries()) {
    const userRating = userRatings.get(id);
    list.push({
      id,
      name: u.name || 'Stranger',
      username: u.username || 'Anonymous',
      country: u.country || 'any',
      gender: u.gender || 'any',
      partner: u.partner || null,
      roomId: u.roomId || null,
      connectedForSeconds: Math.floor((now - u.connectedAt) / 1000),
      averageRating: userRating ? userRating.averageRating.toFixed(1) : 'N/A',
      totalRatings: userRating ? userRating.ratings.length : 0,
      reportCount: reports.get(id) || 0,
      isBanned: bannedUsers.has(id)
    });
  }

  res.json({
    totalOnline: list.length,
    activeCalls: Math.floor(list.filter(u => u.partner).length / 2),
    maxConnections: MAX_CONNECTIONS,
    memoryUsage: process.memoryUsage(),
    bannedUsers: bannedUsers.size,
    pendingAppeals: Array.from(appeals.values()).filter(a => a.status === 'pending').length,
    users: list,
  });
});

// NEW: Appeals management endpoint
app.get('/admin/appeals', (req, res) => {
  const appealsList = Array.from(appeals.values()).map(appeal => ({
    ...appeal,
    timeAgo: Math.floor((Date.now() - appeal.timestamp) / (1000 * 60)) + ' minutes ago'
  }));
  
  res.json({
    total: appealsList.length,
    pending: appealsList.filter(a => a.status === 'pending').length,
    approved: appealsList.filter(a => a.status === 'approved').length,
    denied: appealsList.filter(a => a.status === 'denied').length,
    appeals: appealsList.sort((a, b) => b.timestamp - a.timestamp)
  });
});

// NEW: Appeal decision endpoint
app.post('/admin/appeals/:appealId/decision', express.json(), (req, res) => {
  const { appealId } = req.params;
  const { decision, adminMessage } = req.body; // decision: 'approve' or 'deny'
  
  const appeal = appeals.get(appealId);
  if (!appeal) {
    return res.status(404).json({ error: 'Appeal not found' });
  }
  
  appeal.status = decision === 'approve' ? 'approved' : 'denied';
  appeal.adminMessage = adminMessage || '';
  appeal.reviewedAt = Date.now();
  
  // If approved, remove from banned users
  if (decision === 'approve') {
    bannedUsers.delete(appeal.userId);
    console.log(`Appeal ${appealId} approved - user ${appeal.userId} unbanned`);
  } else {
    console.log(`Appeal ${appealId} denied`);
  }
  
  // Notify user if they're online
  const userSocket = io.sockets.sockets.get(appeal.userId);
  if (userSocket) {
    userSocket.emit('appeal-status', {
      status: appeal.status,
      message: adminMessage || (decision === 'approve' ? 'Your appeal has been approved.' : 'Your appeal has been denied.')
    });
  }
  
  res.json({ success: true, appeal });
});

// NEW: User ratings endpoint
app.get('/admin/ratings', (req, res) => {
  const ratingsList = [];
  
  for (const [userId, ratingData] of userRatings.entries()) {
    const user = users.get(userId);
    ratingsList.push({
      userId,
      username: user ? (user.username || 'Anonymous') : 'Disconnected',
      averageRating: ratingData.averageRating.toFixed(1),
      totalRatings: ratingData.ratings.length,
      recentRatings: ratingData.ratings.slice(-5).map(r => ({
        rating: r.rating,
        comment: r.comment,
        timeAgo: Math.floor((Date.now() - r.timestamp) / (1000 * 60)) + ' min ago'
      }))
    });
  }
  
  // Sort by average rating (highest first)
  ratingsList.sort((a, b) => parseFloat(b.averageRating) - parseFloat(a.averageRating));
  
  res.json({
    totalUsers: ratingsList.length,
    averageOverall: ratingsList.length > 0 
      ? (ratingsList.reduce((sum, u) => sum + parseFloat(u.averageRating), 0) / ratingsList.length).toFixed(1)
      : 'N/A',
    ratings: ratingsList
  });
});

// PERFORMANCE: Add health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    connections: activeConnections,
    memory: process.memoryUsage().heapUsed / 1024 / 1024, // MB
    features: {
      ratings: userRatings.size,
      appeals: appeals.size,
      bannedUsers: bannedUsers.size
    }
  });
});

/* =========================
   HELPERS
========================= */

function pickInitiator(a, b) {
  return a < b ? a : b;
}

function performReconnection(userId1, userId2) {
  const user1 = users.get(userId1);
  const user2 = users.get(userId2);

  if (!user1 || !user2) return;

  // Create room and join both users
  const roomId = `room_${userId1}_${userId2}`;
  const socket1 = io.sockets.sockets.get(userId1);
  const socket2 = io.sockets.sockets.get(userId2);

  socket1?.join(roomId);
  socket2?.join(roomId);

  // Update user states
  user1.partner = userId2;
  user1.roomId = roomId;
  user1.lastActiveAt = Date.now();
  
  user2.partner = userId1;
  user2.roomId = roomId;
  user2.lastActiveAt = Date.now();

  // Clear recent partner data after successful reconnection
  recentPartners.delete(userId1);
  recentPartners.delete(userId2);

  const initiator = pickInitiator(userId1, userId2);

  // Notify both users
  io.to(userId1).emit('partner-reconnected', {
    roomId,
    initiator: initiator === userId1,
    partnerName: user2.name || 'Stranger',
  });

  io.to(userId2).emit('partner-reconnected', {
    roomId,
    initiator: initiator === userId2,
    partnerName: user1.name || 'Stranger',
  });
}


function cleanUser(id) {
  const user = users.get(id);
  if (!user) return;

  try { removeFromQueue(id); } catch {}

  // Mark user as disconnected in reconnectable sessions FIRST (before clearing partner)
  for (const [token, session] of reconnectableSessions.entries()) {
    if (session.userA.socketId === id) {
      session.userA.connected = false;
      console.log(`Marked userA as disconnected in session ${token}`);
    } else if (session.userB.socketId === id) {
      session.userB.connected = false;
      console.log(`Marked userB as disconnected in session ${token}`);
    }
  }

  if (user.partner && users.has(user.partner)) {
    const partner = users.get(user.partner);
    
    // Store recent partner info for reconnection (valid for 5 minutes)
    recentPartners.set(id, {
      partnerId: user.partner,
      timestamp: Date.now(),
      partnerName: partner.name || 'Stranger'
    });
    
    recentPartners.set(user.partner, {
      partnerId: id,
      timestamp: Date.now(),
      partnerName: user.name || 'Stranger'
    });

    console.log(`Stored recent partners: ${id} <-> ${user.partner}`);

    partner.partner = null;
    partner.roomId = null;
    io.to(user.partner).emit('partner-left');
  }

  user.partner = null;
  user.roomId = null;
}

// PERFORMANCE: Optimized skip abuse check
function isSkipAbusing(socketId) {
  const now = Date.now();

  if (!skipTracker.has(socketId)) {
    skipTracker.set(socketId, []);
  }

  const timestamps = skipTracker.get(socketId);
  
  // Remove old timestamps (batch operation is more efficient)
  const validTimestamps = timestamps.filter(t => now - t < SKIP_WINDOW_MS);
  validTimestamps.push(now);
  
  skipTracker.set(socketId, validTimestamps);

  return validTimestamps.length > MAX_SKIPS;
}


/* =========================
   SOCKET.IO (OPTIMIZED)
========================= */

io.on('connection', socket => {
  // PERFORMANCE: Connection limiting
  activeConnections++;
  
  if (activeConnections > MAX_CONNECTIONS) {
    console.log(`Connection limit reached: ${activeConnections}/${MAX_CONNECTIONS}`);
    socket.emit('server-full', { message: 'Server is at capacity. Please try again later.' });
    socket.disconnect(true);
    activeConnections--;
    return;
  }

  console.log(`User connected: ${socket.id} (${activeConnections}/${MAX_CONNECTIONS})`);

  // PERFORMANCE: Use Map.set instead of object assignment
  users.set(socket.id, {
    connectedAt: Date.now(),
    lastActiveAt: Date.now(),
    country: 'any',
    gender: 'any',
    name: null,
    partner: null,
    roomId: null,
    // New identity fields
    username: null,
    email: null,
    userId: null,
    loginType: 'session', // 'session' or 'persistent'
    isGuest: true
  });

  /* ---- TYPING INDICATORS (OPTIMIZED) ---- */
  socket.on('typing-start', ({ roomId }) => {
    const user = users.get(socket.id);
    if (user) user.lastActiveAt = Date.now();
    socket.to(roomId).emit('typing-start');
  });

  socket.on('typing-stop', ({ roomId }) => {
    const user = users.get(socket.id);
    if (user) user.lastActiveAt = Date.now();
    socket.to(roomId).emit('typing-stop');
  });

  /* ---- CHAT (OPTIMIZED) ---- */
  socket.on('chat-message', ({ roomId, msg }) => {
    if (!roomId || !msg) return;
    const user = users.get(socket.id);
    if (user) user.lastActiveAt = Date.now();
    
    // PERFORMANCE: Limit message length
    const sanitizedMsg = msg.toString().slice(0, 500);
    socket.to(roomId).emit('chat-message', { msg: sanitizedMsg });
  });

  /* ---- REPORT (OPTIMIZED) ---- */
  socket.on('report-user', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user || !user.partner) return;

    const offender = user.partner;
    const currentReports = reports.get(offender) || 0;
    reports.set(offender, currentReports + 1);

    if (reports.get(offender) >= 3) {
      bannedUsers.add(offender);
    }

    cleanUser(offender);
    cleanUser(socket.id);

    io.to(roomId).emit('partner-left');
  });

  /* ---- BLOCK (OPTIMIZED) ---- */
  socket.on('block-user', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user || !user.partner) return;

    bannedUsers.add(user.partner);
    cleanUser(user.partner);
    cleanUser(socket.id);

    io.to(roomId).emit('partner-left');
  });

  /* ---- NEW FEATURES: EMOJI REACTIONS ---- */
  socket.on('emoji-reaction', ({ roomId, emoji }) => {
    const user = users.get(socket.id);
    if (!user || !user.partner || !roomId) return;
    
    // Validate emoji (basic security)
    const allowedEmojis = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '💯'];
    if (!allowedEmojis.includes(emoji)) return;
    
    // Send to partner
    socket.to(roomId).emit('emoji-reaction', { emoji });
    
    // Update user activity
    user.lastActiveAt = Date.now();
  });

  /* ---- NEW FEATURES: RATING SYSTEM ---- */
  socket.on('submit-rating', ({ rating, comment, partnerName }) => {
    const user = users.get(socket.id);
    if (!user || !user.partner) return;
    
    // Validate rating
    if (rating < 1 || rating > 5) return;
    
    const partnerId = user.partner;
    const partnerUser = users.get(partnerId);
    
    if (partnerUser) {
      // Store rating for partner
      if (!userRatings.has(partnerId)) {
        userRatings.set(partnerId, { ratings: [], averageRating: 0 });
      }
      
      const partnerRatings = userRatings.get(partnerId);
      partnerRatings.ratings.push({
        rating,
        comment: comment || '',
        timestamp: Date.now(),
        fromUser: user.username || 'Anonymous'
      });
      
      // Calculate new average
      const totalRatings = partnerRatings.ratings.reduce((sum, r) => sum + r.rating, 0);
      partnerRatings.averageRating = totalRatings / partnerRatings.ratings.length;
      
      // Notify partner if rating is good
      if (rating >= 4) {
        io.to(partnerId).emit('rating-received', { rating, comment });
      }
      
      console.log(`Rating submitted: ${rating}/5 for user ${partnerId}`);
    }
  });

  /* ---- NEW FEATURES: APPEAL SYSTEM ---- */
  socket.on('submit-appeal', ({ reason, message, email }) => {
    const user = users.get(socket.id);
    if (!user) return;
    
    // Generate appeal ID
    const appealId = `appeal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const appeal = {
      id: appealId,
      userId: socket.id,
      username: user.username || 'Anonymous',
      reason,
      message,
      email,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    appeals.set(appealId, appeal);
    
    // Log appeal for admin review
    console.log(`New appeal submitted: ${appealId} by ${user.username || socket.id}`);
    console.log(`Reason: ${reason}`);
    console.log(`Message: ${message}`);
    console.log(`Email: ${email}`);
    
    // Confirm receipt to user
    socket.emit('appeal-status', { 
      status: 'received', 
      message: 'Your appeal has been received and will be reviewed within 24-48 hours.' 
    });
  });

  /* ---- ENHANCED REPORT WITH BAN NOTIFICATIONS ---- */
  socket.on('report-user', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user || !user.partner) return;

    const offender = user.partner;
    const offenderUser = users.get(offender);
    const currentReports = reports.get(offender) || 0;
    reports.set(offender, currentReports + 1);

    console.log(`User ${offender} reported. Total reports: ${currentReports + 1}`);

    if (reports.get(offender) >= 3) {
      bannedUsers.add(offender);
      
      // Calculate ban duration based on reports
      const reportCount = reports.get(offender);
      let banDuration = '24 hours';
      let banExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString();
      
      if (reportCount >= 5) {
        banDuration = '7 days';
        banExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleString();
      }
      
      // Notify banned user
      io.to(offender).emit('user-banned', {
        reason: 'Multiple user reports for inappropriate behavior',
        duration: banDuration,
        expires: banExpires
      });
      
      console.log(`User ${offender} banned for ${banDuration}`);
    }

    cleanUser(offender);
    cleanUser(socket.id);

    io.to(roomId).emit('partner-left');
  });

  /* ---- RECONNECT WITH TOKEN ---- */
  socket.on('reconnect-with-token', ({ reconnectToken }) => {
    console.log(`Reconnect attempt with token: ${reconnectToken} from ${socket.id}`);
    
    const session = reconnectableSessions.get(reconnectToken);
    
    if (!session) {
      socket.emit('reconnect-failed', { reason: 'Invalid or expired session' });
      return;
    }

    // Check if session expired (60 seconds)
    if (Date.now() - session.timestamp > 60000) {
      reconnectableSessions.delete(reconnectToken);
      socket.emit('reconnect-failed', { reason: 'Session expired (60s limit)' });
      return;
    }

    // Check max attempts (prevent abuse)
    if (session.attempts >= 5) {
      reconnectableSessions.delete(reconnectToken);
      socket.emit('reconnect-failed', { reason: 'Too many reconnection attempts' });
      return;
    }

    session.attempts++;

    // Determine which user is reconnecting
    let isUserA = false;
    let partnerSocketId = null;
    let partnerName = '';

    if (session.userA.socketId === socket.id || !session.userA.connected) {
      // User A is reconnecting
      isUserA = true;
      session.userA.socketId = socket.id;
      session.userA.connected = true;
      partnerSocketId = session.userB.socketId;
      partnerName = session.userB.name;
    } else if (session.userB.socketId === socket.id || !session.userB.connected) {
      // User B is reconnecting
      isUserA = false;
      session.userB.socketId = socket.id;
      session.userB.connected = true;
      partnerSocketId = session.userA.socketId;
      partnerName = session.userA.name;
    } else {
      socket.emit('reconnect-failed', { reason: 'Token mismatch' });
      return;
    }

    // Check if both users are now connected
    if (session.userA.connected && session.userB.connected) {
      // Both users reconnected! Restore the room
      const roomId = session.roomId;
      const userASocket = io.sockets.sockets.get(session.userA.socketId);
      const userBSocket = io.sockets.sockets.get(session.userB.socketId);

      if (!userASocket || !userBSocket) {
        socket.emit('reconnect-failed', { reason: 'Connection error' });
        return;
      }

      // Ensure both users exist in users object
      if (!users[session.userA.socketId]) {
        users[session.userA.socketId] = {
          connectedAt: Date.now(),
          lastActiveAt: Date.now(),
          country: 'any',
          gender: 'any',
          name: session.userA.name,
          partner: null,
          roomId: null,
        };
      }
      
      if (!users[session.userB.socketId]) {
        users[session.userB.socketId] = {
          connectedAt: Date.now(),
          lastActiveAt: Date.now(),
          country: 'any',
          gender: 'any',
          name: session.userB.name,
          partner: null,
          roomId: null,
        };
      }

      // Rejoin room
      userASocket.join(roomId);
      userBSocket.join(roomId);

      // Update user states
      users[session.userA.socketId].partner = session.userB.socketId;
      users[session.userA.socketId].roomId = roomId;
      users[session.userA.socketId].lastActiveAt = Date.now();

      users[session.userB.socketId].partner = session.userA.socketId;
      users[session.userB.socketId].roomId = roomId;
      users[session.userB.socketId].lastActiveAt = Date.now();

      const initiator = pickInitiator(session.userA.socketId, session.userB.socketId);

      // Notify both users
      io.to(session.userA.socketId).emit('partner-reconnected', {
        roomId,
        initiator: initiator === session.userA.socketId,
        partnerName: session.userB.name,
        reconnectToken, // Keep token for future disconnects
      });

      io.to(session.userB.socketId).emit('partner-reconnected', {
        roomId,
        initiator: initiator === session.userB.socketId,
        partnerName: session.userA.name,
        reconnectToken, // Keep token for future disconnects
      });

      console.log(`Successfully reconnected session: ${reconnectToken}`);
      
      // Reset timestamp for next potential disconnect
      session.timestamp = Date.now();
      session.attempts = 0;
    } else {
      // Only one user reconnected, notify them to wait
      socket.emit('reconnect-waiting', {
        partnerName,
        message: 'Waiting for partner to reconnect...'
      });

      // Notify the other user (if online) that partner is trying to reconnect
      const partnerSocket = io.sockets.sockets.get(partnerSocketId);
      if (partnerSocket) {
        partnerSocket.emit('partner-reconnecting', {
          partnerName: isUserA ? session.userA.name : session.userB.name,
          message: 'Your partner is reconnecting...'
        });
      }
    }
  });

  /* ---- OLD RECONNECT PARTNER (DEPRECATED - keeping for backwards compatibility) ---- */
  socket.on('reconnect-partner', () => {
    const user = users[socket.id];
    if (!user || bannedUsers.has(socket.id)) {
      socket.emit('reconnect-failed', { reason: 'User not found or banned' });
      return;
    }

    const recentPartner = recentPartners[socket.id];
    
    // Check if recent partner exists and is still valid (within 5 minutes)
    if (!recentPartner || Date.now() - recentPartner.timestamp > 300000) {
      // No server-side recent partner, but client might have one
      // Search for any user who has this socket as their recent partner
      let foundPartnerId = null;
      for (const [userId, partnerData] of Object.entries(recentPartners)) {
        if (partnerData.partnerId === socket.id && Date.now() - partnerData.timestamp <= 300000) {
          foundPartnerId = userId;
          break;
        }
      }
      
      if (!foundPartnerId) {
        // Try to find by searching all users' recent partners
        for (const [userId, partnerData] of Object.entries(recentPartners)) {
          const partner = users[userId];
          if (partner && !partner.partner && Date.now() - partnerData.timestamp <= 300000) {
            // This is a potential match - send request
            foundPartnerId = userId;
            break;
          }
        }
      }
      
      if (!foundPartnerId) {
        socket.emit('reconnect-failed', { reason: 'No recent partner or session expired' });
        return;
      }
      
      // Found a potential partner, send request
      const partner = users[foundPartnerId];
      if (!partner || partner.partner) {
        socket.emit('reconnect-failed', { reason: 'Partner is no longer available' });
        return;
      }
      
      // Send reconnection request
      reconnectRequests[foundPartnerId] = {
        requesterId: socket.id,
        timestamp: Date.now()
      };

      socket.emit('reconnect-request-sent', { partnerName: partner.name || 'Stranger' });
      io.to(foundPartnerId).emit('reconnect-request-received', {
        requesterName: user.name || 'Stranger',
        requesterId: socket.id
      });

      // Auto-expire request after 30 seconds
      setTimeout(() => {
        if (reconnectRequests[foundPartnerId]?.requesterId === socket.id) {
          delete reconnectRequests[foundPartnerId];
          socket.emit('reconnect-request-expired');
          io.to(foundPartnerId).emit('reconnect-request-expired');
        }
      }, 30000);
      
      return;
    }

    const partnerId = recentPartner.partnerId;
    const partner = users[partnerId];

    // Check if partner is still online and available
    if (!partner || partner.partner) {
      socket.emit('reconnect-failed', { reason: 'Partner is no longer available' });
      return;
    }

    // Check if partner also wants to reconnect (mutual reconnection)
    const partnerRecentPartner = recentPartners[partnerId];
    if (!partnerRecentPartner || partnerRecentPartner.partnerId !== socket.id) {
      socket.emit('reconnect-failed', { reason: 'Partner connection mismatch' });
      return;
    }

    // Check if there's already a pending request from the partner
    const existingRequest = reconnectRequests[socket.id];
    if (existingRequest && existingRequest.requesterId === partnerId) {
      // Partner already sent a request, auto-accept and reconnect
      performReconnection(socket.id, partnerId);
      delete reconnectRequests[socket.id];
      delete reconnectRequests[partnerId];
      return;
    }

    // Send reconnection request to partner
    reconnectRequests[partnerId] = {
      requesterId: socket.id,
      timestamp: Date.now()
    };

    socket.emit('reconnect-request-sent', { partnerName: recentPartner.partnerName });
    io.to(partnerId).emit('reconnect-request-received', {
      requesterName: user.name || 'Stranger',
      requesterId: socket.id
    });

    // Auto-expire request after 30 seconds
    setTimeout(() => {
      if (reconnectRequests[partnerId]?.requesterId === socket.id) {
        delete reconnectRequests[partnerId];
        socket.emit('reconnect-request-expired');
        io.to(partnerId).emit('reconnect-request-expired');
      }
    }, 30000);
  });

  /* ---- ACCEPT RECONNECTION REQUEST ---- */
  socket.on('accept-reconnect', ({ requesterId }) => {
    const request = reconnectRequests[socket.id];
    
    if (!request || request.requesterId !== requesterId) {
      socket.emit('reconnect-failed', { reason: 'Invalid or expired request' });
      return;
    }

    const requester = users[requesterId];
    if (!requester || requester.partner) {
      socket.emit('reconnect-failed', { reason: 'Requester is no longer available' });
      delete reconnectRequests[socket.id];
      return;
    }

    // Perform the reconnection
    performReconnection(requesterId, socket.id);
    delete reconnectRequests[socket.id];
    delete reconnectRequests[requesterId];
  });

  /* ---- DECLINE RECONNECTION REQUEST ---- */
  socket.on('decline-reconnect', ({ requesterId }) => {
    const request = reconnectRequests[socket.id];
    
    if (request && request.requesterId === requesterId) {
      delete reconnectRequests[socket.id];
      io.to(requesterId).emit('reconnect-declined', {
        partnerName: users[socket.id]?.name || 'Stranger'
      });
    }
  });

  /* ---- CHECK RECONNECTION AVAILABILITY ---- */
  socket.on('check-reconnection', () => {
    console.log(`Check reconnection for ${socket.id}`);
    const recentPartner = recentPartners[socket.id];
    
    if (recentPartner && Date.now() - recentPartner.timestamp <= 300000) {
      const partner = users[recentPartner.partnerId];
      console.log(`Recent partner found: ${recentPartner.partnerId}, online: ${!!partner}, available: ${partner && !partner.partner}`);
      
      if (partner && !partner.partner) {
        socket.emit('reconnection-available', {
          partnerName: recentPartner.partnerName,
          timeLeft: Math.floor((300000 - (Date.now() - recentPartner.timestamp)) / 1000)
        });
        return;
      }
    } else {
      console.log(`No recent partner or expired for ${socket.id}`);
    }
    
    socket.emit('reconnection-unavailable');
  });

  /* ---- FIND PARTNER (OPTIMIZED) ---- */
  socket.on('find-partner', ({ country, gender, name, userIdentity }) => {
    // PERFORMANCE: Early validation and rate limiting
    if (isSkipAbusing(socket.id)) {
      socket.emit('status-error', 'Please wait before searching again.');
      return;
    }

    const user = users.get(socket.id);
    if (!user || bannedUsers.has(socket.id)) return;

    // PERFORMANCE: Batch update user properties
    Object.assign(user, {
      country: country || 'any',
      gender: gender || 'any',
      name: (name || '').slice(0, 30),
      lastActiveAt: Date.now(),
      timeZone: new Date().getTimezoneOffset()
    });
    
    // Set identity fields
    if (userIdentity) {
      Object.assign(user, {
        username: userIdentity.username || user.name || 'Anonymous',
        email: userIdentity.email || null,
        userId: userIdentity.userId || `guest_${socket.id}`,
        loginType: userIdentity.type || 'session',
        isGuest: userIdentity.isGuest !== false
      });
    } else {
      // Fallback for users without identity
      Object.assign(user, {
        username: user.name || 'Anonymous',
        userId: `guest_${socket.id}`,
        loginType: 'session',
        isGuest: true
      });
    }

    const match = findMatchFor(socket.id, country, gender, user.timeZone);

    if (!match) {
      addToQueue(socket.id, country, gender, user.timeZone);
      socket.emit('waiting-for-partner');
      return;
    }

    // PERFORMANCE: Batch room operations
    const roomId = `room_${socket.id}_${match}`;
    const matchSocket = io.sockets.sockets.get(match);
    const matchUser = users.get(match);
    
    if (!matchSocket || !matchUser) {
      // Match user disconnected, try again
      addToQueue(socket.id, country, gender, user.timeZone);
      socket.emit('waiting-for-partner');
      return;
    }

    socket.join(roomId);
    matchSocket.join(roomId);

    // PERFORMANCE: Batch user updates
    user.partner = match;
    user.roomId = roomId;
    matchUser.partner = socket.id;
    matchUser.roomId = roomId;

    removeFromQueue(socket.id);
    removeFromQueue(match);

    const initiator = pickInitiator(socket.id, match);
    const conversationStarter = getConversationStarter();

    // Generate reconnection token for this session
    const reconnectToken = generateReconnectToken();
    
    // Store reconnectable session with usernames
    reconnectableSessions.set(reconnectToken, {
      userA: {
        socketId: socket.id,
        name: user.username || user.name || 'Stranger',
        connected: true
      },
      userB: {
        socketId: match,
        name: matchUser.username || matchUser.name || 'Stranger',
        connected: true
      },
      roomId,
      timestamp: Date.now(),
      attempts: 0
    });

    console.log(`Created reconnectable session: ${reconnectToken}`);
    console.log(`Users: ${user.username} <-> ${matchUser.username}`);

    // PERFORMANCE: Send both events together
    const partnerFoundData = {
      roomId,
      conversationStarter,
      reconnectToken,
    };

    socket.emit('partner-found', {
      ...partnerFoundData,
      initiator: initiator === socket.id,
      partnerName: matchUser.username || matchUser.name || 'Stranger',
      partnerType: matchUser.loginType,
    });

    matchSocket.emit('partner-found', {
      ...partnerFoundData,
      initiator: initiator === match,
      partnerName: user.username || user.name || 'Stranger',
      partnerType: user.loginType,
    });
  });

  /* ---- WEBRTC SIGNALING (OPTIMIZED) ---- */
  socket.on('webrtc-offer', ({ roomId, offer }) => {
    const user = users.get(socket.id);
    if (user) user.lastActiveAt = Date.now();
    socket.to(roomId).emit('webrtc-offer', { offer });
  });

  socket.on('webrtc-answer', ({ roomId, answer }) => {
    const user = users.get(socket.id);
    if (user) user.lastActiveAt = Date.now();
    socket.to(roomId).emit('webrtc-answer', { answer });
  });

  socket.on('webrtc-ice-candidate', ({ roomId, candidate }) => {
    const user = users.get(socket.id);
    if (user) user.lastActiveAt = Date.now();
    socket.to(roomId).emit('webrtc-ice-candidate', { candidate });
  });

  /* ---- LEAVE ---- */
  socket.on('leave-room', () => {
    cleanUser(socket.id);
  });

  /* ---- DISCONNECT (OPTIMIZED) ---- */
  socket.on('disconnect', () => {
    activeConnections--;
    
    cleanUser(socket.id);
    users.delete(socket.id);
    skipTracker.delete(socket.id);
    reconnectRequests.delete(socket.id);
    
    // PERFORMANCE: Batch cleanup with setTimeout to avoid blocking
    setTimeout(() => {
      recentPartners.delete(socket.id);
    }, 300000); // 5 minutes
    
    console.log(`User disconnected: ${socket.id} (${activeConnections}/${MAX_CONNECTIONS})`);
  });
});

/* =========================
   PERFORMANCE MONITORING & CLEANUP
========================= */

// PERFORMANCE: Optimized idle timeout with batch processing
setInterval(() => {
  const now = Date.now();
  const idleUsers = [];

  for (const [id, user] of users.entries()) {
    if (user.partner && now - user.lastActiveAt > 90_000) {
      idleUsers.push(id);
    }
  }

  // Batch process idle users
  for (const id of idleUsers) {
    console.log('Idle timeout:', id);
    cleanUser(id);
  }
}, 10_000);

// PERFORMANCE: Optimized cleanup with better intervals
setInterval(() => {
  const now = Date.now();
  
  // Clean expired reconnection sessions
  for (const [token, session] of reconnectableSessions.entries()) {
    if (now - session.timestamp > 60000) {
      console.log(`Cleaning up expired session: ${token}`);
      reconnectableSessions.delete(token);
    }
  }
  
  // Clean expired recent partners
  for (const [socketId, partnerData] of recentPartners.entries()) {
    if (now - partnerData.timestamp > 300000) { // 5 minutes
      recentPartners.delete(socketId);
    }
  }
  
  // Clean expired reconnect requests
  for (const [socketId, request] of reconnectRequests.entries()) {
    if (now - request.timestamp > 30000) { // 30 seconds
      reconnectRequests.delete(socketId);
    }
  }
}, 30_000);

// PERFORMANCE: Memory and connection monitoring
setInterval(() => {
  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  
  console.log(`📊 Stats: ${activeConnections} users, ${memMB}MB memory, ${users.size} active sessions`);
  
  // Alert if memory usage is high
  if (memMB > 500) {
    console.warn(`⚠️ High memory usage: ${memMB}MB`);
  }
  
  // Alert if connection limit is approaching
  if (activeConnections > MAX_CONNECTIONS * 0.9) {
    console.warn(`⚠️ Approaching connection limit: ${activeConnections}/${MAX_CONNECTIONS}`);
  }
}, 60_000);

/* =========================
   START SERVER (OPTIMIZED)
========================= */

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// PERFORMANCE: Configure server for production
if (NODE_ENV === 'production') {
  // Enable keep-alive
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  
  // Optimize for production
  app.set('trust proxy', 1);
}

server.listen(PORT, () => {
  console.log(`🚀 Strango Server running at http://localhost:${PORT}`);
  console.log(`📊 Environment: ${NODE_ENV}`);
  console.log(`👥 Max connections: ${MAX_CONNECTIONS}`);
  console.log(`🔧 Node.js version: ${process.version}`);
  
  // Log system resources
  const memUsage = process.memoryUsage();
  console.log(`💾 Initial memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
});

