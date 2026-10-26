// Regression tests against Swiss Ephemeris fixtures (test/fixtures.json).
// `npm test` runs this file under three different server timezones; results must not change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/chart.mjs';
import { findAspects } from '../lib/astro.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));
const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function call(params, method = 'GET', body) {
  return new Promise(resolve => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(b) { resolve({ code: this.code, body: b, headers: this.headers }); },
      end() { resolve({ code: this.code, body: null, headers: this.headers }); }
    };
    handler({ method, query: params, body }, res);
  });
}
const birth = f => ({ year: f.local[0], month: f.local[1], day: f.local[2], hour: f.local[3], minute: f.local[4], lat: f.lat, lon: f.lon });

// 度。对照完整 Swiss Ephemeris（含 .se1 文件），1920–2030 年 3000 张随机盘实测：所有点最大 0.0006°
const TOL = { Sun: .001, Moon: .001, Mercury: .001, Venus: .001, Mars: .001, Jupiter: .001, Saturn: .001, Uranus: .001, Neptune: .001, Pluto: .001, NorthNode: .001 };
const TOL_ANGLE = .001;

for (const f of fixtures) {
  test(`${f.name}: timezone found from location, positions match Swiss Ephemeris`, async () => {
    const { code, body } = await call({ ...birth(f), houseSystem: 'placidus', transitYear: 2026, transitMonth: 10, transitDay: 22 });
    assert.equal(code, 200, JSON.stringify(body));
    const n = body.natalChart;
    assert.equal(n.chartInfo.date, f.utc, 'birth time converted to the wrong UTC instant');
    assert.equal(n.chartInfo.timezone, f.utcOffsetHours);
    for (const [k, ref] of Object.entries(f.bodies)) {
      assert.ok(diff(n.planets[k].longitude, ref) <= TOL[k], `${k}: api ${n.planets[k].longitude} vs ref ${ref.toFixed(3)}`);
    }
    assert.ok(diff(n.planets.SouthNode.longitude, f.bodies.NorthNode + 180) <= TOL.NorthNode);
    assert.ok(diff(n.angles.Ascendant.longitude, f.asc) <= TOL_ANGLE, `ASC ${n.angles.Ascendant.longitude} vs ${f.asc}`);
    assert.ok(diff(n.angles.MC.longitude, f.mc) <= TOL_ANGLE, `MC ${n.angles.MC.longitude} vs ${f.mc}`);
    if (f.placidus) {
      assert.equal(body.analysis.houseSystem, 'placidus');
      n.houses.forEach((h, i) => assert.ok(diff(h.cusp, f.placidus[i]) <= TOL_ANGLE, `cusp ${i + 1}: ${h.cusp} vs ${f.placidus[i].toFixed(3)}`));
    } else {
      assert.equal(body.analysis.houseSystem, 'whole');
      assert.ok(n.chartInfo.warnings.some(w => w.includes('Placidus')));
    }
    // natal aspects agree with the ones computed from reference positions (ignore pairs sitting on an orb edge)
    const ref = { ...f.bodies, SouthNode: (f.bodies.NorthNode + 180) % 360, Ascendant: f.asc, MC: f.mc };
    const key = a => `${a.p1}|${a.p2}|${a.type}`;
    const mine = new Map(body.analysis.aspects.natal.map(a => [key(a), a]));
    for (const a of findAspects(ref, ref, true)) {
      const edge = [8, 7, 5].some(o => Math.abs(a.orb - o) < .1);
      if (!edge) assert.ok(mine.has(key(a)), `missing aspect ${key(a)} (orb ${a.orb})`);
    }
  });
}

test('legacy fixed tz offset still works and warns that DST was not checked', async () => {
  const f = fixtures[0];
  const { body } = await call({ ...birth(f), tz: -4 });
  assert.equal(body.natalChart.chartInfo.date, f.utc);
  assert.ok(body.natalChart.chartInfo.warnings.some(w => w.includes('fixed tz')));
});

test('wrong legacy tz is no longer needed: omitting tz picks EDT in July', async () => {
  const f = fixtures[0];
  const { body } = await call({ year: 1990, month: 7, day: 15, hour: 14, minute: 30, lat: f.lat, lon: f.lon });
  assert.equal(body.natalChart.chartInfo.timezone, -4);
  assert.equal(body.natalChart.chartInfo.timezoneName, 'America/New_York');
});

test('IANA timezone parameter overrides the lookup', async () => {
  const f = fixtures[0];
  const { body } = await call({ ...birth(f), timezone: 'Europe/London' });
  assert.equal(body.natalChart.chartInfo.date, '1990-07-15T13:30:00.000Z');
});

test('unknown birth time: no angles or houses, Moon gives possible signs', async () => {
  const { code, body } = await call({ year: 1990, month: 7, day: 15, lat: 40.7128, lon: -74.006 });
  assert.equal(code, 200);
  const n = body.natalChart;
  assert.equal(n.chartInfo.timeKnown, false);
  assert.equal(n.angles, null);
  assert.equal(n.houses, null);
  assert.equal(n.planets.Sun.house, undefined);
  assert.ok(Array.isArray(n.planets.Moon.possibleSigns) && n.planets.Moon.possibleSigns.length >= 1);
  assert.equal(body.analysis.aspects.natal.some(a => a.p1 === 'Ascendant' || a.p2 === 'Ascendant'), false);
});

test('a day when the Moon changes sign lists both signs', async () => {
  // Swiss Ephemeris: in New York the Moon leaves Aries for Taurus during 1990-07-15, and stays in Aries all of 07-14
  const ingress = await call({ year: 1990, month: 7, day: 15, lat: 40.7128, lon: -74.006, timeUnknown: 'true', hour: 9 });
  assert.equal(ingress.body.natalChart.chartInfo.timeKnown, false);
  assert.deepEqual(ingress.body.natalChart.planets.Moon.possibleSigns, ['Aries', 'Taurus']);
  const steady = await call({ year: 1990, month: 7, day: 14, lat: 40.7128, lon: -74.006 });
  assert.deepEqual(steady.body.natalChart.planets.Moon.possibleSigns, ['Aries']);
});

test('DST gap and overlap are flagged', async () => {
  const gap = await call({ year: 2021, month: 3, day: 14, hour: 2, minute: 30, lat: 40.7128, lon: -74.006 });
  assert.ok(gap.body.natalChart.chartInfo.warnings.some(w => w.includes('skipped')));
  const twice = await call({ year: 2021, month: 11, day: 7, hour: 1, minute: 30, lat: 40.7128, lon: -74.006 });
  assert.ok(twice.body.natalChart.chartInfo.warnings.some(w => w.includes('twice')));
});

test('transit date is read at local noon, not 00:00 UTC', async () => {
  const f = fixtures[5];
  const { body } = await call({ ...birth(f), transitYear: 2026, transitMonth: 10, transitDay: 22 });
  assert.equal(body.transits.chartInfo.date, '2026-10-22T17:00:00.000Z');
  assert.ok(Array.isArray(body.analysis.aspects.transitToNatal));
});

test('bad input returns 400 with a reason', async () => {
  for (const p of [{ year: 1990, month: 2, day: 30, hour: 1, lat: 1, lon: 1 }, { year: 1990, month: 1, day: 1, hour: 25, lat: 1, lon: 1 },
    { year: 1990, month: 1, day: 1, hour: 1, lat: 95, lon: 1 }, { year: 1990, month: 1, day: 1, hour: 1, lat: 1, lon: 1, houseSystem: 'koch' },
    { year: 1990, month: 1, day: 1, hour: 1, lat: 1, lon: 1, timezone: 'Mars/Olympus' }, { year: 1990, month: 1, day: 1 }]) {
    const { code, body } = await call(p);
    assert.equal(code, 400, JSON.stringify(p));
    assert.ok(body.error);
  }
});

test('POST body is read and CORS preflight is answered', async () => {
  const f = fixtures[0];
  const post = await call({}, 'POST', { ...birth(f) });
  assert.equal(post.code, 200);
  assert.equal(post.body.natalChart.chartInfo.date, f.utc);
  assert.equal(post.headers['Access-Control-Allow-Origin'], '*');
  const pre = await call({}, 'OPTIONS');
  assert.equal(pre.code, 204);
});
