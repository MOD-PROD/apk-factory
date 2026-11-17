import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWebAppSettings as normalize} from '../web-app-settings.mjs';
test('legacy fullscreen and defaults',()=>{
 assert.equal(normalize().display,'standalone');
 assert.equal(normalize({fullscreen:true}).display,'fullscreen');
});
test('browser compatibility',()=>{
 assert.equal(normalize({engine:'customTabs'}).display,'browser');
 assert.throws(()=>normalize({engine:'customTabs',display:'immersive'}));
 assert.throws(()=>normalize({engine:'twa'},'html'));
 assert.equal(normalize({engine:'twa'}).requiresDomainVerification,true);
});
test('orientation',()=>{
 assert.equal(normalize({orientation:'landscape'}).orientation,'landscape');
 assert.throws(()=>normalize({engine:'customTabs',orientation:'portrait'}));
});
