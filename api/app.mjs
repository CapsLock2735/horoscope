import julian from 'astronomia/julian'
import { Planet } from 'astronomia/planetposition'
import solar from 'astronomia/solar'
import moonposition from 'astronomia/moonposition'
import vsop87Dearth from 'astronomia/data/vsop87Dearth'
import vsop87Dmercury from 'astronomia/data/vsop87Dmercury'
import vsop87Dvenus from 'astronomia/data/vsop87Dvenus'
import vsop87Dmars from 'astronomia/data/vsop87Dmars'
import vsop87Djupiter from 'astronomia/data/vsop87Djupiter'
import vsop87Dsaturn from 'astronomia/data/vsop87Dsaturn'
import vsop87Duranus from 'astronomia/data/vsop87Duranus'
import vsop87Dneptune from 'astronomia/data/vsop87Dneptune'

const SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"]
const radToDeg = r => r * 180 / Math.PI
const norm360 = d => (d % 360 + 360) % 360
const signFromDeg = d => SIGNS[Math.floor(norm360(d) / 30) % 12]
const degText = d => { const x = norm360(d) % 30; const a = Math.floor(x); const m = Math.floor((x - a) * 60); return `${a}°${String(m).padStart(2,'0')}'` }

export default (req, res) => {
  try {
    const { year, month, day, hour, minute, tz } = req.query
    if ([year,month,day,hour,minute,tz].some(v => v == null)) return res.status(400).json({ error: 'Missing required parameters' })
    const tzOffset = parseFloat(tz)
    if (Number.isNaN(tzOffset)) return res.status(400).json({ error: 'Invalid tz' })

    const utcHour = parseInt(hour,10) - tzOffset
    const date = new Date(Date.UTC(parseInt(year,10), parseInt(month,10)-1, parseInt(day,10), utcHour, parseInt(minute,10)))
    const jde = julian.DateToJDE(date)

    const out = {}

    const earth = new Planet(vsop87Dearth)
    const sun = solar.apparentVSOP87(earth, jde)
    const sunLonDeg = norm360(radToDeg(sun.lon))
    out.Sun = { sign: signFromDeg(sunLonDeg), degree: degText(sunLonDeg), longitude: Number(sunLonDeg.toFixed(2)) }

    const moonLonDeg = norm360(radToDeg(moonposition.position(jde).lon))
    out.Moon = { sign: signFromDeg(moonLonDeg), degree: degText(moonLonDeg), longitude: Number(moonLonDeg.toFixed(2)) }

    const datasets = {
      Mercury: vsop87Dmercury, Venus: vsop87Dvenus, Mars: vsop87Dmars,
      Jupiter: vsop87Djupiter, Saturn: vsop87Dsaturn, Uranus: vsop87Duranus, Neptune: vsop87Dneptune
    }
    for (const [name, ds] of Object.entries(datasets)) {
      const p = new Planet(ds).position(jde) // {lon, lat, range}
      const lonDeg = norm360(radToDeg(p.lon))
      out[name] = { sign: signFromDeg(lonDeg), degree: degText(lonDeg), longitude: Number(lonDeg.toFixed(2)) }
    }

    res.status(200).json({ planets: out })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: `An internal server error occurred: ${e.message}` })
  }
}
