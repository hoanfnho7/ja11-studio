import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  adaptBandsToJa11,
  encodeBandLivePacket,
  encodeCommitFlashPacket,
  encodeMasterGainLivePacket,
  parseInputReport,
  setDeviceVolumePacket,
} from '../src/core/ja11Protocol';
import { Ja11LiveSyncEngine, Ja11Transport } from '../src/core/liveSyncEngine';

describe('JA11 Binary HID Protocol', () => {
  it('encodes live band packet without touching flash command 0x19', () => {
    const pkt = encodeBandLivePacket(3, {
      type: 'PK',
      freq: 4380,
      gain: -3.8,
      q: 3.2,
    });

    // -3.8 * 10 = -38 -> 0x10000 - 38 = 0xffda -> [0xff, 0xda]
    // 4380 -> 0x111c -> [0x11, 0x1c]
    // 3.2 * 100 = 320 -> 0x0140 -> [0x01, 0x40]
    expect(Array.from(pkt)).toEqual([
      0xaa, 0x0a, 0x00, 0x00, 0x15, 0x08, 0x03,
      0xff, 0xda,
      0x11, 0x1c,
      0x01, 0x40,
      0x00, 0x00, 0xee,
    ]);
    expect(pkt[4]).not.toBe(COMMANDS.SAVE_FLASH);
  });

  it('encodes and decodes -12 dB Master Gain (JA11 2560 LE fixed-point)', () => {
    const pkt = encodeMasterGainLivePacket(-12);
    expect(Array.from(pkt)).toEqual([
      0xaa, 0x0a, 0x00, 0x00, 0x17, 0x02,
      0x00, 0x88,
      0x00, 0xee,
    ]);

    const webHidResp = Uint8Array.from([0xbb, 0x0b, 0x00, 0x00, 0x17, 0x02, 0x00, 0x88, 0x00, 0xee]);
    const androidResp = Uint8Array.from([0x02, 0xbb, 0x0b, 0x00, 0x00, 0x17, 0x02, 0x00, 0x88, 0x00, 0xee]);

    expect(parseInputReport(webHidResp)).toEqual({ type: 'masterGain', value: -12 });
    expect(parseInputReport(androidResp)).toEqual({ type: 'masterGain', value: -12 });
  });

  it('encodes Device Volume (0..60) and official 9-byte Commit Flash RX(3) (0x19) accurately', () => {
    expect(Array.from(setDeviceVolumePacket(32))).toEqual([
      0xaa, 0x0a, 0x00, 0x00, 0x02, 0x01, 32, 0x00, 0xee,
    ]);
    expect(Array.from(encodeCommitFlashPacket(3))).toEqual([
      0xaa, 0x0a, 0x00, 0x00, 0x19, 0x01, 0x03, 0x00, 0xee,
    ]);
  });

  it('adapts 10-band Hand-Picked presets down to the 5 highest-impact bands sorted by frequency', () => {
    const tenBands = [
      { type: 'LSQ' as const, freq: 60, gain: 3.5, q: 0.7 },
      { type: 'PK' as const, freq: 120, gain: 0.3, q: 1.2 },
      { type: 'PK' as const, freq: 200, gain: -2.8, q: 1.1 },
      { type: 'PK' as const, freq: 400, gain: -0.2, q: 1.0 },
      { type: 'PK' as const, freq: 700, gain: 2.1, q: 1.0 },
      { type: 'PK' as const, freq: 1500, gain: 0.4, q: 1.5 },
      { type: 'PK' as const, freq: 3000, gain: -0.5, q: 2.0 },
      { type: 'PK' as const, freq: 4380, gain: -4.0, q: 3.2 },
      { type: 'PK' as const, freq: 7500, gain: -2.6, q: 1.4 },
      { type: 'HSQ' as const, freq: 12000, gain: 0.2, q: 0.7 },
    ];
    const adapted = adaptBandsToJa11(tenBands);
    expect(adapted.compressedFrom).toBe(10);
    expect(adapted.bands.map((b) => b.freq)).toEqual([60, 200, 700, 4380, 7500]);
  });

  it('streams live RAM edits without ever sending 0x19 until commitToFlash is called', async () => {
    const sentPackets: Uint8Array[] = [];
    const mockTransport: Ja11Transport = {
      kind: 'webhid',
      isSupported: true,
      async connect(onReport) {
        // Feed initial simulated hardware state when queried
        setTimeout(() => {
          onReport(Uint8Array.from([0xbb, 0x0b, 0, 0, 0x16, 1, 3, 0, 0xee])); // Preset = User 1
          onReport(Uint8Array.from([0xbb, 0x0b, 0, 0, 0x17, 2, 0x00, 0xd8, 0, 0xee])); // -4.0 dB
        }, 5);
        return { productName: 'Mock JA11' };
      },
      async disconnect() {},
      async sendReport(payload) {
        sentPackets.push(payload);
      },
    };

    const engine = new Ja11LiveSyncEngine(15);
    await engine.connectWith(mockTransport);
    sentPackets.length = 0;

    // Simulate rapid drag on Band 4 to a new gain (-4.6 dB != initial -3.8 dB)
    engine.updateBandLive(3, { freq: 4200, gain: -2.0 });
    engine.updateBandLive(3, { freq: 4380, gain: -4.6 });
    await new Promise((r) => setTimeout(r, 180));

    // Verify NO 0x19 flash save command was ever sent during live drag!
    expect(sentPackets.some((p) => p[4] === COMMANDS.SAVE_FLASH)).toBe(false);
    expect(sentPackets.some((p) => p[4] === COMMANDS.EQ_BAND)).toBe(true);
    expect(engine.getState().hasUnsavedRamChanges).toBe(true);

    // Explicit Save to Flash
    await engine.commitToFlash();
    expect(sentPackets.some((p) => p[4] === COMMANDS.SAVE_FLASH)).toBe(true);
    expect(engine.getState().hasUnsavedRamChanges).toBe(false);
  });
});
