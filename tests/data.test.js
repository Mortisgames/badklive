import test from 'node:test';
import assert from 'node:assert/strict';
import { num, dt, dayKey } from '../js/utils.js';
import { parseCSV } from '../js/data/csv.js';
import { buildSnapshot } from '../js/data/snapshot.js';
import { validateSheet } from '../js/data/validation.js';
import { parseWaves, parseTactics } from '../js/data/parsers.js';
import { calendarDays, wdStats } from '../js/data/calendar.js';
import { S, commitSnapshot } from '../js/state.js';
import { readCache, saveCache, CACHE_KEY } from '../js/data/cache.js';
import { fixtureTexts, memoryStorage, csv } from './helpers.js';

test('CSV handles BOM, quoted commas/newlines/quotes and empty fields', () => {
  assert.deepEqual(parseCSV('\uFEFFa,b\r\n"a,b","line\n""quoted"""\r\n"",'), [['a','b'],['a,b','line\n"quoted"'],['','']]);
  assert.deepEqual(parseCSV('""'), [['']]);
  for (const input of ['"unclosed', 'a"b"', '"a"oops']) assert.throws(() => parseCSV(input), /лапки/);
});
test('numbers and dates reject malformed, infinite and rolled-over values', () => {
  for (const v of ['12oops','Infinity','1.2.3','—','']) assert.equal(num(v), null);
  assert.equal(num('12,5%'), .125); assert.equal(num('0'), 0);
  assert.equal(dt('31.02.2026'), null); assert.equal(dt('29.02.2025'), null);
  assert.equal(dayKey(dt('29.02.2024')), '2024-02-29');
});
test('contracts produce sheet/row/column diagnostics and reject invalid probabilities', () => {
  const texts = fixtureTexts();
  assert.throws(() => buildSnapshot({...texts, cal:texts.cal.replace('Балістична атака 0/1','Renamed')}), /cal: рядок 1.*Балістична атака/);
  assert.throws(() => buildSnapshot({...texts, dash:texts.dash.replace('10%','110%')}), /dash: рядок 3.*R56/);
  assert.throws(() => buildSnapshot({...texts, cal:texts.cal.replace('01.09.2026','31.02.2026')}), /cal: рядок 2.*Дата/);
  assert.throws(() => buildSnapshot({...texts, tactics:''}), /tactics.*порожня/);
  assert.throws(() => buildSnapshot({...texts, cal:texts.cal + texts.cal.split('\r\n')[1]}), /дублікат/);
});
test('header-only sheets are valid and distinct from an empty HTTP response', () => {
  const texts = fixtureTexts();
  for (const k of ['tactics','cal','reg','waves']) texts[k] = texts[k].split('\r\n')[0];
  const result = buildSnapshot(texts);
  assert.equal(result.tactics.length, 0); assert.equal(result.waves.list.length, 0);
  assert.deepEqual(Object.keys(result.cal), []);
});
test('reordered columns retain their meaning in waves and tactics', () => {
  for (const [key, parser] of [['waves',parseWaves],['tactics',parseTactics]]) {
    const rows = parseCSV(fixtureTexts()[key]);
    const expected = parser(rows);
    const reordered = rows.map(row => [...row].reverse());
    validateSheet(key, reordered);
    assert.deepEqual(parser(reordered), expected);
  }
});
test('unknown attacks and coverage do not enter the denominator; date gaps stay unknown', () => {
  const days = buildSnapshot(fixtureTexts()).cal['Тестове місто'];
  assert.equal(days[1].a, null);
  const filled = calendarDays(days);
  assert.equal(filled.length,4); assert.equal(dayKey(filled[1].d),'2026-09-02'); assert.equal(filled[1].a,null);
  assert.equal(wdStats(filled,56).reduce((n,o)=>n+o.n,0),2);
  assert.equal(wdStats([{...days[0],cov:''}],56).reduce((n,o)=>n+o.n,0),0);
  assert.equal(wdStats([],56).length,7);
  assert.deepEqual(calendarDays([]),[]);
});
test('failed parsing never replaces the previously committed snapshot', () => {
  const texts = fixtureTexts(); commitSnapshot(buildSnapshot(texts),123);
  const before = S;
  assert.throws(() => commitSnapshot(buildSnapshot({...texts,control:''}),456));
  assert.equal(S,before); assert.equal(S.receivedAt,123);
});
test('cache restores Dates, validates data, migrates v1, tolerates unavailable storage', () => {
  const texts=fixtureTexts(),receivedAt=Date.now()-1000,storage=memoryStorage();
  assert.equal(saveCache({texts,receivedAt},storage),true);
  assert.ok(readCache(storage).snapshot.cal['Тестове місто'][0].d instanceof Date);
  storage.setItem(CACHE_KEY,'{"version":99}'); assert.equal(readCache(storage),null);
  storage.setItem(CACHE_KEY,'broken'); assert.equal(readCache(storage),null);
  storage.setItem('badklive_cache_v1',JSON.stringify({ts:receivedAt,texts}));
  assert.equal(readCache(storage).receivedAt,receivedAt);
  assert.equal(JSON.parse(storage.getItem(CACHE_KEY)).version,2);
  const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('full');}};
  assert.equal(readCache(broken),null); assert.equal(saveCache({texts,receivedAt},broken),false);
});
test('truncated calendar rows preserve unknown values instead of fabricating zeros', () => {
  const texts=fixtureTexts(),rows=parseCSV(texts.cal);
  rows[1]=rows[1].slice(0,3);
  const result=buildSnapshot({...texts,cal:csv(rows)});
  assert.equal(result.cal['Тестове місто'][0].a,null);
});
