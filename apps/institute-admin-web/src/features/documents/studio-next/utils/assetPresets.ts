/**
 * Bundled Vector SVG Presets for Institute Documents
 *
 * Official stamps, verification seals, institutional crests, and signatures.
 */

export interface AssetPreset {
  id: string
  name: string
  category: 'logos' | 'signatures' | 'stamps' | 'badges'
  svg: string
  aspectRatio: number // width / height
}

export const ASSET_PRESETS: AssetPreset[] = [
  // Stamps & Seals
  {
    id: 'stamp-official-approved',
    name: 'Official Approved Seal',
    category: 'stamps',
    aspectRatio: 1.0,
    svg: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="92" fill="none" stroke="#047857" stroke-width="6" stroke-dasharray="6 3"/>
      <circle cx="100" cy="100" r="82" fill="none" stroke="#047857" stroke-width="3"/>
      <path id="curveTop" fill="none" d="M 30,100 A 70,70 0 0,1 170,100" />
      <text font-family="'Cinzel', serif" font-size="13" font-weight="700" fill="#047857" letter-spacing="3">
        <textPath href="#curveTop" startOffset="50%" text-anchor="middle">OFFICIAL ATTESTED</textPath>
      </text>
      <path id="curveBottom" fill="none" d="M 170,100 A 70,70 0 0,1 30,100" />
      <text font-family="'Cinzel', serif" font-size="12" font-weight="700" fill="#047857" letter-spacing="3">
        <textPath href="#curveBottom" startOffset="50%" text-anchor="middle">STEP NEXT ACADEMY</textPath>
      </text>
      <circle cx="100" cy="100" r="50" fill="none" stroke="#047857" stroke-width="2"/>
      <text x="100" y="96" text-anchor="middle" font-family="'Inter', sans-serif" font-size="18" font-weight="800" fill="#047857">APPROVED</text>
      <text x="100" y="112" text-anchor="middle" font-family="'Inter', sans-serif" font-size="10" font-weight="600" fill="#047857">★ ★ ★</text>
    </svg>`,
  },
  {
    id: 'stamp-verified-attested',
    name: 'Verified & Certified Stamp',
    category: 'stamps',
    aspectRatio: 2.2,
    svg: `<svg viewBox="0 0 220 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="5" width="210" height="90" rx="8" fill="none" stroke="#1D4ED8" stroke-width="5"/>
      <rect x="12" y="12" width="196" height="76" rx="4" fill="none" stroke="#1D4ED8" stroke-width="2" stroke-dasharray="4 2"/>
      <text x="110" y="44" text-anchor="middle" font-family="'Inter', sans-serif" font-size="18" font-weight="800" fill="#1D4ED8" letter-spacing="2">VERIFIED &amp; ATTESTED</text>
      <line x1="25" y1="52" x2="195" y2="52" stroke="#1D4ED8" stroke-width="2"/>
      <text x="110" y="72" text-anchor="middle" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#1D4ED8">CAMPUSONE REGISTRAR</text>
    </svg>`,
  },
  {
    id: 'stamp-exam-controller',
    name: 'Controller of Examinations',
    category: 'stamps',
    aspectRatio: 1.0,
    svg: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="90" fill="none" stroke="#991B1B" stroke-width="5"/>
      <circle cx="100" cy="100" r="76" fill="none" stroke="#991B1B" stroke-width="2"/>
      <text x="100" y="85" text-anchor="middle" font-family="'Cinzel', serif" font-size="13" font-weight="700" fill="#991B1B">OFFICE OF THE</text>
      <text x="100" y="105" text-anchor="middle" font-family="'Cinzel', serif" font-size="14" font-weight="800" fill="#991B1B">CONTROLLER OF</text>
      <text x="100" y="125" text-anchor="middle" font-family="'Cinzel', serif" font-size="14" font-weight="800" fill="#991B1B">EXAMINATIONS</text>
    </svg>`,
  },

  // Crests & Logos
  {
    id: 'crest-academic-shield',
    name: 'Heraldic Academy Shield',
    category: 'logos',
    aspectRatio: 0.85,
    svg: `<svg viewBox="0 0 170 200" xmlns="http://www.w3.org/2000/svg">
      <path d="M 85,10 C 140,10 160,30 160,80 C 160,150 110,185 85,195 C 60,185 10,150 10,80 C 10,30 30,10 85,10 Z" fill="#1E3A8A" stroke="#F59E0B" stroke-width="6"/>
      <!-- Book icon -->
      <path d="M 50,75 Q 85,65 85,95 Q 85,65 120,75 L 120,120 Q 85,110 85,140 Q 85,110 50,120 Z" fill="#F8FAFC" stroke="#F59E0B" stroke-width="2"/>
      <!-- Star on top -->
      <polygon points="85,32 89,44 102,44 91,52 95,64 85,56 75,64 79,52 68,44 81,44" fill="#F59E0B"/>
    </svg>`,
  },
  {
    id: 'crest-torch-knowledge',
    name: 'Torch of Knowledge',
    category: 'logos',
    aspectRatio: 1.0,
    svg: `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="90" fill="#0F172A" stroke="#E2E8F0" stroke-width="4"/>
      <!-- Flame -->
      <path d="M 100,35 Q 120,65 105,85 Q 125,75 110,105 Q 85,90 95,75 Q 80,70 100,35 Z" fill="#F59E0B"/>
      <!-- Torch handle -->
      <polygon points="90,110 110,110 105,160 95,160" fill="#94A3B8"/>
      <!-- Ribbon -->
      <path d="M 40,165 Q 100,185 160,165" stroke="#F59E0B" stroke-width="8" fill="none"/>
    </svg>`,
  },

  // Realistic Signatures
  {
    id: 'sig-principal-head',
    name: 'Principal Signature (Vector)',
    category: 'signatures',
    aspectRatio: 2.5,
    svg: `<svg viewBox="0 0 250 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M 20,65 Q 40,20 60,60 T 90,45 Q 120,10 140,70 T 170,40 Q 190,25 210,50 L 235,48" fill="none" stroke="#1E293B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 45,75 Q 120,85 220,70" fill="none" stroke="#1E293B" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'sig-exam-controller',
    name: 'Exam Controller Signature',
    category: 'signatures',
    aspectRatio: 2.5,
    svg: `<svg viewBox="0 0 250 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M 30,55 C 50,15 70,80 85,45 C 95,20 120,70 145,35 Q 165,75 185,45 T 220,55" fill="none" stroke="#0F172A" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="228" cy="50" r="3" fill="#0F172A"/>
    </svg>`,
  },

  // Badges & Awards
  {
    id: 'badge-excellence',
    name: 'Academic Excellence Gold Medal',
    category: 'badges',
    aspectRatio: 0.8,
    svg: `<svg viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg">
      <!-- Ribbons -->
      <polygon points="50,110 30,190 60,175 80,190 75,110" fill="#DC2626"/>
      <polygon points="110,110 85,190 100,175 130,190 110,110" fill="#B91C1C"/>
      <!-- Medal -->
      <circle cx="80" cy="80" r="60" fill="#F59E0B" stroke="#D97706" stroke-width="6"/>
      <circle cx="80" cy="80" r="48" fill="#FDE68A" stroke="#D97706" stroke-width="2" stroke-dasharray="4 2"/>
      <text x="80" y="86" text-anchor="middle" font-family="'Cinzel', serif" font-size="16" font-weight="800" fill="#78350F">MERIT</text>
    </svg>`,
  },
]
