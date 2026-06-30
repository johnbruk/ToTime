import assert from 'node:assert/strict';

import { createViewMap } from '../src/views/viewMap.js';

const views = createViewMap({
  home: ctx => 'home:' + ctx.name,
  login: () => 'login'
});

assert.equal(views.has('home'), true);
assert.equal(views.has('missing'), false);
assert.deepEqual(views.names(), ['home', 'login']);
assert.equal(views.show('home', 'login', { name: 'TOTIME' }), 'home:TOTIME');
assert.equal(views.show('missing', 'login', {}), 'login');

views.add('settings', () => 'settings');
assert.equal(views.show('settings', 'login', {}), 'settings');

console.log('View map smoke tests passed.');
