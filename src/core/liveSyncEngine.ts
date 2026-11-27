import {
  BAND_COUNT,
  DEFAULT_NEUTRAL_BANDS,
  EQ_PRESET_NAMES,
  Ja11HardwareState,
  PeqBand,
  PeqSnapshot,
  REPORT_ID,
  cloneSnapshot,
  encodeBandLivePacket,
  encodeCommitFlashPacket,
  encodeFactoryResetPeqPacket,
  encodeMasterGainLivePacket,
  normalizeBand,
  normalizeMasterGain,
  parseInputReport,
  requestBandPacket,
  requestDeviceVolumePacket,
  requestEqPresetPacket,
  requestFirmwareVersionPacket,
  requestInlineControlPacket,
  requestMasterGainPacket,
  requestSampleRatePacket,
  requestUacModePacket,
  setDeviceVolumePacket,
  setEqPresetPacket,
  setInlineControlPacket,
  setUacModePacket,
  snapshotsEqual,
} from './ja11Protocol';

export interface Ja11Transport {
  readonly kind: 'webhid' | 'android-usb';
  readonly isSupported: boolean;
  connect(
    onReport: (data: Uint8Array) => void,
    onDisconnect: () => void,
    options?: { silentOnly?: boolean },
  ): Promise<{ productName: string }>;
  disconnect(): Promise<void>;
  sendReport(payload: Uint8Array): Promise<void>;
}

export interface EngineState {
  hardware: Ja11HardwareState;
  livePeq: PeqSnapshot;
  savedFlashSnapshot: PeqSnapshot | null;
  originalPresetBeforePreview: number | null;
  hasUnsavedRamChanges: boolean;
  isSyncing: boolean;
  lastMessage: string;
}

type StateListener = (state: EngineState) => void;

/**
 * Matches official FiiO Web Control (`w3e = { 100: [Z.JADEAUDIO_JA11, ...] }` + `sendReportAndListen`):
 * Waits for device ACK report (or short timeout) + 110ms pacing so packets never collide!
 */
const DEFAULT_COMMAND_GAP_MS = 110;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bandsIdentical(a: PeqBand, b: PeqBand): boolean {
  return a.type === b.type && a.freq === b.freq && a.gain === b.gain && a.q === b.q;
}

export class Ja11LiveSyncEngine {
  private readonly commandGapMs: number;
  private transport: Ja11Transport | null = null;
  private lastTransportFactory: (() => Ja11Transport) | null = null;
  private listeners = new Set<StateListener>();

  private pendingAck: { command: number; resolve: () => void } | null = null;
  private lastSentRamSnapshot: PeqSnapshot | null = null;
  private lastSentAt = 0;
  private expectingUsbRestart = false;
  private reconnectGeneration = 0;

  // Coalescing live-preview queue (RAM only — never writes flash!)
  private dirtyBands = new Map<number, PeqBand>();
  private dirtyMasterGain: number | null = null;
  private dirtyVolume: number | null = null;
  private pumpRunning = false;

  private state: EngineState = {
    hardware: {
      connected: false,
      transportName: 'none',
      productName: 'Chưa kết nối JA11',
      firmwareVersion: '--',
      sampleRate: '--',
      deviceVolume: 36,
      inlineControl: true,
      eqPreset: 3,
      uacMode: 1,
    },
    livePeq: {
      masterGain: -12,
      bands: [
        { type: 'LSQ', freq: 55, gain: 1.5, q: 0.71 },
        { type: 'PK', freq: 185, gain: -2.8, q: 1.1 },
        { type: 'PK', freq: 680, gain: 2.0, q: 1.0 },
        { type: 'PK', freq: 4380, gain: -3.8, q: 3.2 },
        { type: 'PK', freq: 7500, gain: -2.5, q: 1.4 },
      ],
    },
    savedFlashSnapshot: null,
    originalPresetBeforePreview: null,
    hasUnsavedRamChanges: false,
    isSyncing: false,
    lastMessage: 'Sẵn sàng (có thể chỉnh Offline trước hoặc cắm JA11 để nghe Live).',
  };

  constructor(commandGapMs = DEFAULT_COMMAND_GAP_MS) {
    this.commandGapMs = commandGapMs;
  }

  getState(): EngineState {
    return this.state;
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit(patch?: Partial<EngineState>) {
    if (patch) {
      this.state = { ...this.state, ...patch };
    }
    const hasUnsaved =
      this.state.hardware.connected &&
      this.state.savedFlashSnapshot !== null &&
      !snapshotsEqual(this.state.livePeq, this.state.savedFlashSnapshot);
    this.state = { ...this.state, hasUnsavedRamChanges: hasUnsaved };
    for (const fn of this.listeners) fn(this.state);
  }

  /**
   * Sends a HID report and waits for the JA11's acknowledgement inputreport (like FiiO's sendReportAndListen)
   * plus minimum gap pacing so commands execute deterministically without dropping or resetting USB.
   */
  private async sendAndListen(packet: Uint8Array, ackTimeoutMs = 450): Promise<void> {
    if (!this.transport) throw new Error('JA11 chưa kết nối.');
    const elapsed = performance.now() - this.lastSentAt;
    if (elapsed < this.commandGapMs) {
      await sleep(this.commandGapMs - elapsed);
    }
    if (!this.transport) throw new Error('JA11 đã ngắt kết nối.');

    const cmd = packet[4];
    const ackPromise = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingAck?.resolve === done) {
          this.pendingAck = null;
        }
        resolve();
      }, Math.min(ackTimeoutMs, Math.max(40, this.commandGapMs * 4)));

      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      this.pendingAck = { command: cmd, resolve: done };
    });

    await this.transport.sendReport(packet);
    await ackPromise;
    this.lastSentAt = performance.now();
  }

  async connectWith(
    transport: Ja11Transport,
    factory?: () => Ja11Transport,
    options?: { silentOnly?: boolean; preserveSnapshot?: PeqSnapshot; preservePresetCode?: number },
  ): Promise<void> {
    if (!options?.silentOnly) {
      // User clicked manual Connect -> immediately cancel any background silent-reconnect loop!
      this.reconnectGeneration++;
    }
    if (factory) this.lastTransportFactory = factory;
    if (this.transport) {
      const prevFactory = this.lastTransportFactory;
      await this.disconnect();
      this.lastTransportFactory = prevFactory;
    }
    if (!options?.silentOnly) {
      this.emit({ isSyncing: true, lastMessage: 'Đang mở kết nối USB tới FiiO JA11...' });
    }

    try {
      const info = await transport.connect(
        (report) => this.handleIncomingReport(report),
        () => void this.handleUnexpectedDisconnect(),
        { silentOnly: options?.silentOnly },
      );
      this.transport = transport;
      this.lastSentAt = 0;
      this.state = {
        ...this.state,
        hardware: {
          ...this.state.hardware,
          connected: true,
          transportName: transport.kind,
          productName: info.productName || 'JadeAudio JA11',
        },
      };

      if (options?.preserveSnapshot) {
        await this.readFullDeviceState(false);
        this.state = {
          ...this.state,
          savedFlashSnapshot: cloneSnapshot(this.state.livePeq),
          originalPresetBeforePreview: options.preservePresetCode ?? this.state.hardware.eqPreset,
        };
        this.emit({
          isSyncing: false,
          lastMessage: '✅ Đã lưu cứng vào chip Flash JA11 & tự động kết nối lại thành công!',
        });
      } else {
        this.emit({ lastMessage: 'Đã kết nối! Đang đọc cấu hình hiện tại từ JA11...' });
        await this.readFullDeviceState(true);
      }
    } catch (err) {
      this.transport = null;
      if (!options?.silentOnly) {
        const msg = err instanceof Error ? err.message : String(err);
        this.emit({
          isSyncing: false,
          lastMessage: `Không thể kết nối JA11: ${msg}`,
        });
      }
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.expectingUsbRestart = false;
    this.dirtyBands.clear();
    this.dirtyMasterGain = null;
    this.dirtyVolume = null;
    this.lastSentRamSnapshot = null;
    if (this.transport) {
      try {
        await this.transport.disconnect();
      } catch {
        // ignore
      }
      this.transport = null;
    }
    this.emit({
      hardware: {
        ...this.state.hardware,
        connected: false,
        transportName: 'none',
      },
      savedFlashSnapshot: null,
      originalPresetBeforePreview: null,
      isSyncing: false,
      lastMessage: 'Đã ngắt kết nối JA11.',
    });
  }

  private async handleUnexpectedDisconnect() {
    this.transport = null;
    this.dirtyBands.clear();
    this.dirtyMasterGain = null;
    this.dirtyVolume = null;
    this.lastSentRamSnapshot = null;

    const wasExpected = this.expectingUsbRestart;
    const savedSnap = this.state.savedFlashSnapshot ? cloneSnapshot(this.state.savedFlashSnapshot) : undefined;
    const savedPreset = this.state.hardware.eqPreset;
    this.expectingUsbRestart = false;
    const myGen = ++this.reconnectGeneration;

    // IMPORTANT: keep isSyncing = false so the user can ALWAYS click "Kết nối FiiO JA11" immediately without freezing!
    this.emit({
      hardware: {
        ...this.state.hardware,
        connected: false,
        transportName: 'none',
      },
      isSyncing: false,
      lastMessage: wasExpected
        ? 'Chip JA11 đang chớp khởi động lại (~1s) sau khi ghi Flash — đang tự kết nối lại (hoặc bấm Kết nối ngay)...'
        : 'JA11 vừa ngắt kết nối USB. Bấm Kết nối FiiO JA11 để kết nối lại.',
    });

    if (wasExpected && this.lastTransportFactory) {
      const factory = this.lastTransportFactory;
      const navHid = typeof navigator !== 'undefined' ? (navigator as unknown as { hid?: EventTarget }).hid : undefined;
      let reconnected = false;
      let attempting = false;

      const trySilentConnect = async () => {
        if (myGen !== this.reconnectGeneration || reconnected || attempting || this.state.hardware.connected) {
          return reconnected;
        }
        attempting = true;
        try {
          const fresh = factory();
          await this.connectWith(fresh, factory, {
            silentOnly: true,
            preserveSnapshot: savedSnap,
            preservePresetCode: savedPreset,
          });
          reconnected = true;
          return true;
        } catch {
          return false;
        } finally {
          attempting = false;
        }
      };

      const onHidConnect = () => {
        setTimeout(() => {
          void trySilentConnect();
        }, 350);
      };
      navHid?.addEventListener?.('connect', onHidConnect);

      try {
        for (const delay of [700, 900, 1100, 1300, 1500]) {
          await sleep(delay);
          if (myGen !== this.reconnectGeneration || reconnected || this.state.hardware.connected) return;
          if (await trySilentConnect()) return;
        }
      } finally {
        navHid?.removeEventListener?.('connect', onHidConnect);
      }
    }

    if (myGen === this.reconnectGeneration && !this.state.hardware.connected) {
      this.emit({
        isSyncing: false,
        savedFlashSnapshot: null,
        originalPresetBeforePreview: null,
        lastMessage: wasExpected
          ? 'Đã ghi Flash xong! Bấm "Kết nối FiiO JA11" để tiếp tục chỉnh.'
          : 'JA11 đã ngắt kết nối USB. Bấm Kết nối FiiO JA11 để tiếp tục.',
      });
    }
  }

  private handleIncomingReport(raw: Uint8Array) {
    const hasId = raw[0] === REPORT_ID && (raw[1] === 0xbb || raw[1] === 0xaa);
    const cmdByte = raw[hasId ? 5 : 4];

    if (this.pendingAck && this.pendingAck.command === cmdByte) {
      const done = this.pendingAck.resolve;
      this.pendingAck = null;
      done();
    }

    const parsed = parseInputReport(raw);
    if (!parsed) return;

    const hw = { ...this.state.hardware };
    const peq = cloneSnapshot(this.state.livePeq);

    switch (parsed.type) {
      case 'deviceVolume':
        hw.deviceVolume = parsed.value;
        break;
      case 'sampleRate':
        hw.sampleRate = parsed.value;
        break;
      case 'firmwareVersion':
        hw.firmwareVersion = `v${parsed.value}`;
        break;
      case 'inlineControl':
        hw.inlineControl = parsed.value;
        break;
      case 'eqPreset':
        hw.eqPreset = parsed.code;
        break;
      case 'uacMode':
        hw.uacMode = parsed.code;
        break;
      case 'masterGain':
        peq.masterGain = parsed.value;
        break;
      case 'band':
        if (parsed.index >= 0 && parsed.index < BAND_COUNT) {
          peq.bands[parsed.index] = parsed.value;
        }
        break;
    }

    this.state = {
      ...this.state,
      hardware: hw,
      livePeq: peq,
    };
    this.emit();
  }

  async readEqCurveFromDevice(): Promise<void> {
    if (!this.transport) return;
    await this.sendAndListen(requestMasterGainPacket());
    for (let i = 0; i < BAND_COUNT; i++) {
      if (!this.transport) break;
      await this.sendAndListen(requestBandPacket(i));
    }
    this.lastSentRamSnapshot = cloneSnapshot(this.state.livePeq);
  }

  async readFullDeviceState(captureSnapshot = false): Promise<void> {
    if (!this.transport) return;
    this.emit({ isSyncing: true });

    const headerQueries = [
      requestUacModePacket(),
      requestInlineControlPacket(),
      requestDeviceVolumePacket(),
      requestEqPresetPacket(),
      requestSampleRatePacket(),
      requestFirmwareVersionPacket(),
    ];

    for (const pkt of headerQueries) {
      if (!this.transport) break;
      await this.sendAndListen(pkt);
    }

    await this.readEqCurveFromDevice();

    if (this.state.hardware.eqPreset === 4) {
      // EQ Off -> show flat 0 dB curve visually while keeping snapshot safe
      this.state = {
        ...this.state,
        livePeq: { masterGain: 0, bands: cloneSnapshot({ masterGain: 0, bands: DEFAULT_NEUTRAL_BANDS }).bands },
      };
    }

    if (captureSnapshot) {
      this.state = {
        ...this.state,
        savedFlashSnapshot: cloneSnapshot(this.state.livePeq),
        originalPresetBeforePreview: this.state.hardware.eqPreset,
      };
    }

    this.emit({
      isSyncing: false,
      lastMessage: captureSnapshot
        ? 'Đã đồng bộ & sao lưu Profile gốc — kéo thả đồ thị hoặc chọn Chế độ để nghe ngay!'
        : 'Đã đồng bộ trạng thái từ JA11.',
    });
  }

  /**
   * Switches between JA11's 5 hardware EQ modes (0=Vocal, 1=Classic, 2=Bass, 3=User 1, 4=Off)
   * AND immediately reads back the active mode's 5 bands + Master Gain from JA11 onto the graph
   * (matching official fiiocontrol.fiio.com my-device behavior!).
   */
  async setEqMode(presetCode: number): Promise<void> {
    const modeName = EQ_PRESET_NAMES[presetCode] ?? `Mode ${presetCode}`;

    // Wait for any live drag packets to drain first
    while (this.pumpRunning) {
      await sleep(30);
    }

    this.dirtyBands.clear();
    this.dirtyMasterGain = null;

    this.state = {
      ...this.state,
      hardware: { ...this.state.hardware, eqPreset: presetCode },
    };

    if (!this.transport || !this.state.hardware.connected) {
      if (presetCode === 4) {
        this.state = {
          ...this.state,
          livePeq: { masterGain: 0, bands: cloneSnapshot({ masterGain: 0, bands: DEFAULT_NEUTRAL_BANDS }).bands },
        };
      }
      this.emit({ lastMessage: `Đã chọn chế độ ${modeName} (cắm JA11 để áp dụng phần cứng).` });
      return;
    }

    this.emit({ isSyncing: true, lastMessage: `Đang chuyển JA11 sang chế độ "${modeName}" & đọc thông số...` });

    try {
      await this.sendAndListen(setEqPresetPacket(presetCode));
      await this.sendAndListen(requestEqPresetPacket());

      if (presetCode === 4) {
        // Off / Bypass mode -> show flat 0dB curve on graph
        this.state = {
          ...this.state,
          livePeq: { masterGain: 0, bands: cloneSnapshot({ masterGain: 0, bands: DEFAULT_NEUTRAL_BANDS }).bands },
        };
        this.lastSentRamSnapshot = null;
      } else {
        // Vocal (0), Classic (1), Bass (2), or User 1 (3): read actual bands & masterGain from JA11!
        await this.readEqCurveFromDevice();
      }

      this.emit({
        isSyncing: false,
        lastMessage:
          presetCode === 4
            ? 'Đã tắt EQ (Bypass phẳng 0 dB).'
            : `Đã kích hoạt chế độ "${modeName}" trên JA11 và hiển thị đáp tuyến lên đồ thị!`,
      });
    } catch (err) {
      this.emit({
        isSyncing: false,
        lastMessage: `Lỗi chuyển chế độ ${modeName}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  updateBandLive(index: number, patch: Partial<PeqBand>) {
    const nextBands = this.state.livePeq.bands.map((b, i) =>
      i === index ? normalizeBand({ ...b, ...patch }, b.freq) : b,
    ) as [PeqBand, PeqBand, PeqBand, PeqBand, PeqBand];

    const wasNonUserMode = this.state.hardware.eqPreset !== 3;
    this.state = {
      ...this.state,
      livePeq: {
        ...this.state.livePeq,
        bands: nextBands,
      },
    };
    this.emit();

    if (this.transport && this.state.hardware.connected) {
      if (wasNonUserMode) {
        // Copy all 5 bands into User 1 RAM when customizing from Vocal/Classic/Bass/Off
        for (let i = 0; i < BAND_COUNT; i++) {
          this.dirtyBands.set(i, nextBands[i]);
        }
        this.dirtyMasterGain = this.state.livePeq.masterGain;
      } else {
        this.dirtyBands.set(index, nextBands[index]);
      }
      void this.runLivePump();
    }
  }

  updateMasterGainLive(masterGain: number) {
    const normalized = normalizeMasterGain(masterGain);
    this.state = {
      ...this.state,
      livePeq: {
        ...this.state.livePeq,
        masterGain: normalized,
      },
    };
    this.emit();

    if (this.transport && this.state.hardware.connected) {
      this.dirtyMasterGain = normalized;
      void this.runLivePump();
    }
  }

  applySnapshotLive(snapshot: PeqSnapshot, label?: string) {
    const next = cloneSnapshot(snapshot);
    this.state = {
      ...this.state,
      livePeq: next,
    };
    this.emit({
      lastMessage: this.state.hardware.connected
        ? `Đang nạp Profile "${label || 'Custom'}" lên RAM JA11...`
        : `Đã nạp "${label || 'Custom'}" lên bàn chỉnh (Cắm JA11 để nghe Live).`,
    });

    if (this.transport && this.state.hardware.connected) {
      const prev = this.state.hardware.eqPreset === 3 ? this.lastSentRamSnapshot : null;
      for (let i = 0; i < BAND_COUNT; i++) {
        if (!prev || !bandsIdentical(prev.bands[i], next.bands[i])) {
          this.dirtyBands.set(i, next.bands[i]);
        } else {
          this.dirtyBands.delete(i);
        }
      }
      if (!prev || prev.masterGain !== next.masterGain) {
        this.dirtyMasterGain = next.masterGain;
      } else {
        this.dirtyMasterGain = null;
      }
      void this.runLivePump(label ? `Đang nghe thử Live trên RAM: "${label}" (Chưa ghi đè gốc)` : undefined);
    }
  }

  updateDeviceVolumeLive(volume: number) {
    const v = Math.max(0, Math.min(60, Math.round(volume)));
    this.state = {
      ...this.state,
      hardware: {
        ...this.state.hardware,
        deviceVolume: v,
      },
    };
    this.emit();

    if (this.transport && this.state.hardware.connected) {
      this.dirtyVolume = v;
      void this.runLivePump();
    }
  }

  private async runLivePump(completionMessage?: string): Promise<void> {
    if (this.pumpRunning) return;
    this.pumpRunning = true;

    try {
      while (
        this.transport &&
        this.state.hardware.connected &&
        (this.dirtyVolume !== null || this.dirtyMasterGain !== null || this.dirtyBands.size > 0)
      ) {
        if (this.dirtyVolume !== null) {
          const vol = this.dirtyVolume;
          this.dirtyVolume = null;
          await this.sendAndListen(setDeviceVolumePacket(vol));
          continue;
        }

        if (this.state.hardware.eqPreset !== 3 && (this.dirtyMasterGain !== null || this.dirtyBands.size > 0)) {
          await this.sendAndListen(setEqPresetPacket(3));
          this.state = {
            ...this.state,
            hardware: { ...this.state.hardware, eqPreset: 3 },
          };
          this.emit();
          continue;
        }

        const firstEntry = this.dirtyBands.entries().next();
        if (!firstEntry.done) {
          const [bandIdx, bandVal] = firstEntry.value;
          this.dirtyBands.delete(bandIdx);
          await this.sendAndListen(encodeBandLivePacket(bandIdx, bandVal));
          if (!this.lastSentRamSnapshot) {
            this.lastSentRamSnapshot = cloneSnapshot(this.state.livePeq);
          } else {
            this.lastSentRamSnapshot.bands[bandIdx] = { ...bandVal };
          }
          continue;
        }

        if (this.dirtyMasterGain !== null) {
          const mg = this.dirtyMasterGain;
          this.dirtyMasterGain = null;
          await this.sendAndListen(encodeMasterGainLivePacket(mg));
          if (!this.lastSentRamSnapshot) {
            this.lastSentRamSnapshot = cloneSnapshot(this.state.livePeq);
          } else {
            this.lastSentRamSnapshot.masterGain = mg;
          }
        }
      }

      if (completionMessage && this.state.hardware.connected) {
        this.emit({ lastMessage: completionMessage });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit({ lastMessage: `Lỗi truyền gói tin Live: ${msg}` });
    } finally {
      this.pumpRunning = false;
    }
  }

  async revertToSavedSnapshot(): Promise<void> {
    if (!this.state.savedFlashSnapshot) {
      this.applySnapshotLive({ masterGain: 0, bands: DEFAULT_NEUTRAL_BANDS }, 'Mặc định phẳng (0 dB)');
      return;
    }

    const snap = cloneSnapshot(this.state.savedFlashSnapshot);
    if (
      this.state.originalPresetBeforePreview !== null &&
      this.state.originalPresetBeforePreview !== 3
    ) {
      await this.setEqMode(this.state.originalPresetBeforePreview);
      this.emit({ lastMessage: 'Đã khôi phục nguyên trạng Chế độ gốc (không hề bị ghi đè)!' });
      return;
    }

    this.applySnapshotLive(snap, 'Profile gốc trong JA11');
  }

  /**
   * Commits the active EQ mode (0=Vocal, 1=Classic, 2=Bass, 3=User 1, 4=Off) to JA11 Flash.
   * Matches official fiiocontrol.fiio.com: ONLY writes custom 5-band params if currently on User 1 (3),
   * and passes the active preset code to RX(activePreset) so Vocal/Classic/Bass are preserved!
   */
  async commitToFlash(): Promise<void> {
    if (!this.transport || !this.state.hardware.connected) {
      throw new Error('Chưa kết nối JA11 qua USB.');
    }

    while (this.pumpRunning) {
      await sleep(30);
    }

    const activePreset = this.state.hardware.eqPreset;
    const modeName = EQ_PRESET_NAMES[activePreset] ?? `Mode ${activePreset}`;
    const snap = cloneSnapshot(this.state.livePeq);
    this.emit({ isSyncing: true, lastMessage: `Đang ghi cứng chế độ "${modeName}" vào chip nhớ Flash JA11...` });

    if (activePreset === 3) {
      for (let i = 0; i < BAND_COUNT; i++) {
        if (!this.lastSentRamSnapshot || !bandsIdentical(this.lastSentRamSnapshot.bands[i], snap.bands[i])) {
          await this.sendAndListen(encodeBandLivePacket(i, snap.bands[i]));
        }
      }
      if (!this.lastSentRamSnapshot || this.lastSentRamSnapshot.masterGain !== snap.masterGain) {
        await this.sendAndListen(encodeMasterGainLivePacket(snap.masterGain));
      }
    }

    this.lastSentRamSnapshot = cloneSnapshot(snap);
    this.state = {
      ...this.state,
      savedFlashSnapshot: snap,
      originalPresetBeforePreview: activePreset,
    };
    this.expectingUsbRestart = true;

    try {
      await this.transport.sendReport(encodeCommitFlashPacket(activePreset));
    } catch {
      // Device may immediately begin SPI flash erase & USB reboot
    }

    // Keep expectingUsbRestart true for 2.5s in case USB disconnect arrives slightly later
    await sleep(1200);
    if (this.state.hardware.connected && this.expectingUsbRestart) {
      this.expectingUsbRestart = false;
      this.emit({
        isSyncing: false,
        lastMessage: `✅ Đã lưu cứng chế độ "${modeName}" vào bộ nhớ Flash JA11!`,
      });
    }
  }

  async setInlineMic(enabled: boolean): Promise<void> {
    if (!this.transport || !this.state.hardware.connected) return;
    this.expectingUsbRestart = true;
    this.emit({
      lastMessage: 'Đang đổi chế độ Inline Mic (JA11 sẽ tự khởi động lại cổng USB)...',
    });
    await this.sendAndListen(setInlineControlPacket(enabled));
  }

  async setUacMode(modeCode: number): Promise<void> {
    if (!this.transport || !this.state.hardware.connected) return;
    this.expectingUsbRestart = true;
    this.emit({
      lastMessage: 'Đang chuyển chuẩn UAC (JA11 sẽ tự khởi động lại cổng USB)...',
    });
    await this.sendAndListen(setUacModePacket(modeCode));
  }

  async factoryResetPeq(): Promise<void> {
    while (this.pumpRunning) {
      await sleep(30);
    }
    this.dirtyBands.clear();
    this.dirtyMasterGain = null;

    if (!this.transport || !this.state.hardware.connected) {
      this.applySnapshotLive({ masterGain: 0, bands: DEFAULT_NEUTRAL_BANDS }, 'Khôi phục mặc định (0 dB)');
      return;
    }

    this.emit({ isSyncing: true, lastMessage: 'Đang khôi phục thông số PEQ xuất xưởng cho JA11...' });
    try {
      await this.sendAndListen(encodeFactoryResetPeqPacket());
      await this.readEqCurveFromDevice();
      this.emit({
        isSyncing: false,
        lastMessage: 'Đã khôi phục thông số EQ xuất xưởng trên JA11!',
      });
    } catch (err) {
      this.emit({
        isSyncing: false,
        lastMessage: `Lỗi khôi phục gốc: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

export const ja11Engine = new Ja11LiveSyncEngine();
