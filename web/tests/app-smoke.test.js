import test from 'node:test';
import assert from 'node:assert/strict';

test('application initializes and renders the home screen', async () => {
  const start = { addEventListener() {} };
  const app = {
    innerHTML: '',
    querySelectorAll: () => [],
    querySelector: selector => selector === '#start-match' ? start : null,
  };
  globalThis.document = {
    querySelector: selector => selector === '#app' ? app : null,
    body: { classList: { toggle() {} } },
  };
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = { getItem: () => null };
  try {
    await import('../src/app.js');
    assert.match(app.innerHTML, /Jugar contra la IA/);
    assert.match(app.innerHTML, /<main>/);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
