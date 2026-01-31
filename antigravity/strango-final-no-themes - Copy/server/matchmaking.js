// server/matchmaking.js

// Enhanced queue structure: key -> array of {socketId, timestamp, timeZone}
const queues = new Map();
// socketId -> {key, timestamp, timeZone}
const socketToKey = new Map();

function makeKey(country, gender) {
  const c = country || 'any';
  const g = gender || 'any';
  return `${c}|${g}`;
}

function addToQueue(socketId, country, gender, timeZone = 0) {
  const key = makeKey(country, gender);
  if (!queues.has(key)) queues.set(key, []);
  
  const queueEntry = {
    socketId,
    timestamp: Date.now(),
    timeZone: timeZone || 0,
    country: country || 'any',
    gender: gender || 'any'
  };
  
  queues.get(key).push(queueEntry);
  socketToKey.set(socketId, { key, timestamp: queueEntry.timestamp, timeZone });
}

function removeFromQueue(socketId) {
  const entry = socketToKey.get(socketId);
  if (!entry) return;

  const list = queues.get(entry.key);
  if (!list) return;

  const idx = list.findIndex(item => item.socketId === socketId);
  if (idx !== -1) list.splice(idx, 1);

  socketToKey.delete(socketId);
}

function findMatchFor(socketId, country, gender, timeZone = 0) {
  // Try exact match first
  let match = findExactMatch(socketId, country, gender, timeZone);
  if (match) return match;
  
  // Try country bias (prefer same country but allow global)
  if (country && country !== 'any') {
    match = findCountryBiasMatch(socketId, country, gender, timeZone);
    if (match) return match;
  }
  
  // Fallback to any available match
  return findAnyMatch(socketId, timeZone);
}

function findExactMatch(socketId, country, gender, timeZone) {
  const key = makeKey(country, gender);
  const list = queues.get(key) || [];
  
  return findBestMatchInList(list, socketId, timeZone);
}

function findCountryBiasMatch(socketId, country, gender, timeZone) {
  // Try same country with any gender
  const patterns = [
    makeKey(country, 'any')
  ];
  
  for (const key of patterns) {
    const list = queues.get(key) || [];
    const match = findBestMatchInList(list, socketId, timeZone);
    if (match) return match;
  }
  
  return null;
}



function findAnyMatch(socketId, timeZone) {
  // Find any available match, preferring time-based compatibility
  const allMatches = [];
  
  for (const [key, list] of queues.entries()) {
    for (const entry of list) {
      if (entry.socketId !== socketId) {
        allMatches.push(entry);
      }
    }
  }
  
  if (allMatches.length === 0) return null;
  
  // Sort by time compatibility (similar timezone) and wait time
  allMatches.sort((a, b) => {
    const timeZoneDiffA = Math.abs(a.timeZone - timeZone);
    const timeZoneDiffB = Math.abs(b.timeZone - timeZone);
    const waitTimeA = Date.now() - a.timestamp;
    const waitTimeB = Date.now() - b.timestamp;
    
    // Prefer similar timezone, but also consider wait time
    const scoreA = timeZoneDiffA * 0.3 + (10000 - waitTimeA) * 0.7;
    const scoreB = timeZoneDiffB * 0.3 + (10000 - waitTimeB) * 0.7;
    
    return scoreA - scoreB;
  });
  
  const match = allMatches[0];
  removeFromQueue(match.socketId);
  return match.socketId;
}

function findBestMatchInList(list, socketId, timeZone) {
  if (list.length === 0) return null;
  
  // Filter out self and sort by time-based compatibility
  const candidates = list.filter(entry => entry.socketId !== socketId);
  if (candidates.length === 0) return null;
  
  // Sort by timezone similarity and wait time
  candidates.sort((a, b) => {
    const timeZoneDiffA = Math.abs(a.timeZone - timeZone);
    const timeZoneDiffB = Math.abs(b.timeZone - timeZone);
    const waitTimeA = Date.now() - a.timestamp;
    const waitTimeB = Date.now() - b.timestamp;
    
    // Weight: 40% timezone compatibility, 60% wait time fairness
    const scoreA = timeZoneDiffA * 0.4 + (10000 - waitTimeA) * 0.6;
    const scoreB = timeZoneDiffB * 0.4 + (10000 - waitTimeB) * 0.6;
    
    return scoreA - scoreB;
  });
  
  const match = candidates[0];
  const idx = list.findIndex(entry => entry.socketId === match.socketId);
  if (idx !== -1) list.splice(idx, 1);
  
  socketToKey.delete(match.socketId);
  return match.socketId;
}

module.exports = { addToQueue, removeFromQueue, findMatchFor };
