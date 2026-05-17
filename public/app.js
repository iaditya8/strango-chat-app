// public/app.js
const socket = io();

/* =========================
   DOM REFERENCES (STRICT)
========================= */
const landingPage = document.getElementById('landingPage');
const mainPage = document.getElementById('mainPage');

const startLandingBtn = document.getElementById('startLandingBtn');
const ageCheck = document.getElementById('ageCheck');
const termsCheck = document.getElementById('termsCheck');
const humanCheck = document.getElementById('humanCheck');

// Login elements
const sessionLoginRadio = document.getElementById('sessionLogin');
const persistentLoginRadio = document.getElementById('persistentLogin');
const usernameInput = document.getElementById('usernameInput');
const emailInput = document.getElementById('emailInput');
const loginOptions = document.querySelectorAll('.login-option');
const infoItems = document.querySelectorAll('.info-item');

const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const reconnectBtn = document.getElementById('reconnectBtn');
const reconnectPartnerName = document.getElementById('reconnectPartnerName');
const nextBtn = document.getElementById('nextBtn');

const countrySelect = document.getElementById('country');
const genderSelect = document.getElementById('gender');
const displayNameInput = document.getElementById('displayName');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

const reportBtn = document.getElementById('reportBtn');
const blockBtn = document.getElementById('blockBtn');

const reconnectModal = document.getElementById('reconnectModal');
const reconnectRequesterName = document.getElementById('reconnectRequesterName');
const acceptReconnectBtn = document.getElementById('acceptReconnectBtn');
const declineReconnectBtn = document.getElementById('declineReconnectBtn');

let currentReconnectRequesterId = null;

const remoteAudio = document.getElementById('remoteAudio');
const connectionBadge = document.getElementById('connectionBadge');
const partnerName = document.getElementById('partnerName');
const typingIndicator = document.getElementById('typingIndicator');
const connectionQuality = document.getElementById('connectionQuality');

/* =========================
   LOGIN SYSTEM
========================= */

let userIdentity = {
  type: 'session', // 'session' or 'persistent'
  username: null,
  email: null,
  userId: null,
  deviceId: null,
  isGuest: true
};

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem('strango_device_id');
  if (!deviceId) {
    const randomId = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    deviceId = `device_${randomId}`;
    localStorage.setItem('strango_device_id', deviceId);
  }
  return deviceId;
}

// Login option switching
sessionLoginRadio.addEventListener('change', () => {
  if (sessionLoginRadio.checked) {
    switchLoginOption('session');
  }
});

persistentLoginRadio.addEventListener('change', () => {
  if (persistentLoginRadio.checked) {
    switchLoginOption('persistent');
  }
});

// Click on option cards to select
loginOptions.forEach(option => {
  option.addEventListener('click', () => {
    const type = option.dataset.type;
    const radio = type === 'session' ? sessionLoginRadio : persistentLoginRadio;
    radio.checked = true;
    switchLoginOption(type);
  });
});

function switchLoginOption(type) {
  // Update active states
  loginOptions.forEach(option => {
    option.classList.toggle('active', option.dataset.type === type);
  });
  
  infoItems.forEach(item => {
    item.classList.toggle('active', item.dataset.for === type);
  });
  
  // Enable/disable inputs
  if (type === 'session') {
    usernameInput.disabled = false;
    emailInput.disabled = true;
    emailInput.value = '';
    usernameInput.focus();
  } else {
    usernameInput.disabled = true;
    emailInput.disabled = false;
    usernameInput.value = '';
    emailInput.focus();
  }
  
  updateLandingButtonState();
}

function validateLogin() {
  const loginType = sessionLoginRadio.checked ? 'session' : 'persistent';
  
  if (loginType === 'session') {
    const username = usernameInput.value.trim();
    if (!username || username.length < 3) {
      return { valid: false, message: 'Username must be at least 3 characters' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { valid: false, message: 'Username can only contain letters, numbers, and underscores' };
    }
    const deviceId = getOrCreateDeviceId();
    return { valid: true, type: 'session', username, deviceId, userId: `guest_${deviceId}` };
  } else {
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
      return { valid: false, message: 'Please enter a valid email address' };
    }
    const username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
    const deviceId = getOrCreateDeviceId();
    return { valid: true, type: 'persistent', email, username, deviceId, userId: `persistent_${email.toLowerCase()}` };
  }
}

// Initialize login system
function initializeLogin() {
  // Check for existing persistent login
  const savedLogin = localStorage.getItem('strango_user');
  if (savedLogin) {
    try {
      const userData = JSON.parse(savedLogin);
      if (userData.type === 'persistent' && userData.email) {
        // Auto-fill persistent login
        persistentLoginRadio.checked = true;
        emailInput.value = userData.email;
        userIdentity.deviceId = getOrCreateDeviceId();
        switchLoginOption('persistent');
        return;
      }
    } catch (e) {
      localStorage.removeItem('strango_user');
    }
  }
  
  // Default to session login
  sessionLoginRadio.checked = true;
  switchLoginOption('session');
}

function restoreIdentityForCompletedSession() {
  const deviceId = getOrCreateDeviceId();
  const savedLogin = localStorage.getItem('strango_user');
  if (savedLogin) {
    try {
      const userData = JSON.parse(savedLogin);
      if (userData.type === 'persistent' && userData.email) {
        userIdentity = {
          type: 'persistent',
          username: userData.username,
          email: userData.email,
          userId: userData.userId || `persistent_${userData.email.toLowerCase()}`,
          deviceId,
          isGuest: false
        };
        displayNameInput.value = userIdentity.username || '';
        return;
      }
    } catch {
      localStorage.removeItem('strango_user');
    }
  }

  const username = displayNameInput.value.trim() || `Guest_${deviceId.slice(-6)}`;
  userIdentity = {
    type: 'session',
    username,
    email: null,
    userId: `guest_${deviceId}`,
    deviceId,
    isGuest: true
  };
  displayNameInput.value = username;
}

/* =========================
   SKIP ABUSE PROTECTION (CLIENT)
========================= */
let lastNextClickTime = 0;
const NEXT_CLICK_COOLDOWN = 3000; // 3 seconds


/* =========================
   SPAM & ABUSE PROTECTION
========================= */
let lastMessageTime = 0;
const MESSAGE_COOLDOWN = 800; // ms

const MAX_MESSAGE_LENGTH = 300;

/* =========================
   TYPING INDICATOR
========================= */
let typingTimeout = null;
let isTyping = false;
const TYPING_TIMEOUT = 2000; // 2 seconds

/* =========================
   CONNECTION QUALITY
========================= */
let qualityCheckInterval = null;
let lastQualityCheck = 0;

/* =========================
   SMART AUTO-NEXT
========================= */
let autoNextTimeout = null;
let lastAudioActivity = 0;
let lastChatActivity = 0;
const AUTO_NEXT_DELAY = 35000; // 35 seconds
const AUDIO_ACTIVITY_THRESHOLD = 0.01;




/* =========================
   INITIAL UI STATE
========================= */
window.addEventListener('DOMContentLoaded', () => {
  userIdentity.deviceId = getOrCreateDeviceId();
  loadRtcConfig();

  // Check if user has already completed landing page in this session
  const hasCompletedLanding = sessionStorage.getItem('strango_completed_landing');
  
  if (hasCompletedLanding === 'true') {
    // Skip landing page and go directly to main app (same session)
    restoreIdentityForCompletedSession();
    landingPage.style.display = 'none';
    mainPage.classList.remove('hidden');
    statusEl.textContent = 'Ready to connect';
  } else {
    // Show landing page (new session or first visit)
    landingPage.style.display = 'flex';
    mainPage.classList.add('hidden');
    
    // Initialize login system
    initializeLogin();
  }

  chatInput.disabled = true;
  sendBtn.disabled = true;
  nextBtn.disabled = true;
  reconnectBtn.style.display = 'none'; // Initially hidden
});

/* =========================
   LANDING PAGE LOGIC
========================= */
function updateLandingButtonState() {
  const loginValid = validateLogin().valid;
  startLandingBtn.disabled = !(
    ageCheck.checked &&
    termsCheck.checked &&
    humanCheck.checked &&
    loginValid
  );
}

ageCheck.addEventListener('change', updateLandingButtonState);
termsCheck.addEventListener('change', updateLandingButtonState);
humanCheck.addEventListener('change', updateLandingButtonState);
usernameInput.addEventListener('input', updateLandingButtonState);
emailInput.addEventListener('input', updateLandingButtonState);

startLandingBtn.addEventListener('click', () => {
  const loginValidation = validateLogin();
  
  if (!loginValidation.valid) {
    alert(loginValidation.message);
    return;
  }
  
  // Store user identity
  userIdentity = {
    type: loginValidation.type,
    username: loginValidation.username,
    email: loginValidation.email || null,
    userId: loginValidation.userId,
    deviceId: loginValidation.deviceId || getOrCreateDeviceId(),
    isGuest: loginValidation.type === 'session'
  };
  
  // Save persistent login
  if (loginValidation.type === 'persistent') {
    localStorage.setItem('strango_user', JSON.stringify({
      type: 'persistent',
      email: loginValidation.email,
      username: loginValidation.username,
      userId: loginValidation.userId
    }));
  }
  
  // Save session completion
  sessionStorage.setItem('strango_completed_landing', 'true');
  
  // Update display name with chosen username
  displayNameInput.value = userIdentity.username;
  
  landingPage.style.display = 'none';
  mainPage.classList.remove('hidden');
  statusEl.textContent = `Welcome ${userIdentity.username}! Ready to connect`;
});

/* =========================
   SOCKET STATUS
========================= */
socket.on('connect', () => {
  connectionBadge.textContent = 'Online';
  statusEl.textContent = 'Connected to server';
  
  // Check if there's a reconnection token from previous session
  const reconnectToken = sessionStorage.getItem('strango_reconnect_token');
  const partnerName = sessionStorage.getItem('strango_partner_name');
  
  if (reconnectToken && partnerName) {
    console.log('Found reconnection token, attempting to reconnect...');
    reconnectPartnerName.textContent = partnerName;
    reconnectBtn.style.display = 'block';
    statusEl.textContent = `Reconnection available with ${partnerName} (60s window)`;
    
    // Auto-attempt reconnection
    setTimeout(() => {
      socket.emit('reconnect-with-token', { reconnectToken });
    }, 500);
  }
});

socket.on('disconnect', () => {
  connectionBadge.textContent = 'Offline';
  statusEl.textContent = 'Disconnected';
});

/* =========================
   SERVER WARNINGS
========================= */
socket.on('status-error', (msg) => {
  statusEl.textContent = msg;
  startBtn.disabled = false;
});

/* =========================
   RECONNECTION SYSTEM (TOKEN-BASED)
========================= */
socket.on('reconnect-waiting', ({ partnerName, message }) => {
  console.log('Reconnect waiting:', message);
  statusEl.textContent = `Waiting for ${partnerName} to reconnect...`;
  reconnectBtn.style.display = 'none';
  addMessage(`⏳ ${message}`, 'system');
});

socket.on('partner-reconnecting', ({ partnerName, message }) => {
  console.log('Partner reconnecting:', message);
  statusEl.textContent = `${partnerName} is reconnecting...`;
  addMessage(`🔄 ${message}`, 'system');
});

socket.on('reconnect-failed', ({ reason }) => {
  console.log('Reconnection failed:', reason);
  reconnectBtn.style.display = 'none';
  statusEl.textContent = `Reconnection failed: ${reason}`;
  addMessage(`❌ Reconnection failed: ${reason}`, 'system');
  
  // Clear tokens on failure
  sessionStorage.removeItem('strango_reconnect_token');
  sessionStorage.removeItem('strango_partner_name');
});

socket.on('partner-reconnected', async ({ roomId, initiator, partnerName: partnerDisplayName, reconnectToken }) => {
  currentRoomId = roomId;
  isInitiator = initiator;

  chatMessages.innerHTML = '';
  chatInput.disabled = false;
  sendBtn.disabled = false;
  nextBtn.disabled = false;
  reconnectBtn.style.display = 'none';
  reconnectBtn.disabled = false;
  reconnectModal.classList.add('hidden');
  currentReconnectRequesterId = null;

  const displayName = partnerDisplayName || 'Stranger';
  statusEl.textContent = `Reconnected with ${displayName}`;
  partnerName.textContent = displayName;

  addMessage('🔄 Reconnected successfully!', 'system');

  // Keep the token for future disconnects
  if (reconnectToken) {
    sessionStorage.setItem('strango_reconnect_token', reconnectToken);
    sessionStorage.setItem('strango_partner_name', displayName);
  }

  // Start smart auto-next monitoring
  startAutoNextMonitoring();

  await createPeerConnection();

  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc-offer', { roomId, offer });
  }
});

/* =========================
   RECONNECT BUTTON
========================= */
reconnectBtn.addEventListener('click', () => {
  const reconnectToken = sessionStorage.getItem('strango_reconnect_token');
  
  if (!reconnectToken) {
    statusEl.textContent = 'No reconnection token found';
    return;
  }
  
  reconnectBtn.disabled = true;
  statusEl.textContent = 'Attempting to reconnect...';
  socket.emit('reconnect-with-token', { reconnectToken });
  
  setTimeout(() => {
    reconnectBtn.disabled = false;
  }, 3000);
});

/* =========================
   RECONNECT MODAL ACTIONS
========================= */
acceptReconnectBtn.addEventListener('click', () => {
  if (currentReconnectRequesterId) {
    socket.emit('accept-reconnect', { requesterId: currentReconnectRequesterId });
    reconnectModal.classList.add('hidden');
    statusEl.textContent = 'Reconnecting...';
    currentReconnectRequesterId = null;
  }
});

declineReconnectBtn.addEventListener('click', () => {
  if (currentReconnectRequesterId) {
    socket.emit('decline-reconnect', { requesterId: currentReconnectRequesterId });
    reconnectModal.classList.add('hidden');
    currentReconnectRequesterId = null;
    statusEl.textContent = 'Reconnection request declined';
  }
});


/* =========================
   WEBRTC STATE
========================= */
let localStream = null;
let peerConnection = null;
let currentRoomId = null;
let isInitiator = false;

let rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

async function loadRtcConfig() {
  try {
    const res = await fetch('/config/rtc', { credentials: 'same-origin' });
    if (!res.ok) return;
    const config = await res.json();
    if (Array.isArray(config.iceServers) && config.iceServers.length > 0) {
      rtcConfig = { iceServers: config.iceServers };
    }
  } catch (err) {
    console.log('Using fallback RTC config:', err);
  }
}

/* =========================
   START MATCHMAKING
========================= */
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;

  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      statusEl.textContent = 'Microphone access denied';
      startBtn.disabled = false;
      return;
    }
  }

  const payload = {
    country: countrySelect.value,
    gender: genderSelect.value,
    name: displayNameInput.value.trim().slice(0, 30),
    userIdentity: userIdentity
  };

  statusEl.textContent = 'Looking for a partner...';
  socket.emit('find-partner', payload);
});

/* =========================
   NEXT PARTNER (PROTECTED)
========================= */
nextBtn.addEventListener('click', () => {
  const now = Date.now();

  // ADDED: client-side cooldown
  if (now - lastNextClickTime < NEXT_CLICK_COOLDOWN) {
    statusEl.textContent = 'Please wait before skipping again.';
    return;
  }

  lastNextClickTime = now;

  endCall(true);
});


/* =========================
   SOCKET EVENTS
========================= */
socket.on('waiting-for-partner', () => {
  statusEl.textContent = 'Waiting for partner...';
});

socket.on('partner-found', async ({ roomId, initiator, partnerName: partnerDisplayName, conversationStarter, reconnectToken }) => {
  currentRoomId = roomId;
  isInitiator = initiator;

  chatMessages.innerHTML = '';
  chatInput.disabled = false;
  sendBtn.disabled = false;
  nextBtn.disabled = false;
  reconnectBtn.style.display = 'none'; // Hide reconnect button when new partner found

  const displayName = partnerDisplayName || 'Stranger';
  statusEl.textContent = `Connected to ${displayName}`;
  partnerName.textContent = displayName;

  // Store reconnection token in sessionStorage
  if (reconnectToken) {
    sessionStorage.setItem('strango_reconnect_token', reconnectToken);
    sessionStorage.setItem('strango_partner_name', displayName);
    console.log('Stored reconnection token:', reconnectToken);
  }

  // Show conversation starter
  if (conversationStarter) {
    setTimeout(() => {
      if (currentRoomId === roomId) {
        addMessage(`💡 Conversation starter: ${conversationStarter}`, 'system');
      }
    }, 1500);
  }

  // Start smart auto-next monitoring
  startAutoNextMonitoring();

  await createPeerConnection();

  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc-offer', { roomId, offer });
  }
});

socket.on('webrtc-offer', async ({ offer }) => {
  await createPeerConnection();
  await peerConnection.setRemoteDescription(offer);

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('webrtc-answer', { roomId: currentRoomId, answer });
});

socket.on('webrtc-answer', async ({ answer }) => {
  await peerConnection.setRemoteDescription(answer);
});

socket.on('webrtc-ice-candidate', async ({ candidate }) => {
  if (candidate && peerConnection) {
    await peerConnection.addIceCandidate(candidate);
  }
});

socket.on('partner-left', () => {
  const previousPartnerName = partnerName.textContent;
  statusEl.textContent = 'Partner disconnected';
  partnerName.textContent = 'No partner';
  
  endCall(false);

  if (previousPartnerName !== 'No partner' && previousPartnerName !== 'Searching...') {
    setTimeout(() => {
      showRatingModal(previousPartnerName);
    }, 1000);
  }
  
  // Check if reconnection is available AFTER endCall
  addMessage('⚠️ Partner disconnected. Checking if reconnection is available...', 'system');
  setTimeout(() => {
    socket.emit('check-reconnection');
  }, 1000);
});

socket.on('chat-message', ({ msg }) => {
  addMessage(msg, 'stranger');
  hideTypingIndicator();
});

/* =========================
   TYPING INDICATOR EVENTS
========================= */
socket.on('typing-start', () => {
  showTypingIndicator();
});

socket.on('typing-stop', () => {
  hideTypingIndicator();
});

function showTypingIndicator() {
  if (typingIndicator) {
    typingIndicator.classList.remove('hidden');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function hideTypingIndicator() {
  if (typingIndicator) {
    typingIndicator.classList.add('hidden');
  }
}

function handleTyping() {
  if (!currentRoomId || isTyping) return;
  
  isTyping = true;
  socket.emit('typing-start', { roomId: currentRoomId });
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    socket.emit('typing-stop', { roomId: currentRoomId });
  }, TYPING_TIMEOUT);
}

function startAutoNextMonitoring() {
  clearTimeout(autoNextTimeout);
  lastChatActivity = Date.now();
  lastAudioActivity = Date.now();
  
  autoNextTimeout = setTimeout(() => {
    const now = Date.now();
    const timeSinceChat = now - lastChatActivity;
    const timeSinceAudio = now - lastAudioActivity;
    
    // Auto-next if no activity for 35 seconds
    if (timeSinceChat > AUTO_NEXT_DELAY && timeSinceAudio > AUTO_NEXT_DELAY) {
      addMessage('🔄 No activity detected, finding new partner...', 'system');
      setTimeout(() => endCall(true), 1500);
    }
  }, AUTO_NEXT_DELAY);
}

function stopAutoNextMonitoring() {
  clearTimeout(autoNextTimeout);
}

function startAudioActivityMonitoring(stream) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    
    source.connect(analyser);
    analyser.fftSize = 256;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function checkAudioLevel() {
      if (!currentRoomId) return;
      
      analyser.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      
      const average = sum / bufferLength / 255;
      
      if (average > AUDIO_ACTIVITY_THRESHOLD) {
        lastAudioActivity = Date.now();
      }
      
      requestAnimationFrame(checkAudioLevel);
    }
    
    checkAudioLevel();
  } catch (err) {
    console.log('Audio monitoring not available:', err);
  }
}

/* =========================
   PEER CONNECTION
========================= */
async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  localStream.getTracks().forEach(track =>
    peerConnection.addTrack(track, localStream)
  );

  peerConnection.ontrack = e => {
    remoteAudio.srcObject = e.streams[0];
    startConnectionQualityMonitoring();
    startAudioActivityMonitoring(e.streams[0]);
  };

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit('webrtc-ice-candidate', {
        roomId: currentRoomId,
        candidate: e.candidate,
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    updateConnectionQuality(peerConnection.connectionState);
  };
}

function startConnectionQualityMonitoring() {
  if (qualityCheckInterval) clearInterval(qualityCheckInterval);
  
  qualityCheckInterval = setInterval(async () => {
    if (!peerConnection) return;
    
    try {
      const stats = await peerConnection.getStats();
      let quality = 'good';
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'audio') {
          const packetsLost = report.packetsLost || 0;
          const packetsReceived = report.packetsReceived || 1;
          const lossRate = packetsLost / (packetsLost + packetsReceived);
          
          if (lossRate > 0.05) quality = 'poor';
          else if (lossRate > 0.02) quality = 'fair';
        }
      });
      
      updateConnectionQualityUI(quality);
    } catch (err) {
      console.log('Quality check failed:', err);
    }
  }, 3000);
}

function updateConnectionQuality(state) {
  if (!connectionQuality) return;
  
  switch (state) {
    case 'connected':
      connectionQuality.classList.remove('hidden');
      break;
    case 'disconnected':
    case 'failed':
      connectionQuality.classList.add('hidden');
      break;
  }
}

function updateConnectionQualityUI(quality) {
  if (!connectionQuality) return;
  
  const qualityText = connectionQuality.querySelector('.quality-text');
  connectionQuality.className = `connection-quality quality-${quality}`;
  
  switch (quality) {
    case 'poor':
      qualityText.textContent = 'Poor';
      break;
    case 'fair':
      qualityText.textContent = 'Fair';
      break;
    default:
      qualityText.textContent = 'Good';
  }
}

/* =========================
   END CALL
========================= */
function endCall(findNew) {
  if (currentRoomId) {
    socket.emit('leave-room', { roomId: currentRoomId });
  }

  currentRoomId = null;
  
  // Stop monitoring
  stopAutoNextMonitoring();
  clearInterval(qualityCheckInterval);
  hideTypingIndicator();

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  chatMessages.innerHTML = '';
  chatInput.disabled = true;
  sendBtn.disabled = true;
  nextBtn.disabled = true;
  
  if (connectionQuality) {
    connectionQuality.classList.add('hidden');
  }

  if (findNew) {
  startBtn.disabled = true;
  reconnectBtn.style.display = 'none'; // Hide reconnect when finding new partner
  partnerName.textContent = 'Searching...';

  // Clear reconnection tokens when finding new partner
  sessionStorage.removeItem('strango_reconnect_token');
  sessionStorage.removeItem('strango_partner_name');

  socket.emit('find-partner', {
    country: countrySelect.value,
    gender: genderSelect.value,
    name: displayNameInput.value.trim().slice(0, 30),
    userIdentity: userIdentity
  });

  statusEl.textContent = 'Looking for a new partner...';
  } else {
    statusEl.textContent = 'Not connected';
    partnerName.textContent = 'No partner';
    startBtn.disabled = false;
  }
}

/* =========================
   CHAT
========================= */
chatInput.addEventListener('input', () => {
  if (currentRoomId && chatInput.value.trim()) {
    handleTyping();
  }
});

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

// Quick message buttons
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('quick-msg')) {
    const message = e.target.dataset.msg;
    if (currentRoomId && message) {
      sendQuickMessage(message);
    }
  }
});

function sendQuickMessage(message) {
  if (!currentRoomId) {
    statusEl.textContent = 'Connect to a partner to chat.';
    return;
  }

  const now = Date.now();
  if (now - lastMessageTime < MESSAGE_COOLDOWN) {
    statusEl.textContent = 'You are sending messages too fast.';
    return;
  }
  lastMessageTime = now;

  // Stop typing indicator when sending
  clearTimeout(typingTimeout);
  isTyping = false;
  socket.emit('typing-stop', { roomId: currentRoomId });
  
  addMessage(message, 'self');
  socket.emit('chat-message', { roomId: currentRoomId, msg: message });
}

function sendMessage() {
  if (!currentRoomId) {
    statusEl.textContent = 'Connect to a partner to chat.';
    return;
  }

  const now = Date.now();
  if (now - lastMessageTime < MESSAGE_COOLDOWN) {
    statusEl.textContent = 'You are sending messages too fast.';
    return;
  }
  lastMessageTime = now;

  const msg = chatInput.value.trim();
  if (!msg) return;

  if (msg.length > MAX_MESSAGE_LENGTH) {
    statusEl.textContent = 'Message too long.';
    return;
  }

  // Stop typing indicator when sending
  clearTimeout(typingTimeout);
  isTyping = false;
  socket.emit('typing-stop', { roomId: currentRoomId });
  
  addMessage(msg, 'self');
  socket.emit('chat-message', { roomId: currentRoomId, msg });
  chatInput.value = '';
}

/* =========================
   SAFETY
========================= */
reportBtn.onclick = () => {
  if (currentRoomId) socket.emit('report-user', { roomId: currentRoomId });
  endCall(false);
};

blockBtn.onclick = () => {
  if (currentRoomId) socket.emit('block-user', { roomId: currentRoomId });
  endCall(false);
};

/* =========================
   NEW FEATURES IMPLEMENTATION
========================= */

/* ---- EMOJI REACTIONS ---- */
const emojiButtons = document.querySelectorAll('.emoji-btn');
const emojiReactions = document.querySelector('.emoji-reactions');

emojiButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    if (currentRoomId) {
      // Send emoji reaction to partner
      socket.emit('emoji-reaction', { roomId: currentRoomId, emoji });
      
      // Visual feedback
      btn.classList.add('sent');
      setTimeout(() => btn.classList.remove('sent'), 300);
      
      // Show popup
      showEmojiPopup(btn, 'Sent!');
    }
  });
});

function showEmojiPopup(element, text) {
  const popup = document.createElement('div');
  popup.className = 'emoji-reaction-popup';
  popup.textContent = text;
  element.style.position = 'relative';
  element.appendChild(popup);
  
  setTimeout(() => {
    if (popup.parentNode) {
      popup.parentNode.removeChild(popup);
    }
  }, 2000);
}

// Listen for emoji reactions from partner
socket.on('emoji-reaction', ({ emoji }) => {
  // Find the emoji button and animate it
  const emojiBtn = document.querySelector(`[data-emoji="${emoji}"]`);
  if (emojiBtn) {
    emojiBtn.style.animation = 'emojiSent 0.5s ease';
    showEmojiPopup(emojiBtn, 'Received!');
    setTimeout(() => {
      emojiBtn.style.animation = '';
    }, 500);
  }
  
  // Add to chat as a system message
  addMessage(`${emoji} reaction`, 'reaction');
});

/* ---- RATING SYSTEM (MINIMIZED) ---- */
const ratingModal = document.getElementById('ratingModal');
const ratingPartnerName = document.getElementById('ratingPartnerName');
const starButtons = document.querySelectorAll('.star-btn-mini');
const submitRating = document.getElementById('submitRating');
const skipRating = document.getElementById('skipRating');

let currentRating = 0;
let ratingPartner = null;

// Star rating interaction (minimized)
starButtons.forEach((star, index) => {
  star.addEventListener('click', () => {
    currentRating = index + 1;
    updateStarDisplay(currentRating);
    submitRating.disabled = false;
  });
  
  star.addEventListener('mouseenter', () => {
    updateStarDisplay(index + 1);
  });
});

document.querySelector('.rating-stars-mini').addEventListener('mouseleave', () => {
  updateStarDisplay(currentRating);
});

function updateStarDisplay(rating) {
  starButtons.forEach((star, index) => {
    star.classList.toggle('active', index < rating);
  });
}

submitRating.addEventListener('click', () => {
  if (currentRating > 0) {
    const feedback = {
      rating: currentRating,
      comment: '', // No comment in minimized version
      partnerName: ratingPartner
    };
    
    // Send rating to server
    socket.emit('submit-rating', feedback);
    
    // Close modal and reset
    closeRatingModal();
    
    // Show brief thank you message
    addMessage(`⭐ Thanks for rating! (${currentRating}/5 stars)`, 'system');
  }
});

skipRating.addEventListener('click', () => {
  closeRatingModal();
});

function showRatingModal(partnerDisplayName) {
  ratingPartner = partnerDisplayName;
  ratingPartnerName.textContent = partnerDisplayName || 'this person';
  ratingModal.classList.remove('hidden');
  
  // Reset form
  currentRating = 0;
  updateStarDisplay(0);
  submitRating.disabled = true;
  
  // Auto-close after 10 seconds if no interaction
  setTimeout(() => {
    if (!ratingModal.classList.contains('hidden')) {
      closeRatingModal();
    }
  }, 10000);
}

function closeRatingModal() {
  ratingModal.classList.add('hidden');
  currentRating = 0;
  ratingPartner = null;
}

/* ---- APPEAL SYSTEM ---- */
const banModal = document.getElementById('banModal');
const appealModal = document.getElementById('appealModal');
const appealBan = document.getElementById('appealBan');
const acceptBan = document.getElementById('acceptBan');
const submitAppeal = document.getElementById('submitAppeal');
const cancelAppeal = document.getElementById('cancelAppeal');
const appealReason = document.getElementById('appealReason');
const appealMessage = document.getElementById('appealMessage');
const appealEmail = document.getElementById('appealEmail');

// Ban modal handlers
appealBan.addEventListener('click', () => {
  banModal.classList.add('hidden');
  appealModal.classList.remove('hidden');
});

acceptBan.addEventListener('click', () => {
  banModal.classList.add('hidden');
});

// Appeal modal handlers
submitAppeal.addEventListener('click', () => {
  const reason = appealReason.value;
  const message = appealMessage.value.trim();
  const email = appealEmail.value.trim();
  
  if (reason && message && email) {
    const appeal = {
      reason,
      message,
      email,
      timestamp: Date.now(),
      userId: userIdentity.userId
    };
    
    // Send appeal to server
    socket.emit('submit-appeal', appeal);
    
    // Close modal
    appealModal.classList.add('hidden');
    
    // Show confirmation
    addMessage('📧 Your appeal has been submitted. You will receive a response via email within 24-48 hours.', 'system');
  } else {
    alert('Please fill in all fields to submit your appeal.');
  }
});

cancelAppeal.addEventListener('click', () => {
  appealModal.classList.add('hidden');
});

// Listen for ban notifications from server
socket.on('user-banned', ({ reason, duration, expires }) => {
  document.getElementById('banReason').textContent = reason || 'Multiple user reports';
  document.getElementById('banDuration').textContent = duration || '24 hours';
  document.getElementById('banExpires').textContent = expires || 'Tomorrow';
  banModal.classList.remove('hidden');
});

/* ---- ENHANCED CHAT MESSAGES ---- */
function addMessage(msg, type = 'user') {
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${type}`;
  
  if (type === 'reaction') {
    const content = document.createElement('div');
    content.className = 'message-content reaction-message';

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'reaction-emoji';
    emojiSpan.textContent = String(msg || '').split(' ')[0] || '🙂';

    const textSpan = document.createElement('span');
    textSpan.className = 'reaction-text';
    textSpan.textContent = 'sent a reaction';

    content.appendChild(emojiSpan);
    content.appendChild(textSpan);
    messageEl.appendChild(content);
  } else {
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = String(msg || '');
    messageEl.appendChild(content);
  }

  const timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  messageEl.appendChild(timeEl);
  
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (type === 'self' || type === 'stranger') {
    lastChatActivity = Date.now();
  }
  
  // Remove empty state if it exists
  const emptyState = chatMessages.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
}

/* ---- SERVER EVENT HANDLERS FOR NEW FEATURES ---- */
socket.on('rating-received', ({ rating, comment }) => {
  if (rating >= 4) {
    addMessage(`⭐ Your partner rated this conversation ${rating}/5 stars!`, 'system');
  }
});

socket.on('appeal-status', ({ status, message }) => {
  if (status === 'received') {
    addMessage('📧 Your appeal has been received and is being reviewed.', 'system');
  } else if (status === 'approved') {
    addMessage('✅ Your appeal has been approved. Welcome back!', 'system');
  } else if (status === 'denied') {
    addMessage(`❌ Your appeal has been denied. ${message}`, 'system');
  }
});

console.log('🎉 New features loaded: Emoji Reactions, Rating System, Appeal System');
