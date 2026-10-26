import { buildChart } from '../lib/astro.mjs';
import { readFileSync } from 'node:fs';
const cases = JSON.parse(readFileSync(process.argv[2]));
const out = cases.map(c => {
  try {
    const ch = buildChart(c.ms, { latitude: c.lat, longitude: c.lon, houseSystem: 'placidus' });
    const r = Object.fromEntries(Object.entries(ch.planets).map(([k,v])=>[k,v.longitude]));
    r.Ascendant = ch.angles.Ascendant.longitude; r.MC = ch.angles.MC.longitude;
    r.cusps = ch.houseSystem==='placidus' ? ch.houses.map(h=>h.cusp) : null;
    return r;
  } catch (e) { return { error: String(e) }; }
});
console.log(JSON.stringify(out));
