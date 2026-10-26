// 纯计算层：给定 UTC 时刻与地点，算行星、四轴、宫位、相位。不读请求、不碰服务器时区。
import julian from 'astronomia/julian';
import sidereal from 'astronomia/sidereal';
import { Planet, toFK5 } from 'astronomia/planetposition';
import nutation from 'astronomia/nutation';
import precess from 'astronomia/precess';
import solar from 'astronomia/solar';
import { Moon as ElpMoon } from 'astronomia/elp';
import elpMppDe from 'astronomia/data/elpMppDe';
import pluto from 'astronomia/pluto';
import coord from 'astronomia/coord';
import vsop87Dearth from 'astronomia/data/vsop87Dearth';
import vsop87Bearth from 'astronomia/data/vsop87Bearth';
import vsop87Dmercury from 'astronomia/data/vsop87Dmercury';
import vsop87Dvenus from 'astronomia/data/vsop87Dvenus';
import vsop87Dmars from 'astronomia/data/vsop87Dmars';
import vsop87Djupiter from 'astronomia/data/vsop87Djupiter';
import vsop87Dsaturn from 'astronomia/data/vsop87Dsaturn';
import vsop87Buranus from 'astronomia/data/vsop87Buranus';
import vsop87Bneptune from 'astronomia/data/vsop87Bneptune';

export const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
export const SIGNS_EN = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

const radToDeg = r => r * 180 / Math.PI;
const degToRad = d => d * Math.PI / 180;
export const norm360 = d => (d % 360 + 360) % 360;
const angleDiff = (a, b) => ((a - b + 540) % 360) - 180;
const signIndex = d => Math.floor(norm360(d) / 30) % 12;
const degText = d => {
  const x = norm360(d) % 30;
  const a = Math.floor(x);
  const m = Math.floor((x - a) * 60);
  return `${a}°${String(m).padStart(2,'0')}'`;
};

/** 统一的「黄经点」输出格式 */
export function point(lonDeg) {
  const lon = norm360(lonDeg);
  return { sign: SIGNS[signIndex(lon)], signEn: SIGNS_EN[signIndex(lon)], degree: degText(lon), longitude: Number(lon.toFixed(4)) };
}

/* ---------------- 时间 ---------------- */

/** 某 IANA 时区在某个 UTC 时刻相对 UTC 的偏移（分钟，东正西负）。用 Node 自带 ICU 的历史时区库，含历年夏令时。 */
export function zoneOffsetMinutes(timeZone, utcMs) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - utcMs) / 60000);
}

/**
 * 当地墙上时间 → UTC。zone 为 { name } (IANA) 或 { offsetMinutes }（固定偏移，兼容旧的 tz 参数）。
 * 结果里标出夏令时切换造成的「不存在的时刻」(春季拨快那一小时) 和「出现两次的时刻」(秋季拨回)。
 */
export function localToUtc({ year, month, day, hour, minute }, zone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (zone.name == null) {
    return { utcMs: wall - zone.offsetMinutes * 60000, offsetMinutes: zone.offsetMinutes, nonexistent: false, ambiguous: false };
  }
  let off = zoneOffsetMinutes(zone.name, wall);
  let utc = wall - off * 60000;
  const off2 = zoneOffsetMinutes(zone.name, utc);
  if (off2 !== off) { off = off2; utc = wall - off * 60000; }
  const back = utc + zoneOffsetMinutes(zone.name, utc) * 60000;
  const nonexistent = back !== wall;
  let ambiguous = false;
  for (const shift of [-3600000, 3600000]) {
    const alt = utc + shift;
    if (alt + zoneOffsetMinutes(zone.name, alt) * 60000 === wall) ambiguous = true;
  }
  return { utcMs: utc, offsetMinutes: zoneOffsetMinutes(zone.name, utc), nonexistent, ambiguous };
}

/** UTC 毫秒 → 该时区的墙上日期时间 */
export function utcToLocal(utcMs, zone) {
  const off = zone.name == null ? zone.offsetMinutes : zoneOffsetMinutes(zone.name, utcMs);
  const d = new Date(utcMs + off * 60000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), offsetMinutes: off };
}

/* ---------------- 天体 ---------------- */

function sphToRect(lon, lat, r) {
  const c = Math.cos(lat);
  return { x: r * c * Math.cos(lon), y: r * c * Math.sin(lon), z: r * Math.sin(lat) };
}

const earthD = new Planet(vsop87Dearth);
const earthB = new Planet(vsop87Bearth);
const PLANET_DATA = {
  Mercury: vsop87Dmercury,
  Venus: vsop87Dvenus,
  Mars: vsop87Dmars,
  Jupiter: vsop87Djupiter,
  Saturn: vsop87Dsaturn,
  // Uranus/Neptune 用 VSOP87B：position() 会岁差到日期黄道（D 数据集这两颗的 L 分量有问题）
  Uranus: vsop87Buranus,
  Neptune: vsop87Bneptune
};
// 月亮用 ELP/MPP02（截断版，约 0.5 ms 一次）；Meeus 第 47 章的简化理论误差可到 10"，求真交点时还会被求导放大
const MOON = new ElpMoon(elpMppDe);
const PLANETS = Object.fromEntries(Object.entries(PLANET_DATA).map(([k, v]) => [k, new Planet(v)]));

const LIGHT_DAYS_PER_AU = 0.0057755183;
const ARCSEC = Math.PI / 180 / 3600;

/**
 * 地心几何位置，扣掉光行时：我们此刻看到的是行星在 t−τ 时刻发出的光，τ = 距离 / 光速。
 * helioAt(t) 给日心球坐标，earth 是 t 时刻地球的日心球坐标，两者须在同一参考系。迭代三次足够收敛。
 */
function geocentricLightTime(helioAt, earth, jde) {
  const er = sphToRect(earth.lon, earth.lat, earth.range);
  let tau = 0, g;
  for (let i = 0; i < 3; i++) {
    const p = helioAt(jde - tau);
    const r = sphToRect(p.lon, p.lat, p.range);
    const x = r.x - er.x, y = r.y - er.y, z = r.z - er.z;
    const dist = Math.hypot(x, y, z);
    g = { lon: Math.atan2(y, x), lat: Math.atan2(z, Math.hypot(x, y)) };
    tau = LIGHT_DAYS_PER_AU * dist;
  }
  return g;
}

/** 年周光行差在黄经上的改正（Meeus 式 23.2，弧度） */
function aberrationLon(lon, lat, jde) {
  const T = (jde - 2451545.0) / 36525;
  const sun = solar.trueLongitude(T).lon;
  const e = solar.eccentricity(T);
  const perihelion = degToRad(102.93735 + 1.71946 * T + 0.00046 * T * T);
  const k = 20.49552 * ARCSEC;
  return (-k * Math.cos(sun - lon) + e * k * Math.cos(perihelion - lon)) / Math.cos(lat);
}

/** 几何黄经 → 视黄经：加光行差和黄经章动，结果参考真春分点（与 Swiss Ephemeris 默认输出同一定义） */
function apparentLon(g, jde, dpsi) {
  return norm360(radToDeg(g.lon + aberrationLon(g.lon, g.lat, jde) + dpsi));
}

/** 返回各天体地心视黄经（度，真春分点）。任何一颗算失败就抛错，不再静默返回白羊 0°。 */
export function bodyLongitudes(jde) {
  const out = {};
  const dpsi = nutation.nutation(jde)[0];
  // 太阳：apparentVSOP87 已含光行差与章动
  out.Sun = norm360(radToDeg(solar.apparentVSOP87(earthD, jde).lon));
  // 月亮：ELP/MPP02 给平春分点的几何黄经；月亮的光行时与光行差合计不到 1"，只加章动
  out.Moon = norm360(radToDeg(MOON.position(jde).lon + dpsi));

  const earth = earthD.position(jde);
  for (const [name, planet] of Object.entries(PLANETS)) {
    const g = geocentricLightTime(t => planet.position(t), earth, jde);
    const fk5 = toFK5(g.lon, g.lat, jde); // VSOP87 动力学参考系 → FK5（Meeus 式 32.3）
    const lon = apparentLon({ lon: fk5.lon, lat: fk5.lat }, jde, dpsi);
    if (!Number.isFinite(lon)) throw new Error(`Could not compute ${name}`);
    out[name] = lon;
  }

  // 冥王星：Meeus 第 37 章是 J2000 日心坐标，先在 J2000 里扣光行时，再岁差到日期黄道
  const g2000 = geocentricLightTime(t => pluto.heliocentric(t), earthB.position2000(jde), jde);
  const gDate = precess.eclipticPosition(new coord.Ecliptic(g2000.lon, g2000.lat), 2000.0, 2000.0 + (jde - 2451545.0) / 365.25);
  out.Pluto = apparentLon({ lon: gDate.lon, lat: gDate.lat }, jde, dpsi);
  if (!Number.isFinite(out.Pluto)) throw new Error('Could not compute Pluto');

  // 月交点：真交点（多数西方占星软件的默认），同样参考真春分点；南交点在正对面
  out.NorthNode = norm360(osculatingNode(jde) + radToDeg(dpsi));
  out.SouthNode = norm360(out.NorthNode + 180);
  return out;
}

/**
 * 真交点（密切交点）：用月亮此刻的位置和速度求出瞬时轨道面，再取它与黄道的升交点。
 * 和 Swiss Ephemeris 的 TRUE_NODE 是同一个定义；astronomia 自带的 trueNode 是五项近似，最多差 0.2°。
 */
function osculatingNode(jde) {
  const h = 0.01; // 天
  const rect = t => { const m = MOON.position(t); return sphToRect(m.lon, m.lat, m.range); };
  const r = rect(jde), a = rect(jde - h), b = rect(jde + h);
  const v = { x: (b.x - a.x) / (2 * h), y: (b.y - a.y) / (2 * h), z: (b.z - a.z) / (2 * h) };
  // 角动量 h = r × v；升交点方向 = ẑ × h
  const hx = r.y * v.z - r.z * v.y, hy = r.z * v.x - r.x * v.z;
  return norm360(radToDeg(Math.atan2(hx, -hy)));
}

/* ---------------- 四轴与宫位 ---------------- */

function meanObliquityDeg(T) {
  const seconds = 21.448 - 46.8150 * T - 0.00059 * T * T + 0.001813 * T * T * T;
  return 23 + 26 / 60 + seconds / 3600;
}
function nutationInObliquityArcsec(T) {
  const L = degToRad(280.4665 + 36000.7698 * T);
  const Lp = degToRad(218.3165 + 481267.8813 * T);
  const Om = degToRad(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000);
  return 9.20 * Math.cos(Om) + 0.57 * Math.cos(2 * L) + 0.10 * Math.cos(2 * Lp) - 0.09 * Math.cos(2 * Om);
}

/** 上升、天顶，以及算宫位要用的 RAMC 与真黄赤交角 */
export function angles(utcMs, latitude, longitude) {
  const jdUT = 2440587.5 + utcMs / 86400000;
  const lstDeg = norm360(sidereal.apparent(jdUT) / 240 + longitude);
  const T = (jdUT - 2451545.0) / 36525.0;
  const epsDeg = meanObliquityDeg(T) + nutationInObliquityArcsec(T) / 3600.0;
  const lst = degToRad(lstDeg), eps = degToRad(epsDeg), phi = degToRad(latitude);

  const altitude = lam => {
    const eq = new coord.Ecliptic(lam, 0).toEquatorial(eps);
    const H = lst - eq.ra;
    return Math.asin(Math.sin(phi) * Math.sin(eq.dec) + Math.cos(phi) * Math.cos(eq.dec) * Math.cos(H));
  };
  const azimuth = lam => {
    const eq = new coord.Ecliptic(lam, 0).toEquatorial(eps);
    const H = lst - eq.ra;
    return norm360(radToDeg(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(eq.dec) * Math.cos(phi))));
  };
  // 在黄道上找地平高度为 0 的两个交点，取东方那个（Meeus 方位角自南起算，东方 > 180°）
  const crossings = [];
  let prevLam = 0, prevAlt = altitude(0);
  for (let i = 1; i <= 720; i++) {
    const lam = (i * 2 * Math.PI) / 720, alt = altitude(lam);
    if (alt === 0 || (alt > 0) !== (prevAlt > 0)) { crossings.push([prevLam, lam]); if (crossings.length === 2) break; }
    prevLam = lam; prevAlt = alt;
  }
  const refine = (a, b) => {
    let fa = altitude(a);
    for (let j = 0; j < 40; j++) { const m = (a + b) / 2, fm = altitude(m); if ((fa > 0) !== (fm > 0)) b = m; else { a = m; fa = fm; } }
    return (a + b) / 2;
  };
  let asc;
  if (crossings.length > 0) {
    const roots = crossings.map(([a, b]) => refine(a, b));
    asc = norm360(radToDeg(azimuth(roots[0]) > 180 ? roots[0] : (roots[1] ?? roots[0])));
  } else {
    asc = norm360(radToDeg(Math.atan2(-Math.cos(lst), Math.sin(eps) * Math.tan(phi) + Math.cos(eps) * Math.sin(lst))));
  }
  const mc = norm360(radToDeg(Math.atan2(Math.sin(lst), Math.cos(lst) * Math.cos(eps))));
  return { asc, mc, ramc: lstDeg, eps: epsDeg };
}

export function wholeSignCusps(asc) {
  const first = signIndex(asc) * 30;
  return Array.from({ length: 12 }, (_, i) => norm360(first + i * 30));
}

/** Placidus 宫头（标准半弧法迭代）。极圈附近部分黄道点不升不落，Placidus 无定义，返回 null。 */
export function placidusCusps({ asc, mc, ramc, eps }, latitude) {
  if (Math.abs(latitude) >= 90 - eps) return null;
  const e = degToRad(eps), tphi = Math.tan(degToRad(latitude));
  const lamFromRA = raDeg => { const ra = degToRad(raDeg); return norm360(radToDeg(Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(e)))); };
  const cusp = (f, below) => {
    let lam = lamFromRA(ramc + (below ? 180 - f * 90 : f * 90));
    for (let i = 0; i < 60; i++) {
      const dec = Math.asin(Math.sin(e) * Math.sin(degToRad(lam)));
      const x = tphi * Math.tan(dec);
      if (Math.abs(x) >= 1) return NaN;
      const ad = radToDeg(Math.asin(x));
      const next = lamFromRA(below ? ramc + 180 - f * (90 - ad) : ramc + f * (90 + ad));
      if (Math.abs(angleDiff(next, lam)) < 1e-7) { lam = next; break; }
      lam = next;
    }
    return lam;
  };
  const c11 = cusp(1 / 3, false), c12 = cusp(2 / 3, false), c2 = cusp(2 / 3, true), c3 = cusp(1 / 3, true);
  if ([c11, c12, c2, c3].some(v => !Number.isFinite(v))) return null;
  return [asc, c2, c3, mc + 180, c11 + 180, c12 + 180, asc + 180, c2 + 180, c3 + 180, mc, c11, c12].map(norm360);
}

/** 按宫头把黄经落到第几宫（宫头列表从第 1 宫开始，逆时针） */
export function houseOf(lon, cusps) {
  for (let i = 0; i < 12; i++) {
    const a = cusps[i], b = cusps[(i + 1) % 12];
    const span = norm360(b - a), off = norm360(lon - a);
    if (off < span) return i + 1;
  }
  return 12;
}

/* ---------------- 相位 ---------------- */

export const ASPECTS = [
  { type: 'conjunction', angle: 0, orb: 8 },
  { type: 'opposition', angle: 180, orb: 8 },
  { type: 'trine', angle: 120, orb: 7 },
  { type: 'square', angle: 90, orb: 7 },
  { type: 'sextile', angle: 60, orb: 5 }
];
const SKIP_PAIRS = new Set(['NorthNode|SouthNode', 'SouthNode|NorthNode', 'Ascendant|MC', 'MC|Ascendant']);

/** a、b 为 {名字: 黄经}。same=true 时只取一半配对（本命盘内部）。orbScale 用来给行运收紧容许度。 */
export function findAspects(a, b, same, orbScale = 1) {
  const out = [];
  const ka = Object.keys(a), kb = Object.keys(b);
  ka.forEach((p1, i) => {
    kb.forEach((p2, j) => {
      if (same && j <= i) return;
      if (SKIP_PAIRS.has(`${p1}|${p2}`)) return;
      const sep = Math.abs(angleDiff(a[p1], b[p2]));
      for (const asp of ASPECTS) {
        const orb = Math.abs(sep - asp.angle);
        if (orb <= asp.orb * orbScale) { out.push({ p1, p2, type: asp.type, angle: asp.angle, orb: Number(orb.toFixed(2)) }); break; }
      }
    });
  });
  return out.sort((x, y) => x.orb - y.orb);
}

/* ---------------- 整张盘 ---------------- */

/**
 * @param {number} utcMs  出生（或行运）时刻
 * @param {object} opts   { latitude, longitude, houseSystem: 'whole'|'placidus', timeKnown }
 */
export function buildChart(utcMs, { latitude, longitude, houseSystem = 'whole', timeKnown = true }) {
  const jde = julian.DateToJDE(new Date(utcMs));
  const lons = bodyLongitudes(jde);
  const planets = Object.fromEntries(Object.entries(lons).map(([k, v]) => [k, point(v)]));
  const result = { planets, angles: null, houses: null, houseSystem: null };
  if (!timeKnown) return result;

  const ang = angles(utcMs, latitude, longitude);
  let system = houseSystem === 'placidus' ? 'placidus' : 'whole';
  let cusps = system === 'placidus' ? placidusCusps(ang, latitude) : null;
  let note;
  if (system === 'placidus' && !cusps) { system = 'whole'; note = 'Placidus is undefined at this latitude; fell back to Whole Sign houses.'; }
  if (!cusps) cusps = wholeSignCusps(ang.asc);

  result.angles = { Ascendant: point(ang.asc), MC: point(ang.mc) };
  result.houses = cusps.map((c, i) => ({ house: i + 1, ...point(c), cusp: Number(c.toFixed(4)) }));
  result.houseSystem = system;
  if (note) result.houseNote = note;
  for (const [k, v] of Object.entries(lons)) planets[k].house = houseOf(v, cusps);
  return result;
}

export function longitudesOf(chart) {
  const out = Object.fromEntries(Object.entries(chart.planets).map(([k, v]) => [k, v.longitude]));
  if (chart.angles) { out.Ascendant = chart.angles.Ascendant.longitude; out.MC = chart.angles.MC.longitude; }
  return out;
}
