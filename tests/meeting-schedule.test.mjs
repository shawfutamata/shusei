import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSchedule,preparationTime} from '../app/meeting/schedule.ts';
const fixture=`<h2>2026年間スケジュール</h2><h3>10月７日(水)</h3><a href="https://www.shuseiclub.jp/hirunomeguro/entry_form/index.php?e=11636">申込</a><h3>12月９日(水)</h3><a href="https://www.shuseiclub.jp/hirunomeguro/entry_form/index.php?e=11638">申込</a><h3>日程未定</h3><h3>２月10日(水)</h3><a href="https://www.shuseiclub.jp/hirunomeguro/entry_form/index.php?e=11639">申込</a>`;
test('two calendar days before at 01:00 JST',()=>assert.equal(new Date(preparationTime('2026-10-07')).toISOString(),'2026-10-04T16:00:00.000Z'));
test('rollover across month and year',()=>assert.equal(new Date(preparationTime('2027-01-01')).toISOString(),'2026-12-29T16:00:00.000Z'));
test('confirmed homepage dates and source IDs only',()=>{const rows=parseSchedule(fixture,Date.parse('2026-09-29'));assert.deepEqual(rows.map(r=>r.date),['2026-10-07','2026-12-09','2027-02-10']);assert.equal(rows[0].sourceId,'11636');assert.equal(rows[0].startAt,Date.parse('2026-10-07T11:30:00+09:00'));});
test('past dates omitted and empty/broken schedule blocks automation',()=>{assert.throws(()=>parseSchedule('<h3>未定</h3>'));assert.throws(()=>parseSchedule(fixture,Date.parse('2028-01-01')));});
test('script content cannot create extra meetings',()=>assert.equal(parseSchedule(fixture+'<script>'+fixture.replace(/11636/g,'99999')+'</script>',Date.parse('2026-09-29')).length,3));
