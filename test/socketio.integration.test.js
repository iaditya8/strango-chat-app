const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { io: Client } = require('socket.io-client');

function connectClient(url) {
  const socket = Client(url, {
    transports: ['websocket'],
    timeout: 5000,
  });
  return socket;
}

async function waitFor(socket, eventName, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
    socket.once(eventName, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

test('Socket.IO: two users can match and exchange a message', async (t) => {
  process.env.NODE_ENV = 'test';
  const { start, stop } = require('../server/server');
  const started = await start(0);
  const url = `http://localhost:${started.port}`;
  t.after(() => stop());

  const a = connectClient(url);
  const b = connectClient(url);
  t.after(async () => {
    try { a.disconnect(); } catch {}
    try { b.disconnect(); } catch {}
    await stop();
  });

  await Promise.all([waitFor(a, 'connect'), waitFor(b, 'connect')]);

  const foundAPromise = waitFor(a, 'partner-found');
  const foundBPromise = waitFor(b, 'partner-found');

  a.emit('find-partner', { country: 'any', gender: 'any', name: 'A', userIdentity: { type: 'session', username: 'A', deviceId: 'device_test_a', userId: 'guest_device_test_a', isGuest: true } });
  b.emit('find-partner', { country: 'any', gender: 'any', name: 'B', userIdentity: { type: 'session', username: 'B', deviceId: 'device_test_b', userId: 'guest_device_test_b', isGuest: true } });

  const [foundA, foundB] = await Promise.all([foundAPromise, foundBPromise]);

  assert.ok(foundA.roomId);
  assert.equal(foundA.roomId, foundB.roomId);

  const msgPromise = waitFor(b, 'chat-message');
  a.emit('chat-message', { roomId: foundA.roomId, msg: 'hello' });
  const msg = await msgPromise;
  assert.equal(msg.msg, 'hello');
});
