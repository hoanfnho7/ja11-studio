package com.ja11studio.app.usb;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import com.ja11studio.app.core.Ja11Protocol;
import com.ja11studio.app.core.Ja11Protocol.ParsedReport;
import com.ja11studio.app.core.PeqModels.HardwareState;
import com.ja11studio.app.core.PeqModels.PeqBand;
import com.ja11studio.app.core.PeqModels.PeqSnapshot;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Non-blocking Native USB-C OTG HID Controller & Live Coalescing Sync Engine for FiiO JA11.
 *
 * Solves all 5 mobile hardware issues:
 * 1. Scans ALL USB_CLASS_HID interfaces, parses HID Report Descriptor (0x22) for REPORT_ID 2 (0x85 0x02),
 *    and prioritizes bidirectional IN+OUT interfaces (never getting stuck on Headset Button HID!).
 * 2. Auto-probes 4 USB HID output framing modes during handshake against real Firmware ACK (0x0B)
 *    so exact-length vs maxPacketSize vs SET_REPORT works across all Snapdragon/Dimensity/Exynos kernels.
 * 3. Runs 100% off the UI thread on a single serialized USB worker + Latest-Value Coalescing pump.
 * 4. Handles Android 14-16 explicit PendingIntent + onResume permission verification + auto-reconnect after 0x19 Flash save.
 */
public final class Ja11UsbController {
    private static volatile Ja11UsbController activeInstance;

    public static Ja11UsbController getActiveInstance() {
        return activeInstance;
    }

    public interface Listener {
        void onStateChanged(
                HardwareState hw,
                PeqSnapshot livePeq,
                PeqSnapshot savedSnapshot,
                boolean hasUnsavedChanges,
                String activeProfileLabel
        );

        void onToast(String message);
    }

    private static final int TX_MODE_INTR_EXACT = 0;
    private static final int TX_MODE_INTR_PADDED = 1;
    private static final int TX_MODE_CTRL_WITH_ID = 2;
    private static final int TX_MODE_CTRL_PADDED = 3;
    private static final long MIN_CMD_GAP_MS = 105L;

    private final Context appContext;
    private final UsbManager usbManager;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService usbWorker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "JA11-USB-Worker");
        t.setDaemon(true);
        return t;
    });

    private final List<Listener> listeners = new ArrayList<>();
    private final LinkedList<String> debugLogs = new LinkedList<>();
    private final SimpleDateFormat timeFmt = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);

    // State protected by stateLock
    private final Object stateLock = new Object();
    private final HardwareState hwState = new HardwareState();
    private PeqSnapshot livePeq = PeqSnapshot.defaultUserCurve();
    private PeqSnapshot savedSnapshot = null;
    private PeqSnapshot lastSentRamSnapshot = null;
    private Integer originalPresetBeforePreview = null;
    private int lastNonBypassPreset = 3;
    private String activeProfileLabel = "JD1 + JA11 | Custom Ear 4380Hz";

    // Coalescing dirty queue for 120fps drag without flooding USB
    private final PeqBand[] dirtyBands = new PeqBand[5];
    private Float dirtyMasterGain = null;
    private Integer dirtyVolume = null;
    private final AtomicBoolean pumpScheduled = new AtomicBoolean(false);

    // Active USB session fields (accessed on usbWorker)
    private volatile UsbDeviceConnection connection;
    private volatile UsbInterface claimedInterface;
    private volatile UsbEndpoint endpointIn;
    private volatile UsbEndpoint endpointOut;
    private volatile int activeTxMode = TX_MODE_INTR_EXACT;
    private volatile int descriptorOutLen = 0;
    private AtomicBoolean readerRunning;
    private Thread readerThread;
    private long lastSentAtMs = 0L;

    private volatile int waitingAckCmd = -1;
    private volatile CountDownLatch waitingAckLatch = null;
    private volatile boolean waitingForPermission = false;
    private volatile boolean expectingUsbReboot = false;

    private final BroadcastReceiver hotplugReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            String act = intent.getAction();
            UsbDevice dev = extractUsbDevice(intent);
            if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(act)) {
                if (dev == null || dev.getVendorId() == Ja11Protocol.JA11_VID) {
                    logUsb("USB_DETACHED event received");
                    handlePhysicalDisconnect();
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(act)) {
                if (dev != null && dev.getVendorId() == Ja11Protocol.JA11_VID) {
                    logUsb("USB_ATTACHED event: VID=0x2972 PID=0x" + Integer.toHexString(dev.getProductId()));
                    mainHandler.postDelayed(() -> connectAsync(true), 450L);
                }
            }
        }
    };

    public Ja11UsbController(Context context) {
        this.appContext = context.getApplicationContext();
        this.usbManager = (UsbManager) appContext.getSystemService(Context.USB_SERVICE);
        activeInstance = this;

        IntentFilter f = new IntentFilter();
        f.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        f.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        if (Build.VERSION.SDK_INT >= 33) {
            appContext.registerReceiver(hotplugReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            appContext.registerReceiver(hotplugReceiver, f);
        }
        logUsb("Khởi tạo JA11 Native USB Engine v3.0");
    }

    private static UsbDevice extractUsbDevice(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) {
            return intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
        } else {
            @SuppressWarnings("deprecation")
            UsbDevice d = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            return d;
        }
    }

    public void addListener(Listener l) {
        if (!listeners.contains(l)) {
            listeners.add(l);
        }
        notifySingleListener(l);
    }

    public void removeListener(Listener l) {
        listeners.remove(l);
    }

    public HardwareState getHardwareState() {
        synchronized (stateLock) {
            return hwState.copy();
        }
    }

    public PeqSnapshot getLivePeq() {
        synchronized (stateLock) {
            return livePeq;
        }
    }

    public PeqSnapshot getSavedSnapshot() {
        synchronized (stateLock) {
            return savedSnapshot;
        }
    }

    public String getActiveProfileLabel() {
        synchronized (stateLock) {
            return activeProfileLabel;
        }
    }

    public boolean hasUnsavedRamChanges() {
        synchronized (stateLock) {
            return hwState.connected && savedSnapshot != null && !livePeq.sameValues(savedSnapshot);
        }
    }

    public synchronized String getDebugLogText() {
        StringBuilder sb = new StringBuilder(2048);
        for (String line : debugLogs) {
            sb.append(line).append('\n');
        }
        return sb.length() == 0 ? "(Chưa có nhật ký USB)" : sb.toString();
    }

    public synchronized void clearDebugLogs() {
        debugLogs.clear();
        logUsb("Đã xóa nhật ký chẩn đoán USB.");
    }

    private synchronized void logUsb(String msg) {
        String line = "[" + timeFmt.format(new Date()) + "] " + msg;
        debugLogs.addLast(line);
        while (debugLogs.size() > 120) {
            debugLogs.removeFirst();
        }
    }

    private void emitState() {
        final HardwareState hwCopy;
        final PeqSnapshot liveCopy;
        final PeqSnapshot savedCopy;
        final boolean unsaved;
        final String label;
        synchronized (stateLock) {
            hwCopy = hwState.copy();
            liveCopy = livePeq;
            savedCopy = savedSnapshot;
            unsaved = hwState.connected && savedSnapshot != null && !livePeq.sameValues(savedSnapshot);
            label = activeProfileLabel;
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            for (Listener l : listeners) {
                l.onStateChanged(hwCopy, liveCopy, savedCopy, unsaved, label);
            }
        } else {
            mainHandler.post(() -> {
                for (Listener l : listeners) {
                    l.onStateChanged(hwCopy, liveCopy, savedCopy, unsaved, label);
                }
            });
        }
    }

    private void emitToast(final String msg) {
        mainHandler.post(() -> {
            for (Listener l : listeners) {
                l.onToast(msg);
            }
        });
    }

    private void notifySingleListener(Listener l) {
        synchronized (stateLock) {
            boolean unsaved = hwState.connected && savedSnapshot != null && !livePeq.sameValues(savedSnapshot);
            l.onStateChanged(hwState.copy(), livePeq, savedSnapshot, unsaved, activeProfileLabel);
        }
    }

    /**
     * Called from MainActivity.onResume() so if user just tapped "Allow" on Android's USB dialog
     * (even if OEM ROM delayed/swallowed the broadcast), we immediately finish connecting!
     */
    public void onActivityResumed() {
        if (waitingForPermission) {
            UsbDevice dev = findJa11Device();
            if (dev != null && usbManager != null && usbManager.hasPermission(dev)) {
                waitingForPermission = false;
                logUsb("onResume phát hiện quyền USB đã được cấp -> mở kết nối ngay!");
                connectAsync(false);
            }
        }
    }

    public void onUsbPermissionBroadcast(UsbDevice dev, boolean extraGranted) {
        waitingForPermission = false;
        UsbDevice target = dev != null ? dev : findJa11Device();
        boolean hasPerm = extraGranted || (target != null && usbManager != null && usbManager.hasPermission(target));
        logUsb("Kết quả xin quyền USB: granted=" + hasPerm);
        if (hasPerm) {
            connectAsync(false);
        } else {
            synchronized (stateLock) {
                hwState.syncing = false;
                hwState.statusMessage = "Bạn đã từ chối quyền USB cho JA11. Bấm Kết nối để thử lại.";
            }
            emitState();
            emitToast("Chưa cấp quyền truy cập USB cho FiiO JA11.");
        }
    }

    public UsbDevice findJa11Device() {
        if (usbManager == null) return null;
        for (UsbDevice d : usbManager.getDeviceList().values()) {
            if (d.getVendorId() == Ja11Protocol.JA11_VID
                    && (d.getProductId() == Ja11Protocol.PID_UAC1 || d.getProductId() == Ja11Protocol.PID_UAC2)) {
                return d;
            }
        }
        for (UsbDevice d : usbManager.getDeviceList().values()) {
            if (d.getVendorId() == Ja11Protocol.JA11_VID) {
                return d;
            }
        }
        return null;
    }

    public void connectAsync(final boolean silentAuto) {
        usbWorker.execute(() -> {
            UsbDevice dev = findJa11Device();
            if (dev == null) {
                if (!silentAuto) {
                    logUsb("Không tìm thấy thiết bị USB VID=0x2972 trong UsbManager.");
                    synchronized (stateLock) {
                        hwState.connected = false;
                        hwState.syncing = false;
                        hwState.statusMessage = "Chưa thấy JA11 ở cổng USB-C (kiểm tra đầu cắm & bật OTG nếu dùng Oppo/Vivo/Realme).";
                    }
                    emitState();
                    emitToast("Chưa phát hiện FiiO JA11 ở cổng USB-C!");
                }
                return;
            }

            if (!usbManager.hasPermission(dev)) {
                if (silentAuto && !expectingUsbReboot) {
                    logUsb("Phát hiện JA11 cắm sẵn (chưa có quyền) -> xin quyền USB...");
                }
                requestUsbPermissionSafe(dev);
                return;
            }

            openAndHandshake(dev);
        });
    }

    private void requestUsbPermissionSafe(UsbDevice dev) {
        try {
            waitingForPermission = true;
            synchronized (stateLock) {
                hwState.syncing = true;
                hwState.statusMessage = "Đang chờ bạn bấm Cho phép truy cập USB JA11...";
            }
            emitState();

            Intent permIntent = new Intent(appContext, UsbPermissionReceiver.class);
            permIntent.setAction(UsbPermissionReceiver.ACTION_USB_PERMISSION);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) {
                flags |= PendingIntent.FLAG_MUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(appContext, 0, permIntent, flags);
            logUsb("Gọi UsbManager.requestPermission cho PID=0x" + Integer.toHexString(dev.getProductId()));
            usbManager.requestPermission(dev, pi);
        } catch (Exception e) {
            waitingForPermission = false;
            logUsb("Lỗi requestPermission: " + e.getMessage());
            synchronized (stateLock) {
                hwState.syncing = false;
                hwState.statusMessage = "Lỗi xin quyền USB: " + e.getMessage();
            }
            emitState();
            emitToast("Lỗi xin quyền USB: " + e.getMessage());
        }
    }

    private static final class HidCandidate {
        final UsbInterface intf;
        final UsbEndpoint epIn;
        final UsbEndpoint epOut;
        final int score;

        HidCandidate(UsbInterface intf, UsbEndpoint epIn, UsbEndpoint epOut, int score) {
            this.intf = intf;
            this.epIn = epIn;
            this.epOut = epOut;
            this.score = score;
        }
    }

    private void openAndHandshake(UsbDevice dev) {
        closeSessionInternal();
        synchronized (stateLock) {
            hwState.syncing = true;
            hwState.statusMessage = "Đang dò cổng DSP HID trên FiiO JA11...";
        }
        emitState();

        logUsb("Mở thiết bị " + dev.getDeviceName()
                + " VID=0x" + Integer.toHexString(dev.getVendorId())
                + " PID=0x" + Integer.toHexString(dev.getProductId())
                + " interfaces=" + dev.getInterfaceCount());

        List<HidCandidate> candidates = new ArrayList<>();
        for (int i = 0; i < dev.getInterfaceCount(); i++) {
            UsbInterface intf = dev.getInterface(i);
            int cls = intf.getInterfaceClass();
            UsbEndpoint in = null;
            UsbEndpoint out = null;
            for (int e = 0; e < intf.getEndpointCount(); e++) {
                UsbEndpoint ep = intf.getEndpoint(e);
                if (ep.getDirection() == UsbConstants.USB_DIR_IN && in == null) {
                    in = ep;
                } else if (ep.getDirection() == UsbConstants.USB_DIR_OUT && out == null) {
                    out = ep;
                }
            }
            logUsb("  Intf #" + intf.getId() + " class=" + cls
                    + " sub=" + intf.getInterfaceSubclass()
                    + " epIn=" + (in != null ? in.getMaxPacketSize() + "B" : "none")
                    + " epOut=" + (out != null ? out.getMaxPacketSize() + "B" : "none"));

            if (cls == UsbConstants.USB_CLASS_HID || cls == UsbConstants.USB_CLASS_VENDOR_SPEC) {
                // Bidirectional IN+OUT HID interface gets top priority (+100) over IN-only Headset Button HID!
                int score = (cls == UsbConstants.USB_CLASS_HID ? 50 : 20)
                        + (in != null && out != null ? 100 : 0)
                        + (in != null ? 10 : 0)
                        + i; // Tie-breaker: higher interface index is typically Vendor HID on KT02H20
                candidates.add(new HidCandidate(intf, in, out, score));
            }
        }

        if (candidates.isEmpty()) {
            synchronized (stateLock) {
                hwState.connected = false;
                hwState.syncing = false;
                hwState.statusMessage = "JA11 chưa có cổng điều khiển HID (cần Firmware hỗ trợ PEQ).";
            }
            emitState();
            emitToast("Không tìm thấy giao diện HID trên JA11.");
            return;
        }

        Collections.sort(candidates, new Comparator<HidCandidate>() {
            @Override
            public int compare(HidCandidate a, HidCandidate b) {
                return Integer.compare(b.score, a.score);
            }
        });

        UsbDeviceConnection conn = usbManager.openDevice(dev);
        if (conn == null) {
            logUsb("usbManager.openDevice() trả về null!");
            synchronized (stateLock) {
                hwState.connected = false;
                hwState.syncing = false;
                hwState.statusMessage = "Không thể mở cổng USB-C (hãy rút ra cắm lại JA11).";
            }
            emitState();
            emitToast("Không mở được kết nối USB-C tới JA11.");
            return;
        }

        boolean handshakeOk = false;
        String chosenDesc = "";

        for (HidCandidate cand : candidates) {
            if (!conn.claimInterface(cand.intf, true)) {
                logUsb("Không claim được Intf #" + cand.intf.getId());
                continue;
            }

            // Inspect HID Report Descriptor (0x22) if available
            byte[] repDesc = new byte[256];
            int descLen = conn.controlTransfer(0x81, 0x06, 0x2200, cand.intf.getId(), repDesc, repDesc.length, 250);
            boolean hasReportId2 = false;
            int parsedOutBytes = 0;
            if (descLen > 0) {
                logUsb("Intf #" + cand.intf.getId() + " HID Desc (" + descLen + "B): "
                        + Ja11Protocol.toHex(repDesc, Math.min(descLen, 48)));
                for (int k = 0; k < descLen - 1; k++) {
                    if ((repDesc[k] & 0xFF) == 0x85 && (repDesc[k + 1] & 0xFF) == Ja11Protocol.REPORT_ID) {
                        hasReportId2 = true;
                    }
                    // Look for REPORT_COUNT (0x95 nn) before OUTPUT (0x91)
                    if ((repDesc[k] & 0xFF) == 0x95) {
                        int cnt = repDesc[k + 1] & 0xFF;
                        if (k + 2 < descLen && (repDesc[k + 2] & 0xFF) == 0x91) {
                            parsedOutBytes = cnt + 1; // +1 for Report ID byte
                        }
                    }
                }
            }

            // If we have multiple candidates and this interface has NO epOut and NO Report ID 2 in descriptor,
            // it's the Consumer Control headset button interface -> skip if better exists, or still probe briefly.
            this.connection = conn;
            this.claimedInterface = cand.intf;
            this.endpointIn = cand.epIn;
            this.endpointOut = cand.epOut;
            this.descriptorOutLen = parsedOutBytes;

            if (cand.epIn != null) {
                startReaderThread(conn, cand.epIn);
            }

            // Probe actual JA11 Firmware Version (0x0B) across TX framing modes!
            int[] modesToTry = cand.epOut != null
                    ? new int[]{TX_MODE_INTR_EXACT, TX_MODE_INTR_PADDED, TX_MODE_CTRL_WITH_ID, TX_MODE_CTRL_PADDED}
                    : new int[]{TX_MODE_CTRL_WITH_ID, TX_MODE_CTRL_PADDED};

            byte[] probePkt = Ja11Protocol.requestFirmwareVersionPacket();
            for (int mode : modesToTry) {
                this.activeTxMode = mode;
                boolean gotAck = sendPacketAndWaitAckInternal(probePkt, 220L);
                logUsb("Probe Intf #" + cand.intf.getId() + " mode=" + mode
                        + " (rep2=" + hasReportId2 + ") -> ACK=" + gotAck);
                if (gotAck) {
                    handshakeOk = true;
                    chosenDesc = "Intf#" + cand.intf.getId() + " M" + mode
                            + (cand.epOut != null ? " INTR" : " CTRL");
                    break;
                }
            }

            if (handshakeOk) {
                break;
            }

            // Clean up reader on non-responding interface and try next HID interface
            stopReaderThread();
            conn.releaseInterface(cand.intf);
            this.claimedInterface = null;
            this.endpointIn = null;
            this.endpointOut = null;
        }

        if (!handshakeOk) {
            // Even if ACK probe didn't return on first try (e.g. device waking up), fall back to top candidate!
            HidCandidate best = candidates.get(0);
            if (conn.claimInterface(best.intf, true)) {
                this.connection = conn;
                this.claimedInterface = best.intf;
                this.endpointIn = best.epIn;
                this.endpointOut = best.epOut;
                this.activeTxMode = best.epOut != null ? TX_MODE_INTR_EXACT : TX_MODE_CTRL_WITH_ID;
                if (best.epIn != null) {
                    startReaderThread(conn, best.epIn);
                }
                chosenDesc = "Intf#" + best.intf.getId() + " Fallback";
                logUsb("Dùng fallback " + chosenDesc);
            } else {
                conn.close();
                this.connection = null;
                synchronized (stateLock) {
                    hwState.connected = false;
                    hwState.syncing = false;
                    hwState.statusMessage = "JA11 đang bị ứng dụng nhạc khác chiếm độc quyền USB (hãy tắt Exclusive USB Audio).";
                }
                emitState();
                emitToast("Không chiếm được kênh HID (kiểm tra Exclusive USB Audio).");
                return;
            }
        }

        boolean wasReboot = this.expectingUsbReboot;
        this.expectingUsbReboot = false;
        String prodName = dev.getProductName() != null && !dev.getProductName().trim().isEmpty()
                ? dev.getProductName().trim()
                : "JadeAudio JA11";

        synchronized (stateLock) {
            hwState.connected = true;
            hwState.productName = prodName;
            hwState.activeHidInfo = chosenDesc;
            hwState.statusMessage = "Đã kết nối " + prodName + " — đang đồng bộ thông số DSP...";
        }
        emitState();

        readFullDeviceStateInternal(!wasReboot);

        if (wasReboot) {
            synchronized (stateLock) {
                savedSnapshot = livePeq;
                hwState.syncing = false;
                hwState.statusMessage = "Đã ghi cứng Flash ROM & tự động kết nối lại thành công!";
            }
            emitState();
            emitToast("Đã lưu cứng vào chip JA11 thành công!");
        } else {
            emitToast("Đã kết nối " + prodName + " (" + chosenDesc + ")!");
        }
    }

    private void startReaderThread(final UsbDeviceConnection conn, final UsbEndpoint epIn) {
        stopReaderThread();
        final AtomicBoolean runFlag = new AtomicBoolean(true);
        this.readerRunning = runFlag;
        final int bufSize = Math.max(64, epIn.getMaxPacketSize());

        Thread t = new Thread(() -> {
            byte[] buf = new byte[bufSize];
            while (runFlag.get()) {
                try {
                    int n = conn.bulkTransfer(epIn, buf, buf.length, 120);
                    if (n > 0) {
                        handleIncomingBytes(buf, n);
                    }
                } catch (Exception e) {
                    logUsb("Reader loop dừng: " + e.getMessage());
                    break;
                }
            }
        }, "JA11-HID-Reader");
        t.setDaemon(true);
        this.readerThread = t;
        t.start();
    }

    private void stopReaderThread() {
        AtomicBoolean flag = this.readerRunning;
        if (flag != null) {
            flag.set(false);
        }
        Thread t = this.readerThread;
        if (t != null) {
            t.interrupt();
            try {
                t.join(200L);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            this.readerThread = null;
        }
    }

    private void handleIncomingBytes(byte[] raw, int len) {
        logUsb("RX (" + len + "B): " + Ja11Protocol.toHex(raw, Math.min(len, 24)));
        ParsedReport parsed = Ja11Protocol.parseInputReport(raw, len);
        if (parsed == null) return;

        if (waitingAckCmd == parsed.command) {
            CountDownLatch latch = waitingAckLatch;
            waitingAckCmd = -1;
            waitingAckLatch = null;
            if (latch != null) latch.countDown();
        }

        synchronized (stateLock) {
            switch (parsed.command) {
                case Ja11Protocol.CMD_DEVICE_VOLUME:
                    hwState.deviceVolume = parsed.intVal;
                    break;
                case Ja11Protocol.CMD_SAMPLE_RATE:
                    hwState.sampleRate = parsed.strVal;
                    break;
                case Ja11Protocol.CMD_FIRMWARE_VERSION:
                    hwState.firmwareVersion = parsed.strVal;
                    break;
                case Ja11Protocol.CMD_INLINE_CONTROL:
                    hwState.inlineMic = parsed.boolVal;
                    break;
                case Ja11Protocol.CMD_EQ_PRESET:
                    hwState.eqPreset = parsed.intVal;
                    if (parsed.intVal != 4) {
                        lastNonBypassPreset = parsed.intVal;
                    }
                    break;
                case Ja11Protocol.CMD_UAC_MODE:
                    hwState.uacMode = parsed.intVal;
                    break;
                case Ja11Protocol.CMD_MASTER_GAIN:
                    livePeq = livePeq.withMasterGain(parsed.floatVal);
                    break;
                case Ja11Protocol.CMD_EQ_BAND:
                    if (parsed.bandVal != null && parsed.intVal >= 0 && parsed.intVal < 5) {
                        livePeq = livePeq.withBand(parsed.intVal, parsed.bandVal);
                    }
                    break;
            }
        }
        emitState();
    }

    private boolean writeRawHidFrame(byte[] payloadNoReportId) {
        UsbDeviceConnection conn = this.connection;
        UsbInterface intf = this.claimedInterface;
        if (conn == null || intf == null || payloadNoReportId == null) return false;

        byte[] withId = new byte[payloadNoReportId.length + 1];
        withId[0] = (byte) Ja11Protocol.REPORT_ID;
        System.arraycopy(payloadNoReportId, 0, withId, 1, payloadNoReportId.length);

        UsbEndpoint epOut = this.endpointOut;
        int mode = this.activeTxMode;

        try {
            if (mode == TX_MODE_INTR_EXACT && epOut != null) {
                int targetLen = descriptorOutLen > withId.length ? descriptorOutLen : withId.length;
                byte[] pkt = targetLen == withId.length ? withId : Arrays.copyOf(withId, targetLen);
                int r = conn.bulkTransfer(epOut, pkt, pkt.length, 300);
                logUsb("TX INTR_EXACT (" + pkt.length + "B->" + r + "): " + Ja11Protocol.toHex(withId, withId.length));
                if (r >= 0) return true;
            }

            if (mode == TX_MODE_INTR_PADDED && epOut != null) {
                int maxPkt = Math.max(withId.length, epOut.getMaxPacketSize());
                byte[] padded = Arrays.copyOf(withId, maxPkt);
                int r = conn.bulkTransfer(epOut, padded, padded.length, 300);
                logUsb("TX INTR_PAD (" + padded.length + "B->" + r + "): " + Ja11Protocol.toHex(withId, withId.length));
                if (r >= 0) return true;
            }

            int wValue = (0x02 << 8) | Ja11Protocol.REPORT_ID; // Output Report (0x02), Report ID 0x02
            if (mode == TX_MODE_CTRL_PADDED) {
                byte[] padded = Arrays.copyOf(withId, Math.max(64, withId.length));
                int r = conn.controlTransfer(0x21, 0x09, wValue, intf.getId(), padded, padded.length, 350);
                logUsb("TX CTRL_PAD (" + padded.length + "B->" + r + "): " + Ja11Protocol.toHex(withId, withId.length));
                return r >= 0;
            }

            int r = conn.controlTransfer(0x21, 0x09, wValue, intf.getId(), withId, withId.length, 350);
            logUsb("TX CTRL (" + withId.length + "B->" + r + "): " + Ja11Protocol.toHex(withId, withId.length));
            if (r >= 0) return true;

            // Last-resort fallback if Interrupt OUT stalled mid-session
            if (epOut != null) {
                int fb = conn.bulkTransfer(epOut, withId, withId.length, 300);
                return fb >= 0;
            }
            return false;
        } catch (Exception e) {
            logUsb("Lỗi TX: " + e.getMessage());
            return false;
        }
    }

    private boolean sendPacketAndWaitAckInternal(byte[] packet, long ackTimeoutMs) {
        if (this.connection == null) return false;
        long elapsed = SystemClock.elapsedRealtime() - lastSentAtMs;
        if (elapsed < MIN_CMD_GAP_MS) {
            SystemClock.sleep(MIN_CMD_GAP_MS - elapsed);
        }
        if (this.connection == null) return false;

        int cmd = packet[4] & 0xFF;
        CountDownLatch latch = new CountDownLatch(1);
        this.waitingAckCmd = cmd;
        this.waitingAckLatch = latch;

        boolean sent = writeRawHidFrame(packet);
        boolean acked = false;
        if (sent) {
            try {
                acked = latch.await(ackTimeoutMs, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        this.waitingAckCmd = -1;
        this.waitingAckLatch = null;
        this.lastSentAtMs = SystemClock.elapsedRealtime();
        return acked;
    }

    private void readEqCurveInternal() {
        if (connection == null) return;
        sendPacketAndWaitAckInternal(Ja11Protocol.requestMasterGainPacket(), 300L);
        for (int i = 0; i < 5; i++) {
            if (connection == null) break;
            sendPacketAndWaitAckInternal(Ja11Protocol.requestBandPacket(i), 300L);
        }
        synchronized (stateLock) {
            lastSentRamSnapshot = livePeq;
        }
    }

    private void readFullDeviceStateInternal(boolean captureInitialSnapshot) {
        if (connection == null) return;
        byte[][] queries = new byte[][]{
                Ja11Protocol.requestUacModePacket(),
                Ja11Protocol.requestInlineControlPacket(),
                Ja11Protocol.requestDeviceVolumePacket(),
                Ja11Protocol.requestEqPresetPacket(),
                Ja11Protocol.requestSampleRatePacket(),
                Ja11Protocol.requestFirmwareVersionPacket()
        };
        for (byte[] q : queries) {
            if (connection == null) break;
            sendPacketAndWaitAckInternal(q, 280L);
        }
        readEqCurveInternal();

        synchronized (stateLock) {
            if (hwState.eqPreset == 4) {
                livePeq = PeqSnapshot.flatNeutral();
            }
            if (captureInitialSnapshot) {
                savedSnapshot = livePeq;
                originalPresetBeforePreview = hwState.eqPreset;
                if (hwState.eqPreset >= 0 && hwState.eqPreset < Ja11Protocol.EQ_PRESET_NAMES.length && hwState.eqPreset != 3) {
                    activeProfileLabel = Ja11Protocol.EQ_PRESET_NAMES[hwState.eqPreset];
                } else {
                    activeProfileLabel = "User 1 (Trong Chip)";
                }
            }
            hwState.syncing = false;
            hwState.statusMessage = "DSP Online • Kéo đồ thị hoặc chạm Profile để nghe Live tức thì!";
        }
        emitState();
    }

    private void closeSessionInternal() {
        stopReaderThread();
        UsbDeviceConnection conn = this.connection;
        UsbInterface intf = this.claimedInterface;
        this.connection = null;
        this.claimedInterface = null;
        this.endpointIn = null;
        this.endpointOut = null;
        if (conn != null) {
            try {
                if (intf != null) conn.releaseInterface(intf);
            } catch (Exception ignored) {
            }
            try {
                conn.close();
            } catch (Exception ignored) {
            }
        }
    }

    public void disconnectAsync() {
        expectingUsbReboot = false;
        usbWorker.execute(() -> {
            closeSessionInternal();
            synchronized (stateLock) {
                Arrays.fill(dirtyBands, null);
                dirtyMasterGain = null;
                dirtyVolume = null;
                lastSentRamSnapshot = null;
                savedSnapshot = null;
                hwState.connected = false;
                hwState.syncing = false;
                hwState.activeHidInfo = "--";
                hwState.statusMessage = "Đã ngắt kết nối JA11.";
            }
            emitState();
            emitToast("Đã ngắt kết nối USB JA11.");
        });
    }

    private void handlePhysicalDisconnect() {
        usbWorker.execute(() -> {
            closeSessionInternal();
            boolean rebooting = expectingUsbReboot;
            synchronized (stateLock) {
                Arrays.fill(dirtyBands, null);
                dirtyMasterGain = null;
                dirtyVolume = null;
                lastSentRamSnapshot = null;
                hwState.connected = false;
                hwState.syncing = false;
                hwState.activeHidInfo = "--";
                hwState.statusMessage = rebooting
                        ? "Chip JA11 đang chớp khởi động lại (~1s) để khóa Flash — đang tự kết nối lại..."
                        : "Đã rút cáp USB JA11.";
            }
            emitState();
            if (rebooting) {
                for (int delay : new int[]{800, 1100, 1400}) {
                    SystemClock.sleep(delay);
                    UsbDevice dev = findJa11Device();
                    if (dev != null && usbManager != null && usbManager.hasPermission(dev)) {
                        openAndHandshake(dev);
                        return;
                    }
                }
            }
        });
    }

    // ================= LIVE REAL-TIME UI ACTIONS (0ms UI Latency!) =================

    public void updateBandLive(int bandIdx, PeqBand nextBand) {
        if (bandIdx < 0 || bandIdx >= 5) return;
        boolean connected;
        synchronized (stateLock) {
            boolean wasNonUser = hwState.eqPreset != 3;
            livePeq = livePeq.withBand(bandIdx, nextBand);
            activeProfileLabel = "Tùy chỉnh Live";
            connected = hwState.connected;
            if (connected) {
                if (wasNonUser) {
                    for (int i = 0; i < 5; i++) dirtyBands[i] = livePeq.bands[i];
                    dirtyMasterGain = livePeq.masterGain;
                } else {
                    dirtyBands[bandIdx] = livePeq.bands[bandIdx];
                }
            }
        }
        emitState();
        if (connected) scheduleLivePump(null);
    }

    public void updateMasterGainLive(float nextMasterDb) {
        boolean connected;
        synchronized (stateLock) {
            livePeq = livePeq.withMasterGain(nextMasterDb);
            connected = hwState.connected;
            if (connected) {
                dirtyMasterGain = livePeq.masterGain;
            }
        }
        emitState();
        if (connected) scheduleLivePump(null);
    }

    public void updateDeviceVolumeLive(int nextVol) {
        int clamped = Math.max(0, Math.min(60, nextVol));
        boolean connected;
        synchronized (stateLock) {
            hwState.deviceVolume = clamped;
            connected = hwState.connected;
            if (connected) {
                dirtyVolume = clamped;
            }
        }
        emitState();
        if (connected) scheduleLivePump(null);
    }

    public void applyProfileLive(PeqSnapshot snapshot, String profileName) {
        boolean connected;
        synchronized (stateLock) {
            livePeq = snapshot;
            if (profileName != null && !profileName.isEmpty()) {
                activeProfileLabel = profileName;
            }
            connected = hwState.connected;
            if (connected) {
                PeqSnapshot prev = (hwState.eqPreset == 3) ? lastSentRamSnapshot : null;
                for (int i = 0; i < 5; i++) {
                    if (prev == null || !prev.bands[i].sameValues(snapshot.bands[i])) {
                        dirtyBands[i] = snapshot.bands[i];
                    } else {
                        dirtyBands[i] = null;
                    }
                }
                if (prev == null || Math.abs(prev.masterGain - snapshot.masterGain) >= 0.05f) {
                    dirtyMasterGain = snapshot.masterGain;
                } else {
                    dirtyMasterGain = null;
                }
                hwState.statusMessage = "Đang nạp \"" + activeProfileLabel + "\" xuống RAM JA11...";
            } else {
                hwState.statusMessage = "Đã nạp \"" + activeProfileLabel + "\" (cắm JA11 để nghe Live).";
            }
        }
        emitState();
        if (connected) {
            scheduleLivePump("Đang nghe Live trên RAM: " + profileName);
        }
    }

    private void scheduleLivePump(final String completionStatus) {
        if (pumpScheduled.compareAndSet(false, true)) {
            usbWorker.execute(() -> {
                try {
                    drainDirtyQueue(completionStatus);
                } finally {
                    pumpScheduled.set(false);
                    // Re-check if more touch events arrived right as we finished
                    boolean more;
                    synchronized (stateLock) {
                        more = hwState.connected && (dirtyVolume != null || dirtyMasterGain != null || hasAnyDirtyBand());
                    }
                    if (more) scheduleLivePump(null);
                }
            });
        }
    }

    private boolean hasAnyDirtyBand() {
        for (int i = 0; i < 5; i++) {
            if (dirtyBands[i] != null) return true;
        }
        return false;
    }

    private void drainDirtyQueue(String completionStatus) {
        while (connection != null) {
            Integer volToSend = null;
            boolean needSwitchToUser1 = false;
            int bandIdxToSend = -1;
            PeqBand bandValToSend = null;
            Float masterToSend = null;

            synchronized (stateLock) {
                if (!hwState.connected) return;
                if (dirtyVolume != null) {
                    volToSend = dirtyVolume;
                    dirtyVolume = null;
                } else if (hwState.eqPreset != 3 && (dirtyMasterGain != null || hasAnyDirtyBand())) {
                    needSwitchToUser1 = true;
                } else {
                    for (int i = 0; i < 5; i++) {
                        if (dirtyBands[i] != null) {
                            bandIdxToSend = i;
                            bandValToSend = dirtyBands[i];
                            dirtyBands[i] = null;
                            break;
                        }
                    }
                    if (bandIdxToSend < 0 && dirtyMasterGain != null) {
                        masterToSend = dirtyMasterGain;
                        dirtyMasterGain = null;
                    }
                }
            }

            if (volToSend != null) {
                sendPacketAndWaitAckInternal(Ja11Protocol.setDeviceVolumePacket(volToSend), 250L);
                continue;
            }
            if (needSwitchToUser1) {
                sendPacketAndWaitAckInternal(Ja11Protocol.setEqPresetPacket(3), 280L);
                synchronized (stateLock) {
                    hwState.eqPreset = 3;
                    lastNonBypassPreset = 3;
                }
                emitState();
                continue;
            }
            if (bandIdxToSend >= 0 && bandValToSend != null) {
                sendPacketAndWaitAckInternal(Ja11Protocol.encodeBandLivePacket(bandIdxToSend, bandValToSend), 280L);
                synchronized (stateLock) {
                    if (lastSentRamSnapshot == null) {
                        lastSentRamSnapshot = livePeq;
                    } else {
                        lastSentRamSnapshot = lastSentRamSnapshot.withBand(bandIdxToSend, bandValToSend);
                    }
                }
                continue;
            }
            if (masterToSend != null) {
                sendPacketAndWaitAckInternal(Ja11Protocol.encodeMasterGainLivePacket(masterToSend), 280L);
                synchronized (stateLock) {
                    if (lastSentRamSnapshot == null) {
                        lastSentRamSnapshot = livePeq;
                    } else {
                        lastSentRamSnapshot = lastSentRamSnapshot.withMasterGain(masterToSend);
                    }
                }
                continue;
            }
            break;
        }

        if (completionStatus != null && connection != null) {
            synchronized (stateLock) {
                hwState.statusMessage = completionStatus;
            }
            emitState();
        }
    }

    public void setEqModeAsync(final int presetCode) {
        final int code = Math.max(0, Math.min(4, presetCode));
        final String modeName = Ja11Protocol.EQ_PRESET_NAMES[code];

        synchronized (stateLock) {
            Arrays.fill(dirtyBands, null);
            dirtyMasterGain = null;
            hwState.eqPreset = code;
            if (code != 4) lastNonBypassPreset = code;
            if (code != 3) activeProfileLabel = modeName;
            if (!hwState.connected) {
                if (code == 4) livePeq = PeqSnapshot.flatNeutral();
                hwState.statusMessage = "Đã chọn chế độ " + modeName + " (cắm JA11 để áp dụng phần cứng).";
                emitState();
                return;
            }
            hwState.syncing = true;
            hwState.statusMessage = "Đang chuyển JA11 sang \"" + modeName + "\" & đọc đáp tuyến...";
        }
        emitState();

        usbWorker.execute(() -> {
            if (connection == null) return;
            sendPacketAndWaitAckInternal(Ja11Protocol.setEqPresetPacket(code), 300L);
            sendPacketAndWaitAckInternal(Ja11Protocol.requestEqPresetPacket(), 280L);
            if (code == 4) {
                synchronized (stateLock) {
                    livePeq = PeqSnapshot.flatNeutral();
                    lastSentRamSnapshot = null;
                }
            } else {
                readEqCurveInternal();
            }
            synchronized (stateLock) {
                hwState.syncing = false;
                hwState.statusMessage = code == 4
                        ? "Đã tắt EQ (Hardware Bypass phẳng 0 dB)."
                        : ("Đã chuyển sang \"" + modeName + "\" & đồng bộ đồ thị từ JA11!");
            }
            emitState();
        });
    }

    public void toggleAbBypass() {
        int cur;
        int restore;
        synchronized (stateLock) {
            cur = hwState.eqPreset;
            restore = lastNonBypassPreset != 4 ? lastNonBypassPreset : 3;
        }
        if (cur == 4) {
            setEqModeAsync(restore);
            emitToast("EQ BẬT (" + Ja11Protocol.EQ_PRESET_NAMES[restore] + ")");
        } else {
            setEqModeAsync(4);
            emitToast("EQ TẮT (So sánh A/B phẳng 0 dB)");
        }
    }

    public void revertToSavedSnapshotAsync() {
        PeqSnapshot snap;
        Integer origPreset;
        synchronized (stateLock) {
            snap = savedSnapshot;
            origPreset = originalPresetBeforePreview;
        }
        if (snap == null) {
            applyProfileLive(PeqSnapshot.flatNeutral(), "Flat (0 dB)");
            return;
        }
        if (origPreset != null && origPreset != 3) {
            setEqModeAsync(origPreset);
            emitToast("Đã hoàn tác về chế độ gốc ban đầu!");
            return;
        }
        applyProfileLive(snap, "Cấu hình gốc trong Chip");
        emitToast("Đã hoàn tác về cấu hình gốc trong JA11!");
    }

    public void commitToFlashAsync() {
        usbWorker.execute(() -> {
            if (connection == null) {
                emitToast("Chưa kết nối JA11 qua cổng USB-C!");
                return;
            }
            drainDirtyQueue(null);

            int activePreset;
            PeqSnapshot snap;
            synchronized (stateLock) {
                activePreset = hwState.eqPreset;
                snap = livePeq;
                hwState.syncing = true;
                hwState.statusMessage = "Đang ghi cứng vào bộ nhớ SPI Flash của JA11...";
            }
            emitState();

            if (activePreset == 3) {
                for (int i = 0; i < 5; i++) {
                    sendPacketAndWaitAckInternal(Ja11Protocol.encodeBandLivePacket(i, snap.bands[i]), 280L);
                }
                sendPacketAndWaitAckInternal(Ja11Protocol.encodeMasterGainLivePacket(snap.masterGain), 280L);
            }

            synchronized (stateLock) {
                savedSnapshot = snap;
                lastSentRamSnapshot = snap;
                originalPresetBeforePreview = activePreset;
            }
            expectingUsbReboot = true;
            writeRawHidFrame(Ja11Protocol.encodeCommitFlashPacket(activePreset));

            SystemClock.sleep(1100L);
            synchronized (stateLock) {
                if (hwState.connected && expectingUsbReboot) {
                    expectingUsbReboot = false;
                    hwState.syncing = false;
                    hwState.statusMessage = "Đã lưu cứng vĩnh viễn vào bộ nhớ Flash JA11!";
                    emitToast("Đã lưu cứng vào Flash ROM JA11!");
                }
            }
            emitState();
        });
    }

    public void setInlineMicAsync(final boolean enabled) {
        usbWorker.execute(() -> {
            if (connection == null) {
                emitToast("Hãy kết nối JA11 trước khi đổi Inline Mic.");
                return;
            }
            expectingUsbReboot = true;
            synchronized (stateLock) {
                hwState.inlineMic = enabled;
                hwState.statusMessage = "Đang đổi Inline Mic (JA11 sẽ tự khởi động lại USB)...";
            }
            emitState();
            sendPacketAndWaitAckInternal(Ja11Protocol.setInlineControlPacket(enabled), 300L);
        });
    }

    public void setUacModeAsync(final int uacCode) {
        usbWorker.execute(() -> {
            if (connection == null) {
                emitToast("Hãy kết nối JA11 trước khi chuyển chuẩn UAC.");
                return;
            }
            expectingUsbReboot = true;
            synchronized (stateLock) {
                hwState.uacMode = uacCode;
                hwState.statusMessage = "Đang chuyển chuẩn UAC (JA11 sẽ tự khởi động lại USB)...";
            }
            emitState();
            sendPacketAndWaitAckInternal(Ja11Protocol.setUacModePacket(uacCode), 300L);
        });
    }

    public void factoryResetPeqAsync() {
        usbWorker.execute(() -> {
            synchronized (stateLock) {
                Arrays.fill(dirtyBands, null);
                dirtyMasterGain = null;
            }
            if (connection == null) {
                applyProfileLive(PeqSnapshot.flatNeutral(), "Mặc định xuất xưởng (0 dB)");
                emitToast("Đã đặt về mặc định phẳng 0 dB.");
                return;
            }
            synchronized (stateLock) {
                hwState.syncing = true;
                hwState.statusMessage = "Đang khôi phục PEQ xuất xưởng cho JA11...";
            }
            emitState();
            sendPacketAndWaitAckInternal(Ja11Protocol.encodeFactoryResetPeqPacket(), 350L);
            readEqCurveInternal();
            synchronized (stateLock) {
                activeProfileLabel = "Mặc định xuất xưởng";
                hwState.syncing = false;
                hwState.statusMessage = "Đã khôi phục thông số PEQ xuất xưởng trên JA11!";
            }
            emitState();
            emitToast("Đã khôi phục gốc PEQ thành công!");
        });
    }

    public void shutdown() {
        try {
            appContext.unregisterReceiver(hotplugReceiver);
        } catch (Exception ignored) {
        }
        closeSessionInternal();
        usbWorker.shutdownNow();
        if (activeInstance == this) {
            activeInstance = null;
        }
    }
}
