// server/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { addToQueue, removeFromQueue, findMatchFor } = require('./matchmaking');
const { createStore } = require('./store');
const { adminAuthConfigured, requireAdmin, validateOrigin } = require('./security');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const store = createStore();

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 4000;
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS || 2000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const ALLOW_ALL_ORIGINS = ALLOWED_ORIGINS.length === 0 && NODE_ENV !== 'production';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

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
  cors: {
    origin: (origin, callback) => {
      if (ALLOW_ALL_ORIGINS) return callback(null, true);
      if (validateOrigin(origin, ALLOWED_ORIGINS)) return callback(null, true);
      callback(new Error('Origin not allowed'));
    }
  },
  // Connection state recovery
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  }
});

if (process.env.REDIS_URL) {
  try {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('Socket.IO Redis adapter enabled');
      })
      .catch(err => {
        console.warn(`Redis adapter disabled: ${err.message}`);
      });
  } catch (err) {
    console.warn(`Redis adapter packages unavailable: ${err.message}`);
  }
}

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
const recentPartners = new Map(); // socketId -> { partnerId, timestamp, partnerName }
const reconnectRequests = new Map(); // socketId -> { requesterId, timestamp }

// Connection tracking for limits
let activeConnections = 0;

// PERFORMANCE: Reconnection token system with Map for O(1) access
const reconnectableSessions = new Map(); // reconnectToken -> { userA, userB, roomId, timestamp, attempts }
const intervalHandles = [];

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
{
  const handle = setInterval(() => {
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
  handle.unref();
  intervalHandles.push(handle);
}


/* =========================
   EXPRESS SETUP (OPTIMIZED)
========================= */

app.use(express.json({ limit: '1mb' }));

app.use(helmet({
  frameguard: { action: 'deny' }
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.HTTP_RATE_LIMIT_PER_MIN || 300),
  standardHeaders: true,
  legacyHeaders: false
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=()');
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use('/admin.html', requireAdmin);
app.use('/admin', requireAdmin);

// PERFORMANCE: Enable compression and caching
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1d', // Cache static files for 1 day
  etag: true,
  lastModified: true
}));

/* =========================
   ADMIN ENDPOINTS (OPTIMIZED)
========================= */

app.get('/admin/users', asyncHandler(async (req, res) => {
  const now = Date.now();
  const ratingsByUserId = await store.listRatings();

  // PERFORMANCE: Use Map iteration instead of Object.entries
  const list = [];
  for (const [id, u] of users.entries()) {
    const durableUserId = u.userId || id;
    const userRating = ratingsByUserId[durableUserId];
    const ban = await store.getBan(durableUserId);
    list.push({
      id,
      userId: durableUserId,
      name: u.name || 'Stranger',
      username: u.username || 'Anonymous',
      country: u.country || 'any',
      gender: u.gender || 'any',
      partner: u.partner || null,
      roomId: u.roomId || null,
      connectedForSeconds: Math.floor((now - u.connectedAt) / 1000),
      averageRating: userRating ? userRating.averageRating.toFixed(1) : 'N/A',
      totalRatings: userRating ? userRating.ratings.length : 0,
      reportCount: await store.getReportCount(durableUserId),
      isBanned: Boolean(ban)
    });
  }

  const bans = await store.listBans();
  const appeals = await store.listAppeals();
  res.json({
    totalOnline: list.length,
    activeCalls: Math.floor(list.filter(u => u.partner).length / 2),
    maxConnections: MAX_CONNECTIONS,
    memoryUsage: process.memoryUsage(),
    bannedUsers: bans.length,
    pendingAppeals: appeals.filter(a => a.status === 'pending').length,
    users: list,
  });
}));

// NEW: Appeals management endpoint
app.get('/admin/appeals', asyncHandler(async (req, res) => {
  const appealsList = (await store.listAppeals()).map(appeal => ({
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
}));

// NEW: Appeal decision endpoint
app.post('/admin/appeals/:appealId/decision', express.json(), requireAdminApiToken, asyncHandler(async (req, res) => {
  const { appealId } = req.params;
  const { decision, adminMessage } = req.body; // decision: 'approve' or 'deny'
  
  const appeal = await store.getAppeal(appealId);
  if (!appeal) {
    return res.status(404).json({ error: 'Appeal not found' });
  }

  if (!['approve', 'deny'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approve or deny' });
  }
  
  const updatedAppeal = await store.updateAppeal(appealId, {
    status: decision === 'approve' ? 'approved' : 'denied',
    adminMessage: String(adminMessage || '').slice(0, 500)
  });
  
  // If approved, remove from banned users
  if (decision === 'approve') {
    await store.unbanUser(appeal.userId, 'appeal-approved');
    console.log(`Appeal ${appealId} approved - user ${appeal.userId} unbanned`);
  } else {
    console.log(`Appeal ${appealId} denied`);
  }
  
  // Notify user if they're online
  notifyDurableUser(appeal.userId, 'appeal-status', {
    status: updatedAppeal.status,
    message: adminMessage || (decision === 'approve' ? 'Your appeal has been approved.' : 'Your appeal has been denied.')
  });
  
  res.json({ success: true, appeal: updatedAppeal });
}));

// NEW: User ratings endpoint
app.get('/admin/ratings', asyncHandler(async (req, res) => {
  const ratingsList = [];
  const ratings = await store.listRatings();
  
  for (const [userId, ratingData] of Object.entries(ratings)) {
    const user = Array.from(users.values()).find(activeUser => activeUser.userId === userId);
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
}));

// PERFORMANCE: Add health check endpoint
app.get('/health', asyncHandler(async (req, res) => {
  const ratings = await store.listRatings();
  const appeals = await store.listAppeals();
  const bans = await store.listBans();
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    connections: activeConnections,
    memory: process.memoryUsage().heapUsed / 1024 / 1024, // MB
    auth: {
      adminConfigured: adminAuthConfigured()
    },
    scaling: {
      redisConfigured: Boolean(process.env.REDIS_URL)
    },
    features: {
      ratings: Object.keys(ratings).length,
      appeals: appeals.length,
      bannedUsers: bans.length
    }
  });
}));

app.get('/config/rtc', (req, res) => {
  const iceServers = [{ urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  res.json({ iceServers });
});

/* =========================
   HELPERS
========================= */

function pickInitiator(a, b) {
  return a < b ? a : b;
}

function sanitizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function getDurableUserId(socketId) {
  const user = users.get(socketId);
  return user?.userId || `socket_${socketId}`;
}

function getPublicName(user) {
  return user?.username || user?.name || 'Stranger';
}

function formatBanPayload(ban) {
  const remainingMs = Math.max(0, ban.expiresAt - Date.now());
  const hours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
  return {
    reason: ban.reason,
    duration: hours >= 24 ? `${Math.ceil(hours / 24)} day(s)` : `${hours} hour(s)`,
    expires: new Date(ban.expiresAt).toLocaleString()
  };
}

function notifyDurableUser(userId, eventName, payload) {
  for (const [socketId, user] of users.entries()) {
    if (user.userId === userId) {
      io.to(socketId).emit(eventName, payload);
    }
  }
}

function requireAdminApiToken(req, res, next) {
  if (!ADMIN_API_TOKEN) return next();
  const provided = String(req.headers['x-admin-token'] || '');
  if (provided !== ADMIN_API_TOKEN) {
    return res.status(403).json({ error: 'Missing or invalid admin token' });
  }
  next();
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
    partnerName: getPublicName(user2),
  });

  io.to(userId2).emit('partner-reconnected', {
    roomId,
    initiator: initiator === userId2,
    partnerName: getPublicName(user1),
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
      partnerName: getPublicName(partner)
    });
    
    recentPartners.set(user.partner, {
      partnerId: id,
      timestamp: Date.now(),
      partnerName: getPublicName(user)
    });

    console.log(`Stored recent partners: ${id} <-> ${user.partner}`);

    user.lastPartner = user.partner;
    user.lastPartnerUserId = partner.userId || user.partner;
    partner.lastPartner = id;
    partner.lastPartnerUserId = user.userId || id;

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
    deviceId: null,
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

  /* ---- BLOCK (OPTIMIZED) ---- */
  socket.on('block-user', async ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user || !user.partner) return;

    const offenderSocketId = user.partner;
    const offenderUserId = getDurableUserId(offenderSocketId);
    const ban = await store.banUser(
      offenderUserId,
      'Blocked by chat partner',
      24 * 60 * 60 * 1000,
      getDurableUserId(socket.id)
    );
    io.to(offenderSocketId).emit('user-banned', formatBanPayload(ban));
    cleanUser(offenderSocketId);
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
  socket.on('submit-rating', async ({ rating, comment, partnerName }) => {
    const user = users.get(socket.id);
    if (!user) return;
    
    // Validate rating
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) return;
    
    const partnerId = user.partner || user.lastPartner;
    const partnerUser = users.get(partnerId);
    
    if (partnerId) {
      const ratedUserId = partnerUser?.userId || user.lastPartnerUserId || partnerId;
      // Store rating for partner
      await store.addRating(
        ratedUserId,
        numericRating,
        sanitizeText(comment, 300),
        getDurableUserId(socket.id)
      );
      
      // Notify partner if rating is good
      if (numericRating >= 4 && partnerUser) {
        io.to(partnerId).emit('rating-received', { rating: numericRating, comment: sanitizeText(comment, 300) });
      }
      
      console.log(`Rating submitted: ${numericRating}/5 for user ${ratedUserId}`);
    }
  });

  /* ---- NEW FEATURES: APPEAL SYSTEM ---- */
  socket.on('submit-appeal', async ({ reason, message, email, userId }) => {
    const user = users.get(socket.id);
    if (!user) return;
    
    // Generate appeal ID
    const appealId = generateId('appeal');
    
    const appeal = await store.createAppeal({
      id: appealId,
      userId: user.userId || sanitizeText(userId, 120) || socket.id,
      username: user.username || 'Anonymous',
      reason: sanitizeText(reason, 80),
      message: sanitizeText(message, 500),
      email: sanitizeText(email, 200)
    });
    
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
  socket.on('report-user', async ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user || !user.partner) return;

    const offender = user.partner;
    const offenderUserId = getDurableUserId(offender);
    const reportCount = await store.addReport(offenderUserId, getDurableUserId(socket.id));

    console.log(`User ${offenderUserId} reported. Total reports: ${reportCount}`);

    if (reportCount >= 3) {
      // Calculate ban duration based on reports
      let banDurationMs = 24 * 60 * 60 * 1000;
      
      if (reportCount >= 5) {
        banDurationMs = 7 * 24 * 60 * 60 * 1000;
      }
      const ban = await store.banUser(
        offenderUserId,
        'Multiple user reports for inappropriate behavior',
        banDurationMs,
        'report-threshold'
      );
      
      // Notify banned user
      io.to(offender).emit('user-banned', formatBanPayload(ban));
      
      console.log(`User ${offenderUserId} banned until ${new Date(ban.expiresAt).toISOString()}`);
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

      // Ensure both users exist in users map
      if (!users.has(session.userA.socketId)) {
        users.set(session.userA.socketId, {
          connectedAt: Date.now(),
          lastActiveAt: Date.now(),
          country: 'any',
          gender: 'any',
          name: session.userA.name,
          username: session.userA.name,
          userId: session.userA.userId || `guest_${session.userA.socketId}`,
          partner: null,
          roomId: null,
        });
      }
      
      if (!users.has(session.userB.socketId)) {
        users.set(session.userB.socketId, {
          connectedAt: Date.now(),
          lastActiveAt: Date.now(),
          country: 'any',
          gender: 'any',
          name: session.userB.name,
          username: session.userB.name,
          userId: session.userB.userId || `guest_${session.userB.socketId}`,
          partner: null,
          roomId: null,
        });
      }

      // Rejoin room
      userASocket.join(roomId);
      userBSocket.join(roomId);

      // Update user states
      const userA = users.get(session.userA.socketId);
      const userB = users.get(session.userB.socketId);
      userA.partner = session.userB.socketId;
      userA.roomId = roomId;
      userA.lastActiveAt = Date.now();

      userB.partner = session.userA.socketId;
      userB.roomId = roomId;
      userB.lastActiveAt = Date.now();

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
  socket.on('reconnect-partner', async () => {
    const user = users.get(socket.id);
    if (!user || await store.getBan(getDurableUserId(socket.id))) {
      socket.emit('reconnect-failed', { reason: 'User not found or banned' });
      return;
    }

    const recentPartner = recentPartners.get(socket.id);
    
    // Check if recent partner exists and is still valid (within 5 minutes)
    if (!recentPartner || Date.now() - recentPartner.timestamp > 300000) {
      // No server-side recent partner, but client might have one
      // Search for any user who has this socket as their recent partner
      let foundPartnerId = null;
      for (const [userId, partnerData] of recentPartners.entries()) {
        if (partnerData.partnerId === socket.id && Date.now() - partnerData.timestamp <= 300000) {
          foundPartnerId = userId;
          break;
        }
      }
      
      if (!foundPartnerId) {
        // Try to find by searching all users' recent partners
        for (const [userId, partnerData] of recentPartners.entries()) {
          const partner = users.get(userId);
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
      const partner = users.get(foundPartnerId);
      if (!partner || partner.partner) {
        socket.emit('reconnect-failed', { reason: 'Partner is no longer available' });
        return;
      }
      
      // Send reconnection request
      reconnectRequests.set(foundPartnerId, {
        requesterId: socket.id,
        timestamp: Date.now()
      });

      socket.emit('reconnect-request-sent', { partnerName: getPublicName(partner) });
      io.to(foundPartnerId).emit('reconnect-request-received', {
        requesterName: getPublicName(user),
        requesterId: socket.id
      });

      // Auto-expire request after 30 seconds
      setTimeout(() => {
        if (reconnectRequests.get(foundPartnerId)?.requesterId === socket.id) {
          reconnectRequests.delete(foundPartnerId);
          socket.emit('reconnect-request-expired');
          io.to(foundPartnerId).emit('reconnect-request-expired');
        }
      }, 30000);
      
      return;
    }

    const partnerId = recentPartner.partnerId;
    const partner = users.get(partnerId);

    // Check if partner is still online and available
    if (!partner || partner.partner) {
      socket.emit('reconnect-failed', { reason: 'Partner is no longer available' });
      return;
    }

    // Check if partner also wants to reconnect (mutual reconnection)
    const partnerRecentPartner = recentPartners.get(partnerId);
    if (!partnerRecentPartner || partnerRecentPartner.partnerId !== socket.id) {
      socket.emit('reconnect-failed', { reason: 'Partner connection mismatch' });
      return;
    }

    // Check if there's already a pending request from the partner
    const existingRequest = reconnectRequests.get(socket.id);
    if (existingRequest && existingRequest.requesterId === partnerId) {
      // Partner already sent a request, auto-accept and reconnect
      performReconnection(socket.id, partnerId);
      reconnectRequests.delete(socket.id);
      reconnectRequests.delete(partnerId);
      return;
    }

    // Send reconnection request to partner
    reconnectRequests.set(partnerId, {
      requesterId: socket.id,
      timestamp: Date.now()
    });

    socket.emit('reconnect-request-sent', { partnerName: recentPartner.partnerName });
    io.to(partnerId).emit('reconnect-request-received', {
      requesterName: getPublicName(user),
      requesterId: socket.id
    });

    // Auto-expire request after 30 seconds
    setTimeout(() => {
      if (reconnectRequests.get(partnerId)?.requesterId === socket.id) {
        reconnectRequests.delete(partnerId);
        socket.emit('reconnect-request-expired');
        io.to(partnerId).emit('reconnect-request-expired');
      }
    }, 30000);
  });

  /* ---- ACCEPT RECONNECTION REQUEST ---- */
  socket.on('accept-reconnect', ({ requesterId }) => {
    const request = reconnectRequests.get(socket.id);
    
    if (!request || request.requesterId !== requesterId) {
      socket.emit('reconnect-failed', { reason: 'Invalid or expired request' });
      return;
    }

    const requester = users.get(requesterId);
    if (!requester || requester.partner) {
      socket.emit('reconnect-failed', { reason: 'Requester is no longer available' });
      reconnectRequests.delete(socket.id);
      return;
    }

    // Perform the reconnection
    performReconnection(requesterId, socket.id);
    reconnectRequests.delete(socket.id);
    reconnectRequests.delete(requesterId);
  });

  /* ---- DECLINE RECONNECTION REQUEST ---- */
  socket.on('decline-reconnect', ({ requesterId }) => {
    const request = reconnectRequests.get(socket.id);
    
    if (request && request.requesterId === requesterId) {
      reconnectRequests.delete(socket.id);
      io.to(requesterId).emit('reconnect-declined', {
        partnerName: getPublicName(users.get(socket.id))
      });
    }
  });

  /* ---- CHECK RECONNECTION AVAILABILITY ---- */
  socket.on('check-reconnection', () => {
    console.log(`Check reconnection for ${socket.id}`);
    const recentPartner = recentPartners.get(socket.id);
    
    if (recentPartner && Date.now() - recentPartner.timestamp <= 300000) {
      const partner = users.get(recentPartner.partnerId);
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
  socket.on('find-partner', async ({ country, gender, name, userIdentity }) => {
    // PERFORMANCE: Early validation and rate limiting
    if (isSkipAbusing(socket.id)) {
      socket.emit('status-error', 'Please wait before searching again.');
      return;
    }

    const user = users.get(socket.id);
    if (!user) return;

    // PERFORMANCE: Batch update user properties
    Object.assign(user, {
      country: sanitizeText(country, 5) || 'any',
      gender: sanitizeText(gender, 20) || 'any',
      name: sanitizeText(name, 30),
      lastActiveAt: Date.now(),
      timeZone: new Date().getTimezoneOffset()
    });
    
    // Set identity fields
    if (userIdentity) {
      const deviceId = sanitizeText(userIdentity.deviceId, 120) || `device_${socket.id}`;
      const suppliedUserId = sanitizeText(userIdentity.userId, 160);
      Object.assign(user, {
        username: sanitizeText(userIdentity.username || user.name || 'Anonymous', 30),
        email: sanitizeText(userIdentity.email, 200) || null,
        userId: suppliedUserId || `guest_${deviceId}`,
        deviceId,
        loginType: sanitizeText(userIdentity.type, 20) || 'session',
        isGuest: userIdentity.isGuest !== false
      });
    } else {
      // Fallback for users without identity
      Object.assign(user, {
        username: user.name || 'Anonymous',
        userId: `guest_${socket.id}`,
        deviceId: `device_${socket.id}`,
        loginType: 'session',
        isGuest: true
      });
    }

    const activeBan = await store.getBan(user.userId);
    if (activeBan) {
      socket.emit('user-banned', formatBanPayload(activeBan));
      socket.emit('status-error', 'This identity is temporarily restricted.');
      return;
    }

    const match = findMatchFor(socket.id, user.country, user.gender, user.timeZone);

    if (!match) {
      addToQueue(socket.id, user.country, user.gender, user.timeZone);
      socket.emit('waiting-for-partner');
      return;
    }

    // PERFORMANCE: Batch room operations
    const roomId = `room_${socket.id}_${match}`;
    const matchSocket = io.sockets.sockets.get(match);
    const matchUser = users.get(match);
    
    if (!matchSocket || !matchUser) {
      // Match user disconnected, try again
      addToQueue(socket.id, user.country, user.gender, user.timeZone);
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
        userId: user.userId,
        connected: true
      },
      userB: {
        socketId: match,
        name: matchUser.username || matchUser.name || 'Stranger',
        userId: matchUser.userId,
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
{
  const handle = setInterval(() => {
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
  handle.unref();
  intervalHandles.push(handle);
}

// PERFORMANCE: Optimized cleanup with better intervals
{
  const handle = setInterval(() => {
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
  handle.unref();
  intervalHandles.push(handle);
}

// PERFORMANCE: Memory and connection monitoring
{
  const handle = setInterval(() => {
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
  handle.unref();
  intervalHandles.push(handle);
}

/* =========================
   START SERVER (OPTIMIZED)
========================= */

function start(listenPort = PORT) {
  // PERFORMANCE: Configure server for production
  if (NODE_ENV === 'production') {
    // Enable keep-alive
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Optimize for production
    app.set('trust proxy', 1);
  }

  return new Promise((resolve) => {
    server.listen(listenPort, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : listenPort;
      console.log(`🚀 Strango Server running at http://localhost:${actualPort}`);
      console.log(`📊 Environment: ${NODE_ENV}`);
      console.log(`👥 Max connections: ${MAX_CONNECTIONS}`);
      console.log(`🔧 Node.js version: ${process.version}`);

      const memUsage = process.memoryUsage();
      console.log(`💾 Initial memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
      resolve({ port: actualPort });
    });
  });
}

function stop() {
  for (const handle of intervalHandles) clearInterval(handle);
  intervalHandles.length = 0;
  try { io.close(); } catch {}
  return new Promise((resolve) => server.close(resolve));
}

module.exports = { app, server, io, start, stop };

if (require.main === module) {
  start().catch(err => {
    console.error('Failed to start server:', err);
    process.exitCode = 1;
  });
}

