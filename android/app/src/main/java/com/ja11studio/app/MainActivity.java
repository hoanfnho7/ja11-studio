package com.ja11studio.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Insets;
import android.hardware.usb.UsbManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.view.DisplayCutout;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.ja11studio.app.core.FiioXmlCodec;
import com.ja11studio.app.core.PeqModels.FilterType;
import com.ja11studio.app.core.PeqModels.HardwareState;
import com.ja11studio.app.core.PeqModels.PeqBand;
import com.ja11studio.app.core.PeqModels.PeqProfile;
import com.ja11studio.app.core.PeqModels.PeqSnapshot;
import com.ja11studio.app.core.PresetRepository;
import com.ja11studio.app.ui.SineGeneratorEngine;
import com.ja11studio.app.ui.TabEqView;
import com.ja11studio.app.ui.TabHardwareView;
import com.ja11studio.app.ui.TabProfilesView;
import com.ja11studio.app.ui.TabSweepView;
import com.ja11studio.app.ui.UiKit;
import com.ja11studio.app.usb.Ja11UsbController;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Pure Native Android MainActivity for JA11 Studio v3.0 (Zero WebView!).
 * Delivers <100ms startup, 120Hz native Canvas/scroll physics, physical camera-cutout/Dynamic Island inset padding,
 * native SAF XML file picker, and non-blocking USB-C OTG HID control.
 */
public class MainActivity extends Activity implements Ja11UsbController.Listener {
    private static final int REQ_IMPORT_PRESET_FILE = 1001;

    private static final String[] TAB_TITLES = {
            "EQ & Âm lượng", "Dò đỉnh tai", "Kho Profile", "Phần cứng"
    };
    private static final String[] TAB_SUBTITLES = {
            "Eq & Volume", "Ear Peak Sweep", "Profiles & Xml", "Hardware & Chip"
    };
    private static final String[] TAB_ICONS = {"🎚", "〰", "📁", "⚙"};

    private Ja11UsbController usbController;
    private PresetRepository presetRepository;
    private SineGeneratorEngine sineEngine;

    private int activeTab = 0;

    // TopBar views
    private TextView topSubtitleTv;
    private TextView connectBtn;
    private TextView disconnectBtn;
    private TextView abBypassBtn;

    // 4 Native Tab Views (kept alive in FrameLayout for 0ms instant switching!)
    private TabEqView tabEqView;
    private TabSweepView tabSweepView;
    private TabProfilesView tabProfilesView;
    private TabHardwareView tabHardwareView;
    private final View[] tabViews = new View[4];
    private final LinearLayout[] bottomNavItems = new LinearLayout[4];
    private final TextView[] bottomNavLabels = new TextView[4];
    private final TextView[] bottomNavIcons = new TextView[4];

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        if (window != null) {
            window.setStatusBarColor(UiKit.C_SURFACE);
            window.setNavigationBarColor(UiKit.C_SURFACE);
            if (Build.VERSION.SDK_INT >= 28) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER;
                window.setAttributes(lp);
            }
        }

        usbController = new Ja11UsbController(this);
        presetRepository = new PresetRepository(this);
        sineEngine = new SineGeneratorEngine();

        LinearLayout rootShell = new LinearLayout(this);
        rootShell.setOrientation(LinearLayout.VERTICAL);
        rootShell.setBackgroundColor(UiKit.C_SURFACE);
        applySafeWindowInsets(rootShell);

        // 1. Persistent TopAppBar
        rootShell.addView(buildTopAppBar(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        // 2. Content Frame holding all 4 Native Screens
        FrameLayout contentFrame = new FrameLayout(this);
        contentFrame.setBackgroundColor(UiKit.C_SURFACE);

        tabEqView = new TabEqView(this, usbController, this::launchImportFilePicker);
        tabEqView.setQuickProfiles(presetRepository.loadVaultProfiles());

        tabSweepView = new TabSweepView(this, sineEngine, new TabSweepView.HostActions() {
            @Override
            public void onActiveSweepChanged(Integer hz) {
                tabEqView.setActiveSweepHz(hz);
            }

            @Override
            public void onAssignPeakToBand4(int hz) {
                PeqBand b4 = new PeqBand(FilterType.PK, hz, -3.8f, 3.20f);
                usbController.updateBandLive(3, b4);
                selectTab(0);
                tabEqView.selectBandAndFocus(3);
                showToast("Đã gán " + hz + " Hz vào Band 4 (-3.8 dB, Q 3.20)!");
            }
        });

        tabProfilesView = new TabProfilesView(this, usbController, presetRepository, new TabProfilesView.HostActions() {
            @Override
            public void onRequestImportXml() {
                launchImportFilePicker();
            }

            @Override
            public void onExportXmlFile(String filename, String xmlContent) {
                exportXmlToDownloads(filename, xmlContent);
            }

            @Override
            public void onVaultUpdated(List<PeqProfile> nextVault) {
                tabEqView.setQuickProfiles(nextVault);
            }

            @Override
            public void showToast(String msg) {
                MainActivity.this.showToast(msg);
            }
        });

        tabHardwareView = new TabHardwareView(this, usbController, this::showToast);

        tabViews[0] = tabEqView;
        tabViews[1] = tabSweepView;
        tabViews[2] = tabProfilesView;
        tabViews[3] = tabHardwareView;

        for (int i = 0; i < 4; i++) {
            contentFrame.addView(tabViews[i], new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            ));
        }

        rootShell.addView(contentFrame, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        // 3. Persistent 4-Tab Bottom Navigation Bar
        rootShell.addView(buildBottomNavBar(), new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        setContentView(rootShell);
        rootShell.requestApplyInsets();

        usbController.addListener(this);
        selectTab(0);

        // Auto-connect if launched via USB OTG plug or if JA11 is already plugged into USB-C!
        handleUsbIntent(getIntent());
        if (usbController.findJa11Device() != null) {
            usbController.connectAsync(true);
        }
    }

    private View buildTopAppBar() {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setBackgroundColor(UiKit.C_SURFACE);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int ph = UiKit.dp(this, 12f);
        int pv = UiKit.dp(this, 8f);
        bar.setPadding(ph, pv, ph, pv);

        // Brand emblem + title
        TextView logoBadge = UiKit.badge(this, "∿", UiKit.C_SURFACE_LOW, UiKit.C_AMBER_CONTAINER);
        logoBadge.setTextSize(16f);
        logoBadge.setPadding(UiKit.dp(this, 8f), UiKit.dp(this, 4f), UiKit.dp(this, 8f), UiKit.dp(this, 4f));

        LinearLayout titleCol = new LinearLayout(this);
        titleCol.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams tcLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tcLp.leftMargin = UiKit.dp(this, 9f);
        titleCol.setLayoutParams(tcLp);

        LinearLayout brandRow = new LinearLayout(this);
        brandRow.setOrientation(LinearLayout.HORIZONTAL);
        brandRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView brandTv = UiKit.label(this, "FiiO JA11", 16f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        TextView dspTag = UiKit.badge(this, "DSP v3", UiKit.C_SURFACE_HIGH, UiKit.C_CYAN_TEXT);
        LinearLayout.LayoutParams dtLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dtLp.leftMargin = UiKit.dp(this, 6f);
        dspTag.setLayoutParams(dtLp);
        brandRow.addView(brandTv);
        brandRow.addView(dspTag);

        topSubtitleTv = UiKit.label(this, TAB_SUBTITLES[0], 10f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO);
        titleCol.addView(brandRow);
        titleCol.addView(topSubtitleTv);

        // Right buttons: Connect/Disconnect + A/B Bypass
        connectBtn = UiKit.actionButton(this, "● Kết nối", UiKit.C_SURFACE_LOW, UiKit.C_AMBER_TEXT, UiKit.C_BORDER, 8f, 11f);
        connectBtn.setMinHeight(UiKit.dp(this, 36f));
        connectBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            usbController.connectAsync(false);
        });

        disconnectBtn = UiKit.actionButton(this, "✕", UiKit.C_SURFACE_LOW, UiKit.C_TEXT_MUTED, UiKit.C_BORDER, 8f, 11f);
        disconnectBtn.setMinHeight(UiKit.dp(this, 36f));
        disconnectBtn.setVisibility(View.GONE);
        LinearLayout.LayoutParams dcLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dcLp.leftMargin = UiKit.dp(this, 4f);
        disconnectBtn.setLayoutParams(dcLp);
        disconnectBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            usbController.disconnectAsync();
        });

        abBypassBtn = UiKit.actionButton(this, "⇄ EQ BẬT", UiKit.C_AMBER_CONTAINER, UiKit.C_ON_AMBER, Color.TRANSPARENT, 8f, 11f);
        abBypassBtn.setMinHeight(UiKit.dp(this, 36f));
        LinearLayout.LayoutParams abLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        abLp.leftMargin = UiKit.dp(this, 6f);
        abBypassBtn.setLayoutParams(abLp);
        abBypassBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            usbController.toggleAbBypass();
        });

        bar.addView(logoBadge);
        bar.addView(titleCol);
        bar.addView(connectBtn);
        bar.addView(disconnectBtn);
        bar.addView(abBypassBtn);

        View divider = new View(this);
        divider.setBackgroundColor(UiKit.C_BORDER);

        wrap.addView(bar);
        wrap.addView(divider, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));
        return wrap;
    }

    private View buildBottomNavBar() {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.setBackgroundColor(UiKit.C_SURFACE);

        View divider = new View(this);
        divider.setBackgroundColor(UiKit.C_BORDER);
        wrap.addView(divider, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        int p6 = UiKit.dp(this, 6f);
        nav.setPadding(p6, UiKit.dp(this, 5f), p6, UiKit.dp(this, 5f));

        for (int i = 0; i < 4; i++) {
            final int tabIdx = i;
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER);
            item.setPadding(UiKit.dp(this, 4f), UiKit.dp(this, 6f), UiKit.dp(this, 4f), UiKit.dp(this, 6f));
            item.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            item.setClickable(true);
            item.setFocusable(true);
            item.setOnClickListener(v -> {
                UiKit.hapticTick(v);
                selectTab(tabIdx);
            });

            TextView ic = UiKit.label(this, TAB_ICONS[i], 14f, UiKit.C_TEXT_MUTED, UiKit.FONT_SANS_BOLD);
            ic.setGravity(Gravity.CENTER);
            TextView lb = UiKit.label(this, TAB_TITLES[i], 10f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO_BOLD);
            lb.setGravity(Gravity.CENTER);
            lb.setSingleLine(true);

            item.addView(ic);
            item.addView(lb);
            bottomNavItems[i] = item;
            bottomNavIcons[i] = ic;
            bottomNavLabels[i] = lb;
            nav.addView(item);
        }

        wrap.addView(nav);
        return wrap;
    }

    private void selectTab(int idx) {
        activeTab = Math.max(0, Math.min(3, idx));
        topSubtitleTv.setText(TAB_SUBTITLES[activeTab]);
        for (int i = 0; i < 4; i++) {
            boolean act = (i == activeTab);
            tabViews[i].setVisibility(act ? View.VISIBLE : View.GONE);
            bottomNavItems[i].setBackground(UiKit.roundedBox(
                    this,
                    act ? UiKit.C_SURFACE_HIGH : Color.TRANSPARENT,
                    9f,
                    Color.TRANSPARENT,
                    0f
            ));
            int col = act ? UiKit.C_AMBER_CONTAINER : UiKit.C_TEXT_MUTED;
            bottomNavIcons[i].setTextColor(col);
            bottomNavLabels[i].setTextColor(col);
        }
        refreshActiveViews();
    }

    private void refreshActiveViews() {
        HardwareState hw = usbController.getHardwareState();
        boolean eqOn = (hw.eqPreset != 4);

        if (hw.connected) {
            connectBtn.setText("● Đã kết nối");
            connectBtn.setTextColor(UiKit.C_CYAN_TEXT);
            disconnectBtn.setVisibility(View.VISIBLE);
        } else {
            connectBtn.setText(hw.syncing ? "⏳ Đang nối..." : "● Kết nối");
            connectBtn.setTextColor(UiKit.C_AMBER_TEXT);
            disconnectBtn.setVisibility(View.GONE);
        }

        abBypassBtn.setText(eqOn ? "⇄ EQ BẬT" : "⇄ EQ TẮT");
        abBypassBtn.setBackground(UiKit.rippleBox(
                this,
                eqOn ? UiKit.C_AMBER_CONTAINER : UiKit.C_SURFACE_HIGH,
                8f,
                eqOn ? Color.TRANSPARENT : UiKit.C_BORDER,
                eqOn ? 0f : 1f,
                Color.argb(45, 255, 255, 255)
        ));
        abBypassBtn.setTextColor(eqOn ? UiKit.C_ON_AMBER : UiKit.C_TEXT_MUTED);

        tabEqView.refreshUiFromController();
        tabProfilesView.refreshFromController();
        tabHardwareView.refreshFromController();
    }

    @Override
    public void onStateChanged(
            HardwareState hw,
            PeqSnapshot livePeq,
            PeqSnapshot savedSnapshot,
            boolean hasUnsavedChanges,
            String activeProfileLabel
    ) {
        refreshActiveViews();
    }

    @Override
    public void onToast(String message) {
        showToast(message);
    }

    private void showToast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    private void applySafeWindowInsets(View root) {
        root.setFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(
                        WindowInsets.Type.statusBars()
                                | WindowInsets.Type.displayCutout()
                                | WindowInsets.Type.navigationBars()
                                | WindowInsets.Type.ime()
                );
                left = bars.left;
                top = bars.top;
                right = bars.right;
                bottom = bars.bottom;
                v.setPadding(left, top, right, bottom);
                return WindowInsets.CONSUMED;
            } else {
                @SuppressWarnings("deprecation")
                int l = insets.getSystemWindowInsetLeft();
                @SuppressWarnings("deprecation")
                int t = insets.getSystemWindowInsetTop();
                @SuppressWarnings("deprecation")
                int r = insets.getSystemWindowInsetRight();
                @SuppressWarnings("deprecation")
                int b = insets.getSystemWindowInsetBottom();
                if (Build.VERSION.SDK_INT >= 28) {
                    DisplayCutout cutout = insets.getDisplayCutout();
                    if (cutout != null) {
                        l = Math.max(l, cutout.getSafeInsetLeft());
                        t = Math.max(t, cutout.getSafeInsetTop());
                        r = Math.max(r, cutout.getSafeInsetRight());
                        b = Math.max(b, cutout.getSafeInsetBottom());
                    }
                }
                v.setPadding(l, t, r, b);
                @SuppressWarnings("deprecation")
                WindowInsets consumed = insets.consumeSystemWindowInsets();
                return consumed;
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleUsbIntent(intent);
    }

    private void handleUsbIntent(Intent intent) {
        if (intent != null && UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(intent.getAction())) {
            usbController.connectAsync(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (usbController != null) {
            usbController.onActivityResumed();
        }
    }

    private void launchImportFilePicker() {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            startActivityForResult(intent, REQ_IMPORT_PRESET_FILE);
        } catch (Exception e) {
            showToast("Không mở được trình chọn file: " + e.getMessage());
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_IMPORT_PRESET_FILE && resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri uri = data.getData();
            try {
                String fileName = queryDisplayName(uri);
                String content = readUriText(uri);
                PeqProfile parsed = FiioXmlCodec.parseAnyFile(content, fileName);
                List<PeqProfile> nextVault = presetRepository.upsertVaultProfile(parsed);
                tabEqView.setQuickProfiles(nextVault);
                tabProfilesView.reloadVaultFromDisk();
                usbController.applyProfileLive(parsed.snapshot, parsed.name);
                showToast("Đã nạp \"" + parsed.name + "\" vào RAM & lưu Kho Offline!");
            } catch (Exception e) {
                showToast("Lỗi đọc file Preset: " + e.getMessage());
            }
        }
    }

    private String queryDisplayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return c.getString(idx);
            }
        } catch (Exception ignored) {
        }
        return "Imported_Preset.xml";
    }

    private String readUriText(Uri uri) throws Exception {
        try (InputStream is = getContentResolver().openInputStream(uri);
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            if (is == null) throw new IllegalStateException("Không mở được luồng đọc tệp.");
            byte[] buf = new byte[4096];
            int r;
            while ((r = is.read(buf)) != -1) baos.write(buf, 0, r);
            return baos.toString("UTF-8");
        }
    }

    private void exportXmlToDownloads(String filename, String xmlContent) {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/xml");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/JA11Studio");
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os != null) {
                            os.write(xmlContent.getBytes(StandardCharsets.UTF_8));
                        }
                    }
                    showToast("Đã lưu tại Download/JA11Studio/" + filename);
                    return;
                }
            }
            showToast("Không thể ghi tệp vào thư mục Download.");
        } catch (Exception e) {
            showToast("Lỗi xuất file XML: " + e.getMessage());
        }
    }

    @Override
    protected void onDestroy() {
        if (sineEngine != null) {
            sineEngine.stopAll();
        }
        if (usbController != null) {
            usbController.removeListener(this);
            usbController.shutdown();
        }
        super.onDestroy();
    }
}
