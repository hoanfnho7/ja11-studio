package com.ja11studio.app.ui;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.ja11studio.app.core.Ja11Protocol;
import com.ja11studio.app.core.PeqModels.HardwareState;
import com.ja11studio.app.core.PeqModels.PeqSnapshot;
import com.ja11studio.app.usb.Ja11UsbController;

/**
 * Tab 4 (Native): Phần cứng & Chip DAC — Sticky Curve Monitor, Chip Telemetry, 5 NVRAM Modes, Mic/UAC, USB Hex Log.
 */
public final class TabHardwareView extends LinearLayout {
    public interface HostActions {
        void showToast(String msg);
    }

    private static final int[] MODE_CODES = {3, 0, 2, 1, 4};
    private static final String[] MODE_BADGES = {"U1", "VC", "BS", "CL", "BY"};
    private static final String[] MODE_TITLES = {"User 1", "Vocal", "Bass Boost", "Classic", "Tắt EQ (Hardware Bypass)"};
    private static final String[] MODE_DESCS = {
            "Bộ nhớ PEQ 5-Band tùy chỉnh riêng",
            "Tôn giọng hát ca sĩ rõ nét",
            "Tăng lực dải trầm sôi động",
            "Cân bằng nhạc cụ cổ điển",
            "Xuất âm mộc phẳng 0 dB"
    };

    private final Ja11UsbController controller;
    private final HostActions hostActions;
    private boolean showMiniGraph = true;

    // Sticky top graph
    private TextView stickyModeTv;
    private TextView toggleGraphBtn;
    private PeqGraphView miniGraph;

    // Hardware card telemetry
    private final TextView connStatusTv;
    private final TextView prodSubtitleTv;
    private final TextView fwValTv;
    private final TextView nvramValTv;
    private final TextView srValTv;
    private final TextView uacValTv;
    private final TextView hidPipeTv;

    // NVRAM mode rows
    private final LinearLayout[] modeRows = new LinearLayout[5];
    private final TextView[] modeBadgeViews = new TextView[5];
    private final TextView[] modeRunningTags = new TextView[5];
    private final LinearLayout flashCommitBox;
    private final TextView revertBtn;
    private final TextView commitFlashBtn;

    // Switches
    private final TextView micToggleBtn;
    private final TextView uac2Btn;
    private final TextView uac1Btn;

    public TabHardwareView(Context ctx, Ja11UsbController controller, HostActions hostActions) {
        super(ctx);
        this.controller = controller;
        this.hostActions = hostActions;
        setOrientation(VERTICAL);

        int padH = UiKit.dp(ctx, 12f);

        // 1. Pinned Top Mini-Graph (Watch hardware preset curves change live!)
        LinearLayout pinnedWrap = new LinearLayout(ctx);
        pinnedWrap.setOrientation(VERTICAL);
        pinnedWrap.setPadding(padH, UiKit.dp(ctx, 8f), padH, UiKit.dp(ctx, 8f));
        pinnedWrap.setBackgroundColor(UiKit.C_SURFACE);

        LinearLayout pinnedCard = UiKit.cardContainer(ctx, 9f);
        LinearLayout pHdr = new LinearLayout(ctx);
        pHdr.setOrientation(HORIZONTAL);
        pHdr.setGravity(Gravity.CENTER_VERTICAL);

        stickyModeTv = UiKit.label(ctx, "● Đáp tuyến Chip: User 1", 11f, UiKit.C_CYAN_TEXT, UiKit.FONT_MONO_BOLD);
        stickyModeTv.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        toggleGraphBtn = UiKit.actionButton(ctx, "Thu gọn", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_MUTED, Color.TRANSPARENT, 6f, 9.5f);
        toggleGraphBtn.setMinHeight(UiKit.dp(ctx, 26f));
        toggleGraphBtn.setPadding(UiKit.dp(ctx, 8f), UiKit.dp(ctx, 2f), UiKit.dp(ctx, 8f), UiKit.dp(ctx, 2f));
        toggleGraphBtn.setOnClickListener(v -> {
            showMiniGraph = !showMiniGraph;
            miniGraph.setVisibility(showMiniGraph ? VISIBLE : GONE);
            toggleGraphBtn.setText(showMiniGraph ? "Thu gọn" : "Hiện đồ thị");
        });

        pHdr.addView(stickyModeTv);
        pHdr.addView(toggleGraphBtn);
        pinnedCard.addView(pHdr, UiKit.matchWrapBottomMargin(ctx, 6f));

        miniGraph = new PeqGraphView(ctx, true);
        pinnedCard.addView(miniGraph);
        pinnedWrap.addView(pinnedCard);
        addView(pinnedWrap, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // 2. Scrollable Hardware Controls
        ScrollView scroll = new ScrollView(ctx);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body = new LinearLayout(ctx);
        body.setOrientation(VERTICAL);
        body.setPadding(padH, UiKit.dp(ctx, 4f), padH, UiKit.dp(ctx, 24f));
        scroll.addView(body, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        addView(scroll, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Card A: Hardware & Chipset Status
        LinearLayout chipCard = UiKit.cardContainer(ctx, 12f);

        LinearLayout cTop = new LinearLayout(ctx);
        cTop.setOrientation(HORIZONTAL);
        cTop.setGravity(Gravity.CENTER_VERTICAL);
        connStatusTv = UiKit.label(ctx, "● CHƯA KẾT NỐI USB-C JA11", 10.5f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO_BOLD);
        connStatusTv.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView logBtn = UiKit.actionButton(ctx, "📋 Nhật ký USB (Hex)", UiKit.C_SURFACE_HIGH, UiKit.C_CYAN_TEXT, Color.TRANSPARENT, 7f, 9.5f);
        logBtn.setMinHeight(UiKit.dp(ctx, 28f));
        logBtn.setPadding(UiKit.dp(ctx, 8f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 8f), UiKit.dp(ctx, 3f));
        logBtn.setOnClickListener(v -> showUsbHexLogDialog(ctx));
        cTop.addView(connStatusTv);
        cTop.addView(logBtn);
        chipCard.addView(cTop, UiKit.matchWrapBottomMargin(ctx, 6f));

        TextView dspTitle = UiKit.label(ctx, "FiiO Custom DSP (KT02H20)", 18f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        prodSubtitleTv = UiKit.label(ctx, "Bộ giải mã tích hợp DAC & PEQ rời 5-Band", 12f, UiKit.C_TEXT_MUTED, UiKit.FONT_SANS);
        chipCard.addView(dspTitle);
        chipCard.addView(prodSubtitleTv, UiKit.matchWrapBottomMargin(ctx, 8f));

        // 2x2 Telemetry Grid
        LinearLayout gridRow1 = new LinearLayout(ctx);
        gridRow1.setOrientation(HORIZONTAL);
        fwValTv = addTelemetryTile(ctx, gridRow1, "VI MÃ (FIRMWARE)", "KT02H20", true);
        nvramValTv = addTelemetryTile(ctx, gridRow1, "TRẠNG THÁI BỘ NHỚ", "Đồng bộ", false);
        chipCard.addView(gridRow1, UiKit.matchWrapBottomMargin(ctx, 6f));

        LinearLayout gridRow2 = new LinearLayout(ctx);
        gridRow2.setOrientation(HORIZONTAL);
        srValTv = addTelemetryTile(ctx, gridRow2, "BĂNG THÔNG TỐI ĐA", "384kHz / 32b", true);
        uacValTv = addTelemetryTile(ctx, gridRow2, "GIAO THỨC ÂM THANH", "UAC 2.0", false);
        chipCard.addView(gridRow2, UiKit.matchWrapBottomMargin(ctx, 6f));

        hidPipeTv = UiKit.label(ctx, "Kênh điều khiển HID: --", 10f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO);
        chipCard.addView(hidPipeTv);
        body.addView(chipCard, UiKit.matchWrapBottomMargin(ctx, 10f));

        // Card B: Hardware NVRAM Preset Selector
        LinearLayout nvCard = UiKit.cardContainer(ctx, 12f);
        LinearLayout nvHdr = new LinearLayout(ctx);
        nvHdr.setOrientation(HORIZONTAL);
        nvHdr.setGravity(Gravity.CENTER_VERTICAL);
        TextView nvTitle = UiKit.label(ctx, "💾 Bộ nhớ Flash phần cứng", 14.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        nvTitle.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        nvHdr.addView(nvTitle);
        nvHdr.addView(UiKit.badge(ctx, "NVRAM 0x16", UiKit.C_SURFACE_CONTAINER, UiKit.C_TEXT_MUTED));
        nvCard.addView(nvHdr, UiKit.matchWrapBottomMargin(ctx, 8f));

        for (int i = 0; i < 5; i++) {
            final int code = MODE_CODES[i];
            LinearLayout row = new LinearLayout(ctx);
            row.setOrientation(HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            int p10 = UiKit.dp(ctx, 10f);
            row.setPadding(p10, p10, p10, p10);
            row.setClickable(true);
            row.setFocusable(true);
            row.setOnClickListener(v -> {
                UiKit.hapticTap(v);
                controller.setEqModeAsync(code);
            });

            TextView badge = UiKit.badge(ctx, MODE_BADGES[i], UiKit.C_SURFACE_HIGHEST, UiKit.C_TEXT_MUTED);
            badge.setMinWidth(UiKit.dp(ctx, 30f));
            modeBadgeViews[i] = badge;

            LinearLayout col = new LinearLayout(ctx);
            col.setOrientation(VERTICAL);
            LayoutParams cLp = new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            cLp.leftMargin = UiKit.dp(ctx, 10f);
            col.setLayoutParams(cLp);

            LinearLayout tLine = new LinearLayout(ctx);
            tLine.setOrientation(HORIZONTAL);
            tLine.setGravity(Gravity.CENTER_VERTICAL);
            TextView mTitle = UiKit.label(ctx, MODE_TITLES[i], 12.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO_BOLD);
            TextView runTag = UiKit.badge(ctx, "Đang chạy", UiKit.C_AMBER_TEXT, UiKit.C_ON_AMBER);
            LayoutParams rtLp = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            rtLp.leftMargin = UiKit.dp(ctx, 6f);
            runTag.setLayoutParams(rtLp);
            modeRunningTags[i] = runTag;

            tLine.addView(mTitle);
            tLine.addView(runTag);
            col.addView(tLine);
            col.addView(UiKit.label(ctx, MODE_DESCS[i], 11f, UiKit.C_TEXT_MUTED, UiKit.FONT_SANS));

            row.addView(badge);
            row.addView(col);
            modeRows[i] = row;
            nvCard.addView(row, UiKit.matchWrapBottomMargin(ctx, 6f));
        }

        // Flash Commit Box
        flashCommitBox = new LinearLayout(ctx);
        flashCommitBox.setOrientation(VERTICAL);
        flashCommitBox.setPadding(0, UiKit.dp(ctx, 6f), 0, 0);

        LinearLayout fcRow = new LinearLayout(ctx);
        fcRow.setOrientation(HORIZONTAL);
        revertBtn = UiKit.actionButton(ctx, "↺ Hoàn tác", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_PRIMARY, Color.TRANSPARENT, 8f, 10.5f);
        LayoutParams rvLp = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rvLp.rightMargin = UiKit.dp(ctx, 6f);
        revertBtn.setLayoutParams(rvLp);
        revertBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            controller.revertToSavedSnapshotAsync();
        });

        commitFlashBtn = UiKit.actionButton(ctx, "💾 LƯU CỨNG VÀO FLASH ROM", UiKit.C_AMBER_CONTAINER, UiKit.C_ON_AMBER, Color.TRANSPARENT, 8f, 11f);
        commitFlashBtn.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        commitFlashBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            controller.commitToFlashAsync();
        });

        fcRow.addView(revertBtn);
        fcRow.addView(commitFlashBtn);
        flashCommitBox.addView(fcRow, UiKit.matchWrapBottomMargin(ctx, 4f));
        flashCommitBox.addView(UiKit.label(
                ctx,
                "Lưu ý: Lệnh ghi SPI Flash (0x19) làm JA11 chớp khởi động lại USB ~1 giây và app sẽ tự nối lại.",
                10f,
                UiKit.C_TEXT_MUTED,
                UiKit.FONT_MONO
        ));
        nvCard.addView(flashCommitBox);
        body.addView(nvCard, UiKit.matchWrapBottomMargin(ctx, 10f));

        // Card C: I/O Config (Inline Mic & UAC 1.0 / 2.0)
        LinearLayout ioCard = UiKit.cardContainer(ctx, 12f);
        ioCard.addView(UiKit.label(ctx, "🎛 Giao thức & Đàm thoại (I/O Config)", 14.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD),
                UiKit.matchWrapBottomMargin(ctx, 8f));

        LinearLayout micBox = new LinearLayout(ctx);
        micBox.setOrientation(HORIZONTAL);
        micBox.setGravity(Gravity.CENTER_VERTICAL);
        int p10 = UiKit.dp(ctx, 10f);
        micBox.setPadding(p10, p10, p10, p10);
        micBox.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_CONTAINER, 9f, Color.TRANSPARENT, 0f));

        LinearLayout micCol = new LinearLayout(ctx);
        micCol.setOrientation(VERTICAL);
        micCol.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        micCol.addView(UiKit.label(ctx, "🎙 Inline Mic (3.5mm CTIA)", 12.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO_BOLD));
        micCol.addView(UiKit.label(ctx, "Tắt nếu dùng IEM thuần nghe nhạc để giảm nhiễu nền", 11f, UiKit.C_TEXT_MUTED, UiKit.FONT_SANS));

        micToggleBtn = UiKit.actionButton(ctx, "ĐANG BẬT", UiKit.C_AMBER_CONTAINER, UiKit.C_ON_AMBER, Color.TRANSPARENT, 16f, 10.5f);
        micToggleBtn.setMinHeight(UiKit.dp(ctx, 34f));
        micToggleBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            HardwareState hw = controller.getHardwareState();
            controller.setInlineMicAsync(!hw.inlineMic);
        });

        micBox.addView(micCol);
        micBox.addView(micToggleBtn);
        ioCard.addView(micBox, UiKit.matchWrapBottomMargin(ctx, 8f));

        LinearLayout uacBox = new LinearLayout(ctx);
        uacBox.setOrientation(VERTICAL);
        uacBox.setPadding(p10, p10, p10, p10);
        uacBox.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_CONTAINER, 9f, Color.TRANSPARENT, 0f));
        uacBox.addView(UiKit.label(ctx, "🔌 Chuẩn USB Audio (UAC)", 12.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO_BOLD),
                UiKit.matchWrapBottomMargin(ctx, 6f));

        LinearLayout uacRow = new LinearLayout(ctx);
        uacRow.setOrientation(HORIZONTAL);
        uac2Btn = UiKit.actionButton(ctx, "✦ UAC 2.0 (384kHz)", UiKit.C_SURFACE_LOWEST, UiKit.C_CYAN_TEXT, UiKit.C_CYAN_CONTAINER, 8f, 10.5f);
        LayoutParams u2Lp = new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        u2Lp.rightMargin = UiKit.dp(ctx, 6f);
        uac2Btn.setLayoutParams(u2Lp);
        uac2Btn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            controller.setUacModeAsync(1);
        });

        uac1Btn = UiKit.actionButton(ctx, "🎮 UAC 1.0 (PS5/Switch)", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_MUTED, Color.TRANSPARENT, 8f, 10.5f);
        uac1Btn.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        uac1Btn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            controller.setUacModeAsync(0);
        });

        uacRow.addView(uac2Btn);
        uacRow.addView(uac1Btn);
        uacBox.addView(uacRow);
        ioCard.addView(uacBox);
        body.addView(ioCard, UiKit.matchWrapBottomMargin(ctx, 12f));

        // Factory Reset Button
        TextView resetBtn = UiKit.actionButton(
                ctx,
                "↺ Khôi phục vi mã xuất xưởng (Factory Reset)",
                UiKit.C_SURFACE_LOW,
                UiKit.C_ERROR,
                UiKit.C_BORDER,
                10f,
                11f
        );
        resetBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            confirmFactoryReset(ctx);
        });
        body.addView(resetBtn, UiKit.matchWrapBottomMargin(ctx, 8f));

        TextView footNote = UiKit.label(
                ctx,
                "FiiO JA11 USB-C Portable DAC • Pure Native Android Studio v3.0",
                9.5f,
                UiKit.C_OUTLINE,
                UiKit.FONT_MONO
        );
        footNote.setGravity(Gravity.CENTER_HORIZONTAL);
        body.addView(footNote);
    }

    private static TextView addTelemetryTile(Context ctx, LinearLayout row, String label, String val, boolean rightMargin) {
        LinearLayout tile = new LinearLayout(ctx);
        tile.setOrientation(VERTICAL);
        int p9 = UiKit.dp(ctx, 9f);
        tile.setPadding(p9, p9, p9, p9);
        tile.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_CONTAINER, 8f, Color.TRANSPARENT, 0f));
        LayoutParams lp = new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        if (rightMargin) lp.rightMargin = UiKit.dp(ctx, 6f);
        tile.setLayoutParams(lp);

        tile.addView(UiKit.label(ctx, label, 9f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO));
        TextView vTv = UiKit.label(ctx, val, 12.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO_BOLD);
        tile.addView(vTv);
        row.addView(tile);
        return vTv;
    }

    public void refreshFromController() {
        Context ctx = getContext();
        HardwareState hw = controller.getHardwareState();
        PeqSnapshot live = controller.getLivePeq();
        PeqSnapshot saved = controller.getSavedSnapshot();
        boolean unsaved = controller.hasUnsavedRamChanges();
        boolean bypassed = (hw.eqPreset == 4);
        String modeName = (hw.eqPreset >= 0 && hw.eqPreset < Ja11Protocol.EQ_PRESET_NAMES.length)
                ? Ja11Protocol.EQ_PRESET_NAMES[hw.eqPreset]
                : "User 1";

        stickyModeTv.setText("● Đáp tuyến Chip: " + modeName);
        miniGraph.updateState(live, saved, 3, bypassed, null);

        connStatusTv.setText(hw.connected ? "● DSP ACTIVE • TRỰC TIẾP PHẦN CỨNG" : "● CHƯA KẾT NỐI USB-C JA11");
        connStatusTv.setTextColor(hw.connected ? UiKit.C_GREEN : UiKit.C_TEXT_MUTED);
        prodSubtitleTv.setText(hw.connected
                ? (hw.productName + " • Kết nối OTG trực tiếp")
                : "Bộ giải mã tích hợp DAC & PEQ rời 5-Band");

        fwValTv.setText(hw.connected && !"--".equals(hw.firmwareVersion) ? hw.firmwareVersion : "KT02H20");
        nvramValTv.setText(unsaved ? "RAM Tạm (Chưa lưu)" : "Đồng bộ Flash");
        nvramValTv.setTextColor(unsaved ? UiKit.C_AMBER_TEXT : UiKit.C_GREEN);
        srValTv.setText(hw.connected && !"--".equals(hw.sampleRate) ? hw.sampleRate : "384kHz / 32b");
        uacValTv.setText(hw.uacMode == 0 ? "UAC 1.0" : "UAC 2.0");
        uacValTv.setTextColor(UiKit.C_CYAN_TEXT);
        hidPipeTv.setText("Kênh điều khiển HID: " + hw.activeHidInfo);

        for (int i = 0; i < 5; i++) {
            boolean act = (hw.eqPreset == MODE_CODES[i]);
            modeRows[i].setBackground(UiKit.rippleBox(
                    ctx,
                    act ? UiKit.C_SURFACE_HIGH : UiKit.C_SURFACE_CONTAINER,
                    9f,
                    act ? UiKit.C_AMBER_CONTAINER : Color.TRANSPARENT,
                    act ? 1.2f : 0f,
                    Color.argb(40, 255, 255, 255)
            ));
            modeBadgeViews[i].setBackground(UiKit.roundedBox(
                    ctx,
                    act ? UiKit.C_AMBER_CONTAINER : UiKit.C_SURFACE_HIGHEST,
                    5f,
                    Color.TRANSPARENT,
                    0f
            ));
            modeBadgeViews[i].setTextColor(act ? UiKit.C_ON_AMBER : UiKit.C_TEXT_MUTED);
            modeRunningTags[i].setVisibility(act ? VISIBLE : GONE);
        }

        flashCommitBox.setVisibility(hw.connected ? VISIBLE : GONE);
        revertBtn.setVisibility(unsaved ? VISIBLE : GONE);
        commitFlashBtn.setText("💾 LƯU CỨNG " + modeName.toUpperCase() + " VÀO FLASH");

        micToggleBtn.setText(hw.inlineMic ? "ĐANG BẬT" : "ĐÃ TẮT");
        micToggleBtn.setBackground(UiKit.roundedBox(
                ctx,
                hw.inlineMic ? UiKit.C_AMBER_CONTAINER : UiKit.C_SURFACE_HIGHEST,
                16f,
                Color.TRANSPARENT,
                0f
        ));
        micToggleBtn.setTextColor(hw.inlineMic ? UiKit.C_ON_AMBER : UiKit.C_TEXT_MUTED);

        boolean isUac2 = (hw.uacMode != 0);
        uac2Btn.setBackground(UiKit.roundedBox(ctx, isUac2 ? UiKit.C_SURFACE_LOWEST : UiKit.C_SURFACE_HIGH, 8f,
                isUac2 ? UiKit.C_CYAN_CONTAINER : Color.TRANSPARENT, isUac2 ? 1f : 0f));
        uac2Btn.setTextColor(isUac2 ? UiKit.C_CYAN_TEXT : UiKit.C_TEXT_MUTED);

        uac1Btn.setBackground(UiKit.roundedBox(ctx, !isUac2 ? UiKit.C_SURFACE_LOWEST : UiKit.C_SURFACE_HIGH, 8f,
                !isUac2 ? UiKit.C_AMBER_CONTAINER : Color.TRANSPARENT, !isUac2 ? 1f : 0f));
        uac1Btn.setTextColor(!isUac2 ? UiKit.C_AMBER_TEXT : UiKit.C_TEXT_MUTED);
    }

    private void showUsbHexLogDialog(final Context ctx) {
        final String logs = controller.getDebugLogText();
        ScrollView sv = new ScrollView(ctx);
        TextView tv = UiKit.label(ctx, logs, 10.5f, UiKit.C_CYAN_TEXT, UiKit.FONT_MONO);
        int p12 = UiKit.dp(ctx, 12f);
        tv.setPadding(p12, p12, p12, p12);
        tv.setBackgroundColor(UiKit.C_SURFACE_LOWEST);
        tv.setTextIsSelectable(true);
        sv.addView(tv);

        new AlertDialog.Builder(ctx, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Nhật ký Gói tin USB-C HID (TX / RX)")
                .setView(sv)
                .setPositiveButton("Sao chép Log", (d, w) -> {
                    ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) {
                        cm.setPrimaryClip(ClipData.newPlainText("JA11 USB Log", logs));
                        hostActions.showToast("Đã sao chép nhật ký USB vào bộ nhớ đệm!");
                    }
                })
                .setNeutralButton("Xóa Log", (d, w) -> controller.clearDebugLogs())
                .setNegativeButton("Đóng", null)
                .show();
    }

    private void confirmFactoryReset(Context ctx) {
        new AlertDialog.Builder(ctx, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Khôi phục gốc chip JA11?")
                .setMessage("Thao tác này sẽ đặt 5 băng tần EQ trên JA11 về mặc định xuất xưởng (0 dB). Kho Profile Offline của bạn vẫn được giữ nguyên.")
                .setPositiveButton("Khôi phục gốc", (d, w) -> controller.factoryResetPeqAsync())
                .setNegativeButton("Hủy", null)
                .show();
    }
}
