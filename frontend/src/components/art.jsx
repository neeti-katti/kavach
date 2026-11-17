// Kavach artwork, drawn as SVG: a crowd with raised fists, placards and tricolour flags, a brush-stroke tricolour wave,
// a gold Ashoka Chakra and a monument skyline. Every flag is drawn upright with saffron on top.
import { useId, useMemo } from 'react'

const SAFFRON = '#FF9933'
const WHITE = '#F5F1EA'
const GREEN = '#138808'
const GOLD = '#D4AF37'
const NAVY = '#000080'

function useSvgId(prefix) {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, '')
}

// Small deterministic random generator, so the crowd looks the same on every render.
function rng(seed) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function chakraParts(color, strokeScale = 1) {
  const angles = Array.from({ length: 24 }, (_, i) => (i * 15 * Math.PI) / 180)
  return (
    <g fill="none" stroke={color} strokeLinecap="round">
      <circle r="122" strokeWidth={7 * strokeScale} />
      <circle r="108" strokeWidth={1.5 * strokeScale} opacity=".6" />
      <circle r="20" strokeWidth={6 * strokeScale} />
      <circle r="7" fill={color} stroke="none" />
      {angles.map((a, i) => (
        <line key={i} x1={Math.cos(a) * 22} y1={Math.sin(a) * 22} x2={Math.cos(a) * 112} y2={Math.sin(a) * 112} strokeWidth={3.2 * strokeScale} />
      ))}
      {angles.map((a, i) => (
        <circle key={`d${i}`} cx={Math.cos(a + 0.1309) * 114} cy={Math.sin(a + 0.1309) * 114} r="3.4" fill={color} stroke="none" />
      ))}
    </g>
  )
}

export function Chakra({ className = '', color = GOLD }) {
  return (
    <svg viewBox="-130 -130 260 260" className={className} aria-hidden>
      {chakraParts(color)}
    </svg>
  )
}

function stripe(x0, y, w, h, wave) {
  return `M${x0},${y} C${x0 + w * 0.33},${y - wave} ${x0 + w * 0.66},${y + wave} ${x0 + w},${y} L${x0 + w},${y + h} `
    + `C${x0 + w * 0.66},${y + h + wave} ${x0 + w * 0.33},${y + h - wave} ${x0},${y + h} Z`
}

// One person, drawn around (0,0) = feet line, about 100 units tall before arms.
function Person({ p, fill }) {
  const s = p.side
  const body = 'M-36,0 C-36,-38 -32,-60 -17,-67 C-10,-70 10,-70 17,-67 C32,-60 36,-38 36,0 Z'
  return (
    <g transform={`translate(${p.x.toFixed(1)},0) scale(${p.scale.toFixed(3)})`}>
      {p.hair === 'long' && <ellipse cx="0" cy="-76" rx="18" ry="24" fill={fill} />}
      {p.hair === 'bun' && <circle cx={-s * 11} cy="-100" r="7.5" fill={fill} />}
      <path d={body} fill={fill} />
      <rect x="-6" y="-80" width="12" height="16" fill={fill} />
      <circle cy="-89" r="15" fill={fill} />
      {p.kind === 'fist' && (
        <g>
          <path d={`M${s * 20},-56 L${s * 30},-118 L${s * (30 + p.lean * 30)},-158`} stroke={fill} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x={s * (30 + p.lean * 30) - 9} y="-176" width="18" height="20" rx="6" fill={fill} />
        </g>
      )}
      {p.kind === 'placard' && (
        <g>
          <path d={`M${s * 20},-56 L${s * 26},-112`} stroke={fill} strokeWidth="11" strokeLinecap="round" fill="none" />
          <path d={`M${s * 26},-104 L${s * 27},-176`} stroke={fill} strokeWidth="4" strokeLinecap="round" fill="none" />
          <rect x={s * 27 - 38} y="-214" width="76" height="42" rx="3" fill={fill} />
        </g>
      )}
      {p.kind === 'flag' && (
        <g>
          <path d={`M${s * 20},-56 L${s * 28},-122`} stroke={fill} strokeWidth="11" strokeLinecap="round" fill="none" />
          <path d={`M${s * 28},-108 L${s * 31},-236`} stroke={fill} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <g opacity=".92">
            <path d={stripe(s * 31, -234, s * 66, 14, 5)} fill={SAFFRON} />
            <path d={stripe(s * 31, -220, s * 66, 14, 5)} fill={WHITE} />
            <path d={stripe(s * 31, -206, s * 66, 14, 5)} fill={GREEN} />
            <circle cx={s * 31 + s * 33} cy="-213" r="4.2" fill="none" stroke={NAVY} strokeWidth="1.6" />
          </g>
        </g>
      )}
    </g>
  )
}

function crowdRow({ width, seed, count, min, max, fist, placard, flag }) {
  const r = rng(seed)
  const step = width / count
  return Array.from({ length: count }, (_, i) => {
    const roll = r()
    const kind = roll < flag ? 'flag' : roll < flag + placard ? 'placard' : roll < flag + placard + fist ? 'fist' : 'plain'
    const hairRoll = r()
    return {
      x: i * step + step / 2 + (r() - 0.5) * step * 0.7,
      scale: min + r() * (max - min),
      side: r() < 0.5 ? -1 : 1,
      lean: r() - 0.5,
      hair: hairRoll < 0.35 ? 'long' : hairRoll < 0.5 ? 'bun' : 'none',
      kind,
    }
  })
}

const ROWS = [
  { seed: 7, density: 34, lift: 70, min: 0.46, max: 0.6, fill: '#3B1B1D', fist: 0.18, placard: 0.12, flag: 0.05, rim: 0.55 },
  { seed: 21, density: 52, lift: 26, min: 0.7, max: 0.88, fill: '#1C0C0E', fist: 0.26, placard: 0.12, flag: 0.08, rim: 0.8 },
  { seed: 42, density: 86, lift: -34, min: 1.02, max: 1.28, fill: '#0A0405', fist: 0.3, placard: 0.1, flag: 0.07, rim: 0.95 },
]

export function Crowd({ width = 1600, height = 520, intensity = 1 }) {
  const fid = useSvgId('rim')
  const rows = useMemo(() => ROWS.map((row) => ({
    ...row,
    people: crowdRow({ width, seed: row.seed, count: Math.round(width / row.density), min: row.min, max: row.max, fist: row.fist, placard: row.placard, flag: row.flag }),
  })), [width])
  return (
    <g>
      <defs>
        {rows.map((row, i) => (
          <filter key={i} id={`${fid}-${i}`} x="-5%" y="-30%" width="110%" height="140%">
            <feDropShadow dx="0" dy="-1.5" stdDeviation="2.2" floodColor={SAFFRON} floodOpacity={row.rim * intensity} />
          </filter>
        ))}
      </defs>
      {rows.map((row, i) => (
        <g key={i} transform={`translate(0,${height - row.lift})`} filter={`url(#${fid}-${i})`}>
          {row.people.map((p, j) => <Person key={j} p={p} fill={row.fill} />)}
        </g>
      ))}
    </g>
  )
}

function TricolourWave({ width, height, fid, strength = 1 }) {
  const W = width
  const H = height
  const d = `M${W * 0.22},${H * 0.66} C${W * 0.42},${H * 0.3} ${W * 0.6},${H * 0.52} ${W * 0.78},${H * 0.32} S${W * 0.98},${H * 0.1} ${W * 1.08},${H * 0.05}`
  const band = Math.max(34, H * 0.075)
  return (
    <g filter={`url(#${fid})`} strokeLinecap="round" fill="none">
      <path d={d} stroke={SAFFRON} strokeWidth={band} opacity={0.62 * strength} />
      <path d={d} stroke={WHITE} strokeWidth={band} opacity={0.42 * strength} transform={`translate(0,${band * 0.98})`} />
      <path d={d} stroke={GREEN} strokeWidth={band} opacity={0.62 * strength} transform={`translate(0,${band * 1.96})`} />
    </g>
  )
}

/** Full patriotic scene: glow, tricolour wave, gold chakra and the crowd along the bottom. */
export function HeroScene({ className = '', height = 520, chakraX = 0.8, chakraY = 0.34, chakraSize = 1.2, wave = 1, crowd = 1 }) {
  const W = 1600
  const H = height
  const brush = useSvgId('brush')
  const glow = useSvgId('glow')
  const sky = useSvgId('sky')
  const fog = useSvgId('fog')
  const horizon = useSvgId('horizon')
  const chakraGlow = useSvgId('cglow')
  const cx = W * chakraX
  const cy = H * chakraY
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <radialGradient id={sky} cx={chakraX} cy={chakraY} r="0.75">
          <stop offset="0" stopColor="#C2551F" stopOpacity=".55" />
          <stop offset=".35" stopColor="#7A2324" stopOpacity=".45" />
          <stop offset="1" stopColor="#120A0B" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={glow}>
          <stop offset="0" stopColor={SAFFRON} stopOpacity=".55" />
          <stop offset="1" stopColor={SAFFRON} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={fog} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".7" stopColor="#120A0B" stopOpacity="0" />
          <stop offset="1" stopColor="#120A0B" stopOpacity=".6" />
        </linearGradient>
        {/* Sunset glow behind the crowd so the silhouettes read against light. */}
        <linearGradient id={horizon} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".45" stopColor="#FF8C3C" stopOpacity="0" />
          <stop offset=".74" stopColor="#FF8C3C" stopOpacity=".34" />
          <stop offset=".86" stopColor="#C2551F" stopOpacity=".26" />
          <stop offset="1" stopColor="#5A1C21" stopOpacity=".12" />
        </linearGradient>
        <filter id={brush} x="-10%" y="-30%" width="120%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.09" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="1.2" />
        </filter>
        <filter id={chakraGlow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width={W} height={H} fill={`url(#${sky})`} />
      <circle cx={cx} cy={cy} r={260 * chakraSize} fill={`url(#${glow})`} />
      {wave > 0 && <TricolourWave width={W} height={H} fid={brush} strength={wave} />}
      <g transform={`translate(${cx},${cy}) scale(${chakraSize})`} filter={`url(#${chakraGlow})`} opacity=".85">
        {chakraParts(GOLD, 1)}
      </g>
      {crowd > 0 && <rect width={W} height={H} fill={`url(#${horizon})`} />}
      {crowd > 0 && <Crowd width={W} height={H} intensity={crowd} />}
      <rect width={W} height={H} fill={`url(#${fog})`} />
    </svg>
  )
}

/** Monument skyline for the bottom of the sidebar: India Gate, a minaret, a domed hall and a tricolour sweep. */
export function Skyline({ className = '' }) {
  const brush = useSvgId('sbrush')
  const rim = useSvgId('srim')
  const glow = useSvgId('sglow')
  const ink = '#0A0405'
  return (
    <svg viewBox="0 0 260 190" preserveAspectRatio="xMidYMax meet" className={className} aria-hidden>
      <defs>
        <radialGradient id={glow} cx=".5" cy="1" r=".8">
          <stop offset="0" stopColor={SAFFRON} stopOpacity=".35" />
          <stop offset="1" stopColor={SAFFRON} stopOpacity="0" />
        </radialGradient>
        <filter id={brush} x="-10%" y="-40%" width="120%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03 0.2" numOctaves="2" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={rim} x="-10%" y="-20%" width="120%" height="140%">
          <feDropShadow dx="0" dy="-1" stdDeviation="1.6" floodColor={SAFFRON} floodOpacity=".55" />
        </filter>
      </defs>
      <rect width="260" height="190" fill={`url(#${glow})`} />
      <g filter={`url(#${brush})`} fill="none" strokeLinecap="round" strokeWidth="11">
        <path d="M-10,150 C60,112 150,124 275,58" stroke={SAFFRON} opacity=".6" />
        <path d="M-10,161 C60,123 150,135 275,69" stroke={WHITE} opacity=".4" />
        <path d="M-10,172 C60,134 150,146 275,80" stroke={GREEN} opacity=".6" />
      </g>
      <g fill={ink} filter={`url(#${rim})`}>
        {/* Minaret */}
        <path d="M30,190 L36,72 L44,72 L50,190 Z" />
        <rect x="30.5" y="156" width="19" height="4" />
        <rect x="32.5" y="126" width="15" height="4" />
        <rect x="34" y="98" width="12" height="4" />
        <path d="M36,72 L38,62 L42,62 L44,72 Z" />
        <circle cx="40" cy="59" r="2.2" />
        {/* India Gate */}
        <path d="M88,80 H172 V190 H148 V124 A18,18 0 0 0 112,124 V190 H88 Z" />
        <rect x="82" y="72" width="96" height="8" />
        <rect x="94" y="52" width="72" height="20" />
        <rect x="116" y="43" width="28" height="9" />
        <path d="M116,43 Q130,30 144,43 Z" />
        {/* Domed hall */}
        <rect x="192" y="150" width="50" height="40" />
        <path d="M196,150 Q217,116 238,150 Z" />
        <rect x="216" y="108" width="2" height="12" />
        {/* Trees and ground */}
        <circle cx="66" cy="178" r="10" /><circle cx="78" cy="182" r="8" />
        <circle cx="184" cy="180" r="9" /><circle cx="250" cy="179" r="10" />
        <rect x="0" y="186" width="260" height="4" />
      </g>
    </svg>
  )
}
