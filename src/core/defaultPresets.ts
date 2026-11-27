import { PeqProfile } from './ja11Protocol';

/**
 * Built-in Offline Curated Starter Profiles for FiiO / JadeAudio JA11.
 * Universal, balanced starting points designed to work cleanly with any IEM or headphone.
 */
export const BUILTIN_PROFILES: PeqProfile[] = [
  {
    id: 'builtin-harman-balanced',
    name: 'Harman Balanced (All-Rounder)',
    description:
      'Balanced, musical curve for everyday listening: clean sub-bass lift, clear mids, and smooth treble without ear fatigue.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'JA11 Studio',
    masterGain: -3.0,
    bands: [
      { type: 'LSQ', freq: 75, gain: 2.0, q: 0.71 },
      { type: 'PK', freq: 210, gain: -1.8, q: 1.1 },
      { type: 'PK', freq: 900, gain: 1.0, q: 1.0 },
      { type: 'PK', freq: 4000, gain: -2.0, q: 2.2 },
      { type: 'HSQ', freq: 8500, gain: -1.5, q: 0.71 },
    ],
    updatedAt: 1732600000000,
  },
  {
    id: 'builtin-deep-bass-phonk',
    name: 'Deep Bass & EDM / Phonk',
    description:
      'Punchy 808 sub-bass slam and tight kick while keeping vocals clean and taming upper-mid harshness for EDM, Hip-Hop & Phonk.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'JA11 Studio',
    masterGain: -4.5,
    bands: [
      { type: 'LSQ', freq: 65, gain: 4.0, q: 0.71 },
      { type: 'PK', freq: 110, gain: 1.2, q: 1.3 },
      { type: 'PK', freq: 250, gain: -2.2, q: 1.2 },
      { type: 'PK', freq: 3800, gain: -2.5, q: 2.2 },
      { type: 'HSQ', freq: 8000, gain: -1.5, q: 0.71 },
    ],
    updatedAt: 1732599000000,
  },
  {
    id: 'builtin-warm-vocal',
    name: 'Warm Vocal & Acoustic',
    description:
      'Intimate, lush vocals and natural acoustic instruments for Pop, Ballad, Jazz & Lo-Fi — effortless long listening sessions.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'JA11 Studio',
    masterGain: -3.5,
    bands: [
      { type: 'PK', freq: 180, gain: -2.0, q: 1.0 },
      { type: 'PK', freq: 750, gain: 2.4, q: 0.9 },
      { type: 'PK', freq: 2000, gain: 1.2, q: 1.4 },
      { type: 'PK', freq: 4500, gain: -3.0, q: 2.5 },
      { type: 'HSQ', freq: 7500, gain: -2.2, q: 0.71 },
    ],
    updatedAt: 1732598000000,
  },
  {
    id: 'builtin-podcast-voice',
    name: 'Podcast & Voice Clarity',
    description:
      'Reduces low-end rumble and sharp s/sh sibilance for crystal-clear speech in Podcasts, Audiobooks & Calls.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'JA11 Studio',
    masterGain: -2.5,
    bands: [
      { type: 'LSQ', freq: 120, gain: -4.5, q: 0.71 },
      { type: 'PK', freq: 250, gain: -2.0, q: 1.4 },
      { type: 'PK', freq: 1500, gain: 2.0, q: 1.0 },
      { type: 'PK', freq: 3000, gain: 1.5, q: 1.6 },
      { type: 'PK', freq: 6500, gain: -3.5, q: 2.2 },
    ],
    updatedAt: 1732597000000,
  },
  {
    id: 'builtin-fps-gaming',
    name: 'FPS Gaming & Footsteps',
    description:
      'Lowers distracting bass boom from explosions while highlighting footsteps and directional cues (1.2k–2.5kHz) for CS2 / Valorant / PUBG.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'JA11 Studio',
    masterGain: -3.5,
    bands: [
      { type: 'LSQ', freq: 110, gain: -4.0, q: 0.71 },
      { type: 'PK', freq: 240, gain: -2.0, q: 1.2 },
      { type: 'PK', freq: 1700, gain: 3.0, q: 1.3 },
      { type: 'PK', freq: 4200, gain: -3.2, q: 2.6 },
      { type: 'HSQ', freq: 8000, gain: -1.5, q: 0.71 },
    ],
    updatedAt: 1732596000000,
  },
  {
    id: 'builtin-flat-reference',
    name: 'Flat Studio Reference (0 dB)',
    description:
      'Pure neutral 0 dB starting point — ideal for A/B comparison or building your own custom PEQ curve from scratch.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'Reference',
    masterGain: 0,
    bands: [
      { type: 'LSQ', freq: 60, gain: 0, q: 0.71 },
      { type: 'PK', freq: 200, gain: 0, q: 1.0 },
      { type: 'PK', freq: 1000, gain: 0, q: 1.0 },
      { type: 'PK', freq: 4000, gain: 0, q: 2.0 },
      { type: 'HSQ', freq: 8000, gain: 0, q: 0.71 },
    ],
    updatedAt: 1732595000000,
  },
];
