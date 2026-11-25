/**
 * Generates clean, offline Alpine Glass light-themed SVG data URLs for mock recyclable
 * conveyor frames and benchmark figures when no user photo exists.
 */

function toSvgDataUrl(svgString) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString.trim())}`;
}

const MATERIAL_PALETTES = {
  cardboard: { base: '#D4A876', accent: '#9B6F3E', bg: '#EDF4FA' },
  glass: { base: '#5CB9D6', accent: '#0369A1', bg: '#E8F4FA' },
  metal: { base: '#94A8BA', accent: '#4C6278', bg: '#ECF2F8' },
  paper: { base: '#F8FBFE', accent: '#8FA5BA', bg: '#E6EFF7' },
  plastic: { base: '#38B28E', accent: '#0F6B50', bg: '#E8F6F2' },
  trash: { base: '#B5898E', accent: '#754C52', bg: '#F1EFF4' },
};

function renderMaterialSilhouette(cls, palette) {
  switch (cls) {
    case 'cardboard':
      return `
        <polygon points="150,115 330,95 365,145 350,275 170,295 135,245" fill="${palette.base}" stroke="${palette.accent}" stroke-width="3"/>
        <line x1="150" y1="115" x2="170" y2="295" stroke="${palette.accent}" stroke-width="2" opacity="0.65"/>
        <line x1="185" y1="155" x2="315" y2="142" stroke="#FFFFFF" stroke-width="6" opacity="0.6"/>
        <rect x="210" y="195" width="72" height="36" rx="4" fill="#FFFFFF" opacity="0.82"/>
      `;
    case 'glass':
      return `
        <path d="M225,75 L255,75 L258,128 C286,145 292,175 292,272 C292,286 280,295 240,295 C200,295 188,286 188,272 C188,175 194,145 222,128 Z" fill="${palette.base}" fill-opacity="0.72" stroke="${palette.accent}" stroke-width="3"/>
        <path d="M212,165 C208,200 208,242 214,270" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity="0.7" fill="none"/>
        <rect x="200" y="185" width="80" height="54" rx="5" fill="#FFFFFF" opacity="0.78"/>
      `;
    case 'metal':
      return `
        <rect x="180" y="102" width="120" height="186" rx="14" fill="${palette.base}" stroke="${palette.accent}" stroke-width="3"/>
        <ellipse cx="240" cy="106" rx="58" ry="12" fill="#DCE7F1" stroke="${palette.accent}" stroke-width="2"/>
        <rect x="195" y="118" width="18" height="156" rx="6" fill="#FFFFFF" opacity="0.48"/>
        <rect x="180" y="168" width="120" height="44" fill="${palette.accent}" opacity="0.28"/>
      `;
    case 'paper':
      return `
        <polygon points="150,120 320,104 344,262 174,284" fill="#E3EDF6" stroke="${palette.accent}" stroke-width="2.5"/>
        <polygon points="164,132 332,120 352,274 184,292" fill="${palette.base}" stroke="${palette.accent}" stroke-width="2.5"/>
        <line x1="194" y1="162" x2="306" y2="152" stroke="${palette.accent}" stroke-width="4" opacity="0.65"/>
        <line x1="198" y1="186" x2="294" y2="177" stroke="${palette.accent}" stroke-width="3" opacity="0.5"/>
        <line x1="202" y1="210" x2="314" y2="200" stroke="${palette.accent}" stroke-width="3" opacity="0.5"/>
      `;
    case 'plastic':
      return `
        <path d="M222,78 L258,78 L260,112 L286,144 L282,274 C282,286 268,294 240,294 C212,294 198,286 198,274 L194,144 L220,112 Z" fill="${palette.base}" fill-opacity="0.68" stroke="${palette.accent}" stroke-width="3"/>
        <line x1="198" y1="175" x2="282" y2="175" stroke="${palette.accent}" stroke-width="2" opacity="0.45"/>
        <line x1="198" y1="205" x2="282" y2="205" stroke="${palette.accent}" stroke-width="2" opacity="0.45"/>
        <line x1="198" y1="235" x2="282" y2="235" stroke="${palette.accent}" stroke-width="2" opacity="0.45"/>
        <rect x="220" y="68" width="40" height="14" rx="4" fill="#0274B3"/>
      `;
    default:
      return `
        <path d="M165,145 Q215,92 276,120 Q340,148 326,232 Q314,292 222,284 Q146,274 165,145 Z" fill="${palette.base}" stroke="${palette.accent}" stroke-width="3"/>
        <path d="M196,170 L282,222 M270,154 L208,244" stroke="${palette.accent}" stroke-width="3" opacity="0.55"/>
      `;
  }
}

export function createMockMaterialSvg({
  cls = 'plastic',
  variantTag = 'ORIGINAL',
  axis = null,
  seed = 1,
}) {
  const palette = MATERIAL_PALETTES[cls] || MATERIAL_PALETTES.trash;
  const isVariant = variantTag !== 'ORIGINAL';

  let overlay = '';
  let groupTransform = '';

  if (isVariant && axis === 'lighting') {
    overlay = `
      <defs>
        <linearGradient id="shade-${seed}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0F1E2E" stop-opacity="0.46"/>
          <stop offset="55%" stop-color="#0F1E2E" stop-opacity="0.1"/>
          <stop offset="100%" stop-color="#E0F2FE" stop-opacity="0.42"/>
        </linearGradient>
      </defs>
      <rect width="480" height="360" fill="url(#shade-${seed})"/>
      <ellipse cx="${140 + (seed % 5) * 45}" cy="115" rx="92" ry="42" fill="#FFFFFF" opacity="0.34"/>
    `;
  } else if (isVariant && axis === 'contamination') {
    const cx1 = 195 + (seed % 4) * 22;
    const cy1 = 155 + (seed % 3) * 28;
    overlay = `
      <ellipse cx="${cx1}" cy="${cy1}" rx="42" ry="26" fill="#6E4E34" opacity="0.4"/>
      <ellipse cx="${cx1 + 48}" cy="${cy1 + 36}" rx="28" ry="18" fill="#463D36" opacity="0.34"/>
      <circle cx="${cx1 - 22}" cy="${cy1 + 52}" r="14" fill="#7D5E42" opacity="0.38"/>
      <rect x="0" y="0" width="480" height="360" fill="#8BA1B5" opacity="0.08"/>
    `;
  } else if (isVariant && axis === 'condition') {
    const angle = ((seed % 7) - 3) * 6;
    groupTransform = `transform="rotate(${angle} 240 190) scale(0.94, 0.89) translate(14 18)"`;
    overlay = `
      <path d="M170,130 L248,186 L212,248 L296,214" fill="none" stroke="#0F1E2E" stroke-width="2.5" stroke-dasharray="6 4" opacity="0.35"/>
    `;
  }

  const badgeBg = isVariant ? '#0274B3' : '#0F1E2E';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360">
      <rect width="480" height="360" fill="${palette.bg}"/>
      <!-- Light frosted conveyor slat lines -->
      <g stroke="#0274B3" stroke-opacity="0.09" stroke-width="2">
        <line x1="0" y1="60" x2="480" y2="60"/>
        <line x1="0" y1="120" x2="480" y2="120"/>
        <line x1="0" y1="180" x2="480" y2="180"/>
        <line x1="0" y1="240" x2="480" y2="240"/>
        <line x1="0" y1="300" x2="480" y2="300"/>
      </g>
      <g ${groupTransform}>
        ${renderMaterialSilhouette(cls, palette)}
      </g>
      ${overlay}
      <!-- Top-left technical frame marker -->
      <rect x="16" y="16" width="164" height="28" rx="8" fill="${badgeBg}" fill-opacity="0.9"/>
      <text x="28" y="34" fill="#FFFFFF" font-family="monospace" font-size="11.5" font-weight="600">${cls.toUpperCase()} · ${variantTag}</text>
      <text x="464" y="342" text-anchor="end" fill="#0F1E2E" fill-opacity="0.52" font-family="monospace" font-size="11">DEMO BELT FRAME #${String(seed).padStart(3, '0')}</text>
    </svg>
  `;

  return toSvgDataUrl(svg);
}

export function createMockFigureSvg({ title, subtitle, kind = 'confusion' }) {
  let body = '';
  if (kind === 'confusion') {
    const cells = [];
    const values = [
      [0.91, 0.02, 0.01, 0.04, 0.01, 0.01],
      [0.01, 0.87, 0.04, 0.01, 0.05, 0.02],
      [0.01, 0.04, 0.89, 0.01, 0.03, 0.02],
      [0.06, 0.01, 0.01, 0.88, 0.02, 0.02],
      [0.02, 0.05, 0.03, 0.02, 0.85, 0.03],
      [0.04, 0.03, 0.03, 0.04, 0.05, 0.81],
    ];
    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        const v = values[r][c];
        const alpha = Math.max(0.08, v * 0.9);
        const x = 110 + c * 74;
        const y = 86 + r * 42;
        cells.push(
          `<rect x="${x}" y="${y}" width="68" height="36" rx="6" fill="#0274B3" fill-opacity="${alpha.toFixed(2)}"/>`
        );
        cells.push(
          `<text x="${x + 34}" y="${y + 23}" text-anchor="middle" font-family="monospace" font-size="12" fill="${v > 0.45 ? '#FFFFFF' : '#0F1E2E'}">${Math.round(v * 100)}%</text>`
        );
      }
    }
    body = cells.join('');
  } else {
    body = `
      <line x1="84" y1="305" x2="590" y2="305" stroke="#0F1E2E" stroke-opacity="0.22" stroke-width="2"/>
      <line x1="84" y1="92" x2="84" y2="305" stroke="#0F1E2E" stroke-opacity="0.22" stroke-width="2"/>
      <polyline points="110,275 210,248 310,210 410,174 540,148" fill="none" stroke="#8CA3B8" stroke-width="3" stroke-dasharray="6 5"/>
      <polyline points="110,262 210,212 310,164 410,132 540,110" fill="none" stroke="#0274B3" stroke-width="4"/>
      <circle cx="540" cy="110" r="6" fill="#0274B3"/>
      <circle cx="540" cy="148" r="5" fill="#8CA3B8"/>
      <text x="548" y="114" font-family="monospace" font-size="12" fill="#0274B3">SortAugment</text>
      <text x="548" y="152" font-family="monospace" font-size="12" fill="#5C738A">Baseline</text>
    `;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" width="640" height="380">
      <rect width="640" height="380" fill="#FFFFFF"/>
      <rect x="12" y="12" width="616" height="356" rx="14" fill="#F3F8FC" stroke="#0274B3" stroke-opacity="0.14"/>
      <text x="36" y="48" font-family="sans-serif" font-size="18" font-weight="700" fill="#0F1E2E">${title}</text>
      <text x="36" y="68" font-family="monospace" font-size="11" fill="#5C738A">${subtitle} · DEMO FIGURE</text>
      ${body}
    </svg>
  `;

  return toSvgDataUrl(svg);
}