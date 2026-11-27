import { JA11_HID_FILTERS, JA11_PIDS, JA11_VID, REPORT_ID } from '../core/ja11Protocol';
import { Ja11Transport } from '../core/liveSyncEngine';

interface HIDReportInfo {
  readonly reportId?: number;
}

interface HIDCollectionInfo {
  readonly inputReports?: readonly HIDReportInfo[];
  readonly outputReports?: readonly HIDReportInfo[];
}

interface HIDInputReportEvent extends Event {
  readonly data: DataView;
  readonly reportId: number;
}

interface HIDDeviceLike {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName?: string;
  readonly collections?: readonly HIDCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface NavigatorHID {
  getDevices(): Promise<HIDDeviceLike[]>;
  requestDevice(options: { filters: readonly { vendorId: number; productId: number }[] }): Promise<HIDDeviceLike[]>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

function getNavHid(): NavigatorHID | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as unknown as { hid?: NavigatorHID }).hid ?? null;
}

/**
 * Matches FiiO's official `u3e` selector: when Inline Mic / Headset buttons are enabled,
 * Windows exposes multiple HID interfaces on JA11 (Consumer Control vs Vendor DSP Control).
 * Always pick the interface that supports Report ID 2 for BOTH input and output!
 */
function pickJa11VendorControlDevice(devices: HIDDeviceLike[]): HIDDeviceLike | undefined {
  const ja11List = devices.filter(
    (d) => d.vendorId === JA11_VID && (JA11_PIDS as readonly number[]).includes(d.productId),
  );
  if (ja11List.length <= 1) return ja11List[0];

  const exactReport2 = ja11List.filter((d) =>
    d.collections?.some(
      (col) =>
        col.inputReports?.some((r) => r.reportId === REPORT_ID) &&
        col.outputReports?.some((r) => r.reportId === REPORT_ID),
    ),
  );
  if (exactReport2.length > 0) return exactReport2[0];

  const anyBidirectional = ja11List.filter((d) =>
    d.collections?.some((col) => (col.inputReports?.length ?? 0) > 0 && (col.outputReports?.length ?? 0) > 0),
  );
  return anyBidirectional[0] ?? ja11List[0];
}

export class WebHidTransport implements Ja11Transport {
  readonly kind = 'webhid' as const;
  private device: HIDDeviceLike | null = null;
  private reportHandler: ((e: Event) => void) | null = null;
  private disconnectHandler: ((e: Event) => void) | null = null;

  get isSupported(): boolean {
    return getNavHid() !== null;
  }

  async connect(
    onReport: (data: Uint8Array) => void,
    onDisconnect: () => void,
    options?: { silentOnly?: boolean },
  ): Promise<{ productName: string }> {
    const hid = getNavHid();
    if (!hid) {
      throw new Error(
        'Trình duyệt không hỗ trợ WebHID. Hãy dùng Chrome, Edge hoặc Opera trên PC (hoặc bản APK trên Android).',
      );
    }

    const authorized = await hid.getDevices();
    let chosen = pickJa11VendorControlDevice(authorized);

    if (!chosen) {
      if (options?.silentOnly) {
        throw new Error('JA11 đang khởi động lại cổng USB...');
      }
      const requested = await hid.requestDevice({ filters: JA11_HID_FILTERS });
      chosen = pickJa11VendorControlDevice(requested);
    }

    if (!chosen) {
      throw new Error('Chưa chọn thiết bị FiiO JA11 trong hộp thoại USB.');
    }

    if (!chosen.opened) {
      await chosen.open();
    }

    this.device = chosen;

    this.reportHandler = (ev: Event) => {
      const rep = ev as HIDInputReportEvent;
      if (rep.reportId !== REPORT_ID && rep.reportId !== 0) return;
      const view = rep.data;
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      onReport(bytes);
    };

    this.disconnectHandler = (ev: Event) => {
      const dev = (ev as unknown as { device?: HIDDeviceLike }).device;
      if (!dev || dev === this.device) {
        this.cleanupListeners();
        this.device = null;
        onDisconnect();
      }
    };

    chosen.addEventListener('inputreport', this.reportHandler);
    hid.addEventListener('disconnect', this.disconnectHandler);

    return {
      productName: chosen.productName || 'JadeAudio JA11',
    };
  }

  private cleanupListeners() {
    const hid = getNavHid();
    if (this.device && this.reportHandler) {
      this.device.removeEventListener('inputreport', this.reportHandler);
    }
    if (hid && this.disconnectHandler) {
      hid.removeEventListener('disconnect', this.disconnectHandler);
    }
    this.reportHandler = null;
    this.disconnectHandler = null;
  }

  async disconnect(): Promise<void> {
    this.cleanupListeners();
    if (this.device) {
      const dev = this.device;
      this.device = null;
      if (dev.opened) {
        await dev.close();
      }
    }
  }

  async sendReport(payload: Uint8Array): Promise<void> {
    if (!this.device || !this.device.opened) {
      throw new Error('Thiết bị JA11 đã ngắt kết nối.');
    }
    const copy = new Uint8Array(payload.byteLength);
    copy.set(payload);
    await this.device.sendReport(REPORT_ID, copy);
  }
}
