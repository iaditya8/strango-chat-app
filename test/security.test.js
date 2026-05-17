const test = require('node:test');
const assert = require('node:assert/strict');

const { validateOrigin } = require('../server/security');

test('validateOrigin allows same-origin requests without Origin header', () => {
  assert.equal(validateOrigin(undefined, ['https://example.com']), true);
});

test('validateOrigin blocks origins outside the allow list', () => {
  assert.equal(validateOrigin('https://evil.example', ['https://strango.example']), false);
  assert.equal(validateOrigin('https://strango.example', ['https://strango.example']), true);
});
