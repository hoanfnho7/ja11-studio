import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAutoEqTxt, parseFiioXml, serializeFiioXml } from '../src/core/fiioXml';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FiiO_DSP model="JadeAudio JA11" version="0.0.1">
  <module name="EQ">
    <eqGroup>
      <param name="masterGain">-4</param>
      <eqList>
        <eq index="0">
          <param name="type">1</param>
          <param name="freq">65</param>
          <param name="gain">3.5</param>
          <param name="q">0.71</param>
        </eq>
        <eq index="1">
          <param name="type">0</param>
          <param name="freq">110</param>
          <param name="gain">1.5</param>
          <param name="q">1.3</param>
        </eq>
        <eq index="2">
          <param name="type">0</param>
          <param name="freq">260</param>
          <param name="gain">-2.5</param>
          <param name="q">1.4</param>
        </eq>
        <eq index="3">
          <param name="type">0</param>
          <param name="freq">2800</param>
          <param name="gain">-3</param>
          <param name="q">2</param>
        </eq>
        <eq index="4">
          <param name="type">0</param>
          <param name="freq">9000</param>
          <param name="gain">2</param>
          <param name="q">1.2</param>
        </eq>
      </eqList>
    </eqGroup>
  </module>
  <styleName>JD1 + JA11 | Phonk &amp; 808 Bass</styleName>
  <description>Tuned for FiiO JD1 + JA11 combo. Heavy 808 sub-bass slam, punchy kick, and tamed cowbell harshness for Phonk, Drift Phonk &amp; Bass music.</description>
</FiiO_DSP>`;

describe('FiiO XML & AutoEQ Parser/Serializer', () => {
  it('parses the user FiiO XML file accurately and round-trips losslessly', () => {
    const userDesktopPath = 'c:\\Users\\lhoan\\Desktop\\JD1 + JA11 _ Phonk & 808 Bass.xml';
    const rawXml = fs.existsSync(userDesktopPath)
      ? fs.readFileSync(userDesktopPath, 'utf-8')
      : SAMPLE_XML;

    const parsed = parseFiioXml(rawXml);
    expect(parsed.name).toBe('JD1 + JA11 | Phonk & 808 Bass');
    expect(parsed.masterGain).toBe(-4);
    expect(parsed.bands[0]).toEqual({ type: 'LSQ', freq: 65, gain: 3.5, q: 0.71 });
    expect(parsed.bands[3]).toEqual({ type: 'PK', freq: 2800, gain: -3, q: 2 });

    const reExported = serializeFiioXml(parsed);
    expect(reExported).toContain('<FiiO_DSP model="JadeAudio JA11" version="0.0.1">');
    expect(reExported).toContain('Phonk &amp; 808 Bass');

    const reparsed = parseFiioXml(reExported);
    expect(reparsed.masterGain).toBe(-4);
    expect(reparsed.bands).toEqual(parsed.bands);
  });

  it('parses AutoEQ / Squig.link .txt files accurately', () => {
    const txt = [
      'Preamp: -12.0 dB',
      'Filter 1: ON LSC Fc 55 Hz Gain 1.5 dB Q 0.71',
      'Filter 2: ON PK Fc 185 Hz Gain -2.8 dB Q 1.10',
      'Filter 3: ON PK Fc 680 Hz Gain 2.0 dB Q 1.00',
      'Filter 4: ON PK Fc 4380 Hz Gain -3.8 dB Q 3.20',
      'Filter 5: ON PK Fc 7500 Hz Gain -2.5 dB Q 1.40',
    ].join('\n');

    const profile = parseAutoEqTxt(txt, 'JD1_Squig.txt');
    expect(profile.masterGain).toBe(-12);
    expect(profile.bands[0].type).toBe('LSQ');
    expect(profile.bands[3].freq).toBe(4380);
  });
});
