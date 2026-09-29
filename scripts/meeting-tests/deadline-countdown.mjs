import assert from 'node:assert/strict';
import {deadlineCountdown as countdown} from '../../app/meeting/deadline-countdown.ts';
// Run with: node --experimental-strip-types scripts/meeting-tests/deadline-countdown.mjs
assert.equal(countdown(3602000,1000,false),'01時間 00分 01秒');
assert.equal(countdown(1001,1000,false),'00時間 00分 01秒');
assert.equal(countdown(1000,1000,false),'受付終了');
assert.equal(countdown(1000,5000,false),'受付終了');
assert.equal(countdown(10000,1000,true),'受付終了');
assert.equal(countdown(10000,0,false),'確認中…');
assert.equal(countdown(90001000,1000,false),'25時間 00分 00秒');
assert.equal(countdown(61000,1000,false),'00時間 01分 00秒');
// A changed deadline is applied immediately, rather than retaining a stale counter.
assert.equal(countdown(121000,1000,false),'00時間 02分 00秒');
console.log('Deadline countdown boundaries passed');
