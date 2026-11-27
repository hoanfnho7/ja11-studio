import { REPORT_ID } from '../core/ja11Protocol';
import { Ja11Transport } from '../core/liveSyncEngine';

export interface Ja11AndroidNativeBridge {
  isAndroidApp(): boolean;
  connectDevice(): string; // JSON: { ok: boolean, productName?: string, error?: string, pendingPermission?: boolean }
  disconnectDevice(): void;
  sendHidReportBase64(reportId: number, base64Payload: string): boolean;
  httpPostJson(url: string, jsonBody: string, headersJson: string): string;
  saveExportFile?(filename: string, content: string, mimeType: string): boolean;
}

declare global {
  interface Window {
    Ja11AndroidBridge?: Ja11AndroidBridgeWrapper;
    __onJa11AndroidHidReport?: (base64Data: string) => void;
    __onJa11AndroidUsbDisconnected?: () => void;
    __onJa11AndroidPermissionResult?: (granted: boolean) => void;
  }
}

type Ja11AndroidBridgeWrapper = Ja11AndroidNativeBridge;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function isRunningInsideAndroidApk(): boolean {
  return typeof window !== 'undefined' && Boolean(window.Ja11AndroidBridge?.isAndroidApp?.());
}

export class AndroidUsbTransport implements Ja11Transport {
  readonly kind = 'android-usb' as const;

  get isSupported(): boolean {
    return isRunningInsideAndroidApk();
  }

  async connect(
    onReport: (data: Uint8Array) => void,
    onDisconnect: () => void,
    options?: { silentOnly?: boolean },
  ): Promise<{ productName: string }> {
    const bridge = window.Ja11AndroidBridge;
    if (!bridge) {
      throw new Error('Không tìm thấy cầu nối Android USB Native.');
    }

    window.__onJa11AndroidHidReport = (b64: string) => {
      try {
        onReport(base64ToBytes(b64));
      } catch {
        // ignore malformed frame
      }
    };

    window.__onJa11AndroidUsbDisconnected = () => {
      onDisconnect();
    };

    const firstRaw = bridge.connectDevice();
    const first = JSON.parse(firstRaw) as {
      ok: boolean;
      productName?: string;
      error?: string;
      pendingPermission?: boolean;
    };

    if (first.ok) {
      return { productName: first.productName || 'JadeAudio JA11 (USB OTG)' };
    }

    if (first.pendingPermission && !options?.silentOnly) {
      const granted = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 25000);
        window.__onJa11AndroidPermissionResult = (ok: boolean) => {
          clearTimeout(timer);
          resolve(ok);
        };
      });
      if (!granted) {
        throw new Error('Bạn chưa cấp quyền truy cập USB cho JA11 trên điện thoại.');
      }
      const second = JSON.parse(bridge.connectDevice()) as {
        ok: boolean;
        productName?: string;
        error?: string;
      };
      if (!second.ok) {
        throw new Error(second.error || 'Không mở được giao diện HID trên cổng USB-C.');
      }
      return { productName: second.productName || 'JadeAudio JA11 (USB OTG)' };
    }

    throw new Error(first.error || 'Chưa phát hiện FiiO JA11 cắm ở cổng USB-C điện thoại.');
  }

  async disconnect(): Promise<void> {
    window.__onJa11AndroidHidReport = undefined;
    window.__onJa11AndroidUsbDisconnected = undefined;
    window.Ja11AndroidBridge?.disconnectDevice();
  }

  async sendReport(payload: Uint8Array): Promise<void> {
    const bridge = window.Ja11AndroidBridge;
    if (!bridge) throw new Error('Mất kết nối cầu nối Android USB.');
    const ok = bridge.sendHidReportBase64(REPORT_ID, bytesToBase64(payload));
    if (!ok) {
      throw new Error('Gửi gói tin USB HID xuống JA11 thất bại.');
    }
  }
}
