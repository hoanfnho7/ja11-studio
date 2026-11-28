package com.ja11studio.app.ui;

import android.app.AlertDialog;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import com.ja11studio.app.core.BiquadMath;
import com.ja11studio.app.core.BiquadMath.HeadroomResult;
import com.ja11studio.app.core.I18n;
import com.ja11studio.app.core.PeqModels.FilterType;
import com.ja11studio.app.core.PeqModels.HardwareState;
import com.ja11studio.app.core.PeqModels.PeqBand;
import com.ja11studio.app.core.PeqModels.PeqProfile;
import com.ja11studio.app.core.PeqModels.PeqSnapshot;
import com.ja11studio.app.usb.Ja11UsbController;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Tab 1 (Native): EQ & Volume — 120Hz Interactive Graph, Quick Preset Rail, Output Stage, 5 Band Cards.
 */
public final class TabEqView extends ScrollView {
    public interface HostActions {
        void onRequestImportXml();
        void onSaveChipCurveToVault(PeqSnapshot snapshot);
    }

    private static String bandName(int idx) {
        switch (idx) {
            case 0: return I18n.tr("Bass Nền", "Sub-Bass");
            case 1: return I18n.tr("Trung Trầm", "Low-Mid");
            case 2: return I18n.tr("Giọng Hát", "Vocal");
            case 3: return I18n.tr("Cắt Chói Tai", "Ear Peak");
            default: return I18n.tr("Âm Trường Cao", "Treble Air");
        }
    }

    private final Ja11UsbController controller;
    private final HostActions hostActions;

    private int selectedBand = 3;
    private Integer activeSweepHz = null;
    private boolean suppressSeekCallbacks = false;

    // Telemetry views
    private final TextView statusDot;
    private final TextView statusTitle;
    private final TextView sampleRateBadge;
    private final TextView fwBadge;
    private final TextView uacBadge;

    // Graph section
    private final TextView activeProfileTv;
    private final TextView saveFromChipBtn;
    private final TextView revertBtn;
    private final PeqGraphView graphView;
    private final TextView selectedBandReadout;
    private final LinearLayout quickChipsRow;
    private List<PeqProfile> quickProfiles = new ArrayList<>();

    // Output stage
    private final TextView volValueTv;
    private final SeekBar volSeek;
    private final TextView volWarnTv;
    private final TextView preampAutoBtn;
    private final TextView preampValueTv;
    private final SeekBar preampSeek;
    private final TextView headroomTv;

    // 5 Band Card holders
    private final BandCardHolder[] bandCards = new BandCardHolder[5];

    // Footer strip
    private final TextView footerMsgTv;
    private final TextView saveChipBtn;

    public TabEqView(Context ctx, Ja11UsbController controller, HostActions hostActions) {
        super(ctx);
        this.controller = controller;
        this.hostActions = hostActions;
        setFillViewport(true);
        setVerticalScrollBarEnabled(false);

        LinearLayout root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        int padH = UiKit.dp(ctx, 12f);
        root.setPadding(padH, UiKit.dp(ctx, 10f), padH, UiKit.dp(ctx, 24f));
        addView(root, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // 1. Status & Format Telemetry Strip
        LinearLayout teleBar = new LinearLayout(ctx);
        teleBar.setOrientation(LinearLayout.HORIZONTAL);
        teleBar.setGravity(Gravity.CENTER_VERTICAL);
        teleBar.setPadding(UiKit.dp(ctx, 10f), UiKit.dp(ctx, 7f), UiKit.dp(ctx, 10f), UiKit.dp(ctx, 7f));
        teleBar.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_LOW, 10f, UiKit.C_BORDER, 0.8f));

        statusDot = UiKit.label(ctx, "●", 11f, UiKit.C_OUTLINE, UiKit.FONT_MONO_BOLD);
        statusTitle = UiKit.label(ctx, I18n.tr("CHẾ ĐỘ OFFLINE", "OFFLINE MODE"), 10.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO_BOLD);
        LinearLayout.LayoutParams stLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        stLp.leftMargin = UiKit.dp(ctx, 6f);
        statusTitle.setLayoutParams(stLp);
        statusTitle.setSingleLine(true);

        sampleRateBadge = UiKit.badge(ctx, "384kHz", UiKit.C_SURFACE_HIGHEST, UiKit.C_CYAN_TEXT);
        fwBadge = UiKit.badge(ctx, "32-BIT", UiKit.C_SURFACE_HIGHEST, UiKit.C_AMBER_TEXT);
        LinearLayout.LayoutParams fwLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        fwLp.leftMargin = UiKit.dp(ctx, 4f);
        fwBadge.setLayoutParams(fwLp);

        uacBadge = UiKit.badge(ctx, "UAC 2.0", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_MUTED);
        LinearLayout.LayoutParams uacLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        uacLp.leftMargin = UiKit.dp(ctx, 4f);
        uacBadge.setLayoutParams(uacLp);

        teleBar.addView(statusDot);
        teleBar.addView(statusTitle);
        teleBar.addView(sampleRateBadge);
        teleBar.addView(fwBadge);
        teleBar.addView(uacBadge);
        root.addView(teleBar, UiKit.matchWrapBottomMargin(ctx, 10f));

        // 2. Interactive PEQ Graph + Quick Preset Rail
        LinearLayout graphCard = UiKit.cardContainer(ctx, 11f);

        LinearLayout graphHdr = new LinearLayout(ctx);
        graphHdr.setOrientation(LinearLayout.HORIZONTAL);
        graphHdr.setGravity(Gravity.CENTER_VERTICAL);

        TextView graphTitle = UiKit.label(ctx, I18n.tr("✦ Đáp Tuyến PEQ", "✦ PEQ Response"), 14.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        activeProfileTv = UiKit.label(ctx, " • Custom Ear 4380Hz", 10.5f, UiKit.C_AMBER_TEXT, UiKit.FONT_MONO);
        activeProfileTv.setSingleLine(true);
        LinearLayout.LayoutParams apLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        apLp.leftMargin = UiKit.dp(ctx, 4f);
        activeProfileTv.setLayoutParams(apLp);

        saveFromChipBtn = UiKit.actionButton(ctx, I18n.tr("＋Lưu Chip", "＋Save Chip"), Color.argb(45, 255, 159, 10), UiKit.C_AMBER_TEXT, UiKit.C_AMBER_CONTAINER, 7f, 9.5f);
        saveFromChipBtn.setSingleLine(true);
        saveFromChipBtn.setMinHeight(UiKit.dp(ctx, 28f));
        saveFromChipBtn.setPadding(UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f));
        saveFromChipBtn.setVisibility(GONE);
        saveFromChipBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            hostActions.onSaveChipCurveToVault(controller.getLivePeq());
        });

        revertBtn = UiKit.actionButton(ctx, I18n.tr("↺ Hoàn tác", "↺ Revert"), UiKit.C_SURFACE_HIGH, UiKit.C_AMBER_TEXT, Color.TRANSPARENT, 7f, 10f);
        revertBtn.setSingleLine(true);
        revertBtn.setMinHeight(UiKit.dp(ctx, 28f));
        revertBtn.setPadding(UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f));
        LinearLayout.LayoutParams rvLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rvLp.leftMargin = UiKit.dp(ctx, 4f);
        revertBtn.setLayoutParams(rvLp);
        revertBtn.setVisibility(GONE);
        revertBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            controller.revertToSavedSnapshotAsync();
        });

        TextView flatBtn = UiKit.actionButton(ctx, "Flat 0dB", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_MUTED, Color.TRANSPARENT, 7f, 9.5f);
        flatBtn.setSingleLine(true);
        flatBtn.setMinHeight(UiKit.dp(ctx, 28f));
        flatBtn.setPadding(UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f));
        LinearLayout.LayoutParams flLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        flLp.leftMargin = UiKit.dp(ctx, 4f);
        flatBtn.setLayoutParams(flLp);
        flatBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            controller.applyProfileLive(PeqSnapshot.flatNeutral(), "Flat Reference (0 dB)");
        });

        graphHdr.addView(graphTitle);
        graphHdr.addView(activeProfileTv);
        graphHdr.addView(saveFromChipBtn);
        graphHdr.addView(revertBtn);
        graphHdr.addView(flatBtn);
        graphCard.addView(graphHdr, UiKit.matchWrapBottomMargin(ctx, 8f));

        graphView = new PeqGraphView(ctx, false);
        graphView.setBandListener(new PeqGraphView.BandListener() {
            @Override
            public void onBandSelected(int bandIndex) {
                selectedBand = bandIndex;
                refreshUiFromController();
            }

            @Override
            public void onBandDragged(int bandIndex, int nextFreq, float nextGain) {
                selectedBand = bandIndex;
                PeqBand cur = controller.getLivePeq().bands[bandIndex];
                controller.updateBandLive(bandIndex, new PeqBand(cur.type, nextFreq, nextGain, cur.q));
            }

            @Override
            public void onBandQPinched(int bandIndex, float nextQ) {
                PeqBand cur = controller.getLivePeq().bands[bandIndex];
                controller.updateBandLive(bandIndex, cur.withQ(nextQ));
            }
        });
        graphCard.addView(graphView, UiKit.matchWrapBottomMargin(ctx, 8f));

        // Selected band readout bar
        LinearLayout readoutBar = new LinearLayout(ctx);
        readoutBar.setOrientation(LinearLayout.HORIZONTAL);
        readoutBar.setGravity(Gravity.CENTER_VERTICAL);
        readoutBar.setPadding(UiKit.dp(ctx, 10f), UiKit.dp(ctx, 6f), UiKit.dp(ctx, 10f), UiKit.dp(ctx, 6f));
        readoutBar.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_CONTAINER, 8f, Color.TRANSPARENT, 0f));

        selectedBandReadout = UiKit.label(ctx, "B4 • 4380 Hz • -3.8 dB • Q 3.20", 11f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO);
        selectedBandReadout.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView iirBadge = UiKit.badge(ctx, I18n.tr("PINCH = ĐỔI Q", "PINCH = Q"), UiKit.C_SURFACE_HIGH, UiKit.C_CYAN_TEXT);
        readoutBar.addView(selectedBandReadout);
        readoutBar.addView(iirBadge);
        graphCard.addView(readoutBar, UiKit.matchWrapBottomMargin(ctx, 8f));

        // Horizontal Quick Preset Switcher Rail right under Graph
        HorizontalScrollView chipScroll = new HorizontalScrollView(ctx);
        chipScroll.setHorizontalScrollBarEnabled(false);
        quickChipsRow = new LinearLayout(ctx);
        quickChipsRow.setOrientation(LinearLayout.HORIZONTAL);
        quickChipsRow.setGravity(Gravity.CENTER_VERTICAL);
        chipScroll.addView(quickChipsRow);
        graphCard.addView(chipScroll);

        root.addView(graphCard, UiKit.matchWrapBottomMargin(ctx, 10f));

        // 3. Output Stage (DAC Volume 0..60 + Master Preamp)
        LinearLayout outCard = UiKit.cardContainer(ctx, 11f);
        LinearLayout outHdr = new LinearLayout(ctx);
        outHdr.setOrientation(LinearLayout.HORIZONTAL);
        outHdr.setGravity(Gravity.CENTER_VERTICAL);
        TextView outTitle = UiKit.label(ctx, I18n.tr("🎚 Tầng Xuất (Volume & Preamp)", "🎚 Output Stage (Volume & Preamp)"), 14.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        outTitle.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView regBadge = UiKit.label(ctx, "REG 0x02", 10f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO);
        outHdr.addView(outTitle);
        outHdr.addView(regBadge);
        outCard.addView(outHdr, UiKit.matchWrapBottomMargin(ctx, 8f));

        // DAC Volume Box
        LinearLayout volBox = new LinearLayout(ctx);
        volBox.setOrientation(LinearLayout.VERTICAL);
        int vp = UiKit.dp(ctx, 9f);
        volBox.setPadding(vp, vp, vp, vp);
        volBox.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_CONTAINER, 9f, Color.TRANSPARENT, 0f));

        LinearLayout volRow = new LinearLayout(ctx);
        volRow.setOrientation(LinearLayout.HORIZONTAL);
        volRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView volLbl = UiKit.label(ctx, I18n.tr("Âm lượng DAC phần cứng", "Hardware DAC Volume"), 11.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO);
        volLbl.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView pc32Btn = UiKit.actionButton(ctx, "32 (Min)", UiKit.C_SURFACE_HIGHEST, UiKit.C_CYAN_TEXT, Color.TRANSPARENT, 6f, 9.5f);
        pc32Btn.setMinHeight(UiKit.dp(ctx, 28f));
        pc32Btn.setPadding(UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f));
        pc32Btn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            controller.updateDeviceVolumeLive(32);
        });

        TextView clean48Btn = UiKit.actionButton(ctx, I18n.tr("48 (Sạch)", "48 (Clean)"), UiKit.C_SURFACE_HIGHEST, UiKit.C_GREEN, Color.TRANSPARENT, 6f, 9.5f);
        clean48Btn.setMinHeight(UiKit.dp(ctx, 28f));
        clean48Btn.setPadding(UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 7f), UiKit.dp(ctx, 3f));
        LinearLayout.LayoutParams c48Lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        c48Lp.leftMargin = UiKit.dp(ctx, 4f);
        clean48Btn.setLayoutParams(c48Lp);
        clean48Btn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            controller.updateDeviceVolumeLive(48);
        });

        volValueTv = UiKit.badge(ctx, "36 / 60", UiKit.C_SURFACE_HIGHEST, UiKit.C_CYAN_TEXT);
        LinearLayout.LayoutParams vvLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        vvLp.leftMargin = UiKit.dp(ctx, 5f);
        volValueTv.setLayoutParams(vvLp);

        volRow.addView(volLbl);
        volRow.addView(pc32Btn);
        volRow.addView(clean48Btn);
        volRow.addView(volValueTv);
        volBox.addView(volRow, UiKit.matchWrapBottomMargin(ctx, 4f));

        volSeek = new SeekBar(ctx);
        volSeek.setMax(60);
        volSeek.setProgressTintList(ColorStateList.valueOf(UiKit.C_CYAN_CONTAINER));
        volSeek.setThumbTintList(ColorStateList.valueOf(UiKit.C_CYAN_TEXT));
        volSeek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && !suppressSeekCallbacks) {
                    controller.updateDeviceVolumeLive(progress);
                }
            }

            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        volBox.addView(volSeek);

        volWarnTv = UiKit.label(
                ctx,
                I18n.tr(
                        "Khuyên dùng 32–60/60 (dưới 32 dễ rè liên tục trên chip KT02H20)",
                        "Recommended 32–60/60 (below 32 may crackle on KT02H20)"
                ),
                9.5f,
                UiKit.C_TEXT_MUTED,
                UiKit.FONT_MONO
        );
        volWarnTv.setGravity(Gravity.CENTER_HORIZONTAL);
        volBox.addView(volWarnTv);
        outCard.addView(volBox, UiKit.matchWrapBottomMargin(ctx, 8f));

        // Master Preamp Box
        LinearLayout preBox = new LinearLayout(ctx);
        preBox.setOrientation(LinearLayout.VERTICAL);
        preBox.setPadding(vp, vp, vp, vp);
        preBox.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_CONTAINER, 9f, Color.TRANSPARENT, 0f));

        LinearLayout preRow = new LinearLayout(ctx);
        preRow.setOrientation(LinearLayout.HORIZONTAL);
        preRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView preLbl = UiKit.label(ctx, "Master Preamp", 11.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO);
        preLbl.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        preampAutoBtn = UiKit.actionButton(ctx, "Safe -12dB", UiKit.C_AMBER_CONTAINER, UiKit.C_ON_AMBER, Color.TRANSPARENT, 6f, 10f);
        preampAutoBtn.setMinHeight(UiKit.dp(ctx, 28f));
        preampAutoBtn.setPadding(UiKit.dp(ctx, 8f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 8f), UiKit.dp(ctx, 3f));
        preampAutoBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            HeadroomResult hr = BiquadMath.computeHeadroom(controller.getLivePeq());
            float target = hr.maxNetOutputDb > 0.2f ? hr.recommendedMasterGain : -12f;
            controller.updateMasterGainLive(target);
        });

        preampValueTv = UiKit.badge(ctx, "-12.0 dB", UiKit.C_SURFACE_HIGHEST, UiKit.C_AMBER_TEXT);
        LinearLayout.LayoutParams pvLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pvLp.leftMargin = UiKit.dp(ctx, 6f);
        preampValueTv.setLayoutParams(pvLp);

        preRow.addView(preLbl);
        preRow.addView(preampAutoBtn);
        preRow.addView(preampValueTv);
        preBox.addView(preRow, UiKit.matchWrapBottomMargin(ctx, 4f));

        preampSeek = new SeekBar(ctx);
        preampSeek.setMax(240); // -12.0 .. +12.0 step 0.1
        preampSeek.setProgressTintList(ColorStateList.valueOf(UiKit.C_AMBER_CONTAINER));
        preampSeek.setThumbTintList(ColorStateList.valueOf(UiKit.C_AMBER_TEXT));
        preampSeek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && !suppressSeekCallbacks) {
                    float db = (progress - 120) / 10f;
                    controller.updateMasterGainLive(db);
                }
            }

            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        preBox.addView(preampSeek, UiKit.matchWrapBottomMargin(ctx, 3f));

        headroomTv = UiKit.label(ctx, I18n.tr("Headroom an toàn", "Safe Headroom"), 10f, UiKit.C_GREEN, UiKit.FONT_MONO);
        headroomTv.setGravity(Gravity.CENTER_HORIZONTAL);
        preBox.addView(headroomTv);
        outCard.addView(preBox);
        root.addView(outCard, UiKit.matchWrapBottomMargin(ctx, 12f));

        // 4. 5-Band Parametric Channel Cards
        LinearLayout bandsHdr = new LinearLayout(ctx);
        bandsHdr.setOrientation(LinearLayout.HORIZONTAL);
        bandsHdr.setGravity(Gravity.CENTER_VERTICAL);
        TextView bHdrTitle = UiKit.label(ctx, I18n.tr("Băng Tần Chi Tiết (5 Bands)", "5-Band Parametric EQ"), 14.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        bHdrTitle.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView bHdrSub = UiKit.label(ctx, I18n.tr("CHẠM SỐ ĐỂ NHẬP CHÍNH XÁC", "TAP VALUE TO TYPE"), 9.5f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO);
        bandsHdr.addView(bHdrTitle);
        bandsHdr.addView(bHdrSub);
        root.addView(bandsHdr, UiKit.matchWrapBottomMargin(ctx, 8f));

        for (int i = 0; i < 5; i++) {
            BandCardHolder holder = createBandCard(ctx, i);
            bandCards[i] = holder;
            root.addView(holder.card, UiKit.matchWrapBottomMargin(ctx, 8f));
        }

        // 5. DAC Flash Memory Action Footer
        LinearLayout footer = UiKit.cardContainer(ctx, 10f);
        footer.setOrientation(LinearLayout.HORIZONTAL);
        footer.setGravity(Gravity.CENTER_VERTICAL);

        footerMsgTv = UiKit.label(ctx, I18n.tr("Sẵn sàng", "Ready"), 10.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO);
        footerMsgTv.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        footerMsgTv.setMaxLines(2);

        TextView importXmlBtn = UiKit.actionButton(ctx, I18n.tr("Nhập XML", "Import XML"), UiKit.C_SURFACE_CONTAINER, UiKit.C_TEXT_PRIMARY, UiKit.C_BORDER, 8f, 10.5f);
        importXmlBtn.setMinHeight(UiKit.dp(ctx, 38f));
        LinearLayout.LayoutParams impLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        impLp.leftMargin = UiKit.dp(ctx, 6f);
        importXmlBtn.setLayoutParams(impLp);
        importXmlBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            hostActions.onRequestImportXml();
        });

        saveChipBtn = UiKit.actionButton(ctx, I18n.tr("💾 Lưu Chip", "💾 Save Chip"), UiKit.C_AMBER_CONTAINER, UiKit.C_ON_AMBER, Color.TRANSPARENT, 8f, 10.5f);
        saveChipBtn.setMinHeight(UiKit.dp(ctx, 38f));
        LinearLayout.LayoutParams svLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        svLp.leftMargin = UiKit.dp(ctx, 6f);
        saveChipBtn.setLayoutParams(svLp);
        saveChipBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            controller.commitToFlashAsync();
        });

        footer.addView(footerMsgTv);
        footer.addView(importXmlBtn);
        footer.addView(saveChipBtn);
        root.addView(footer);
    }

    public void selectBandAndFocus(int bandIndex) {
        this.selectedBand = Math.max(0, Math.min(4, bandIndex));
        smoothScrollTo(0, 0);
        refreshUiFromController();
    }

    public void setActiveSweepHz(Integer sweepHz) {
        this.activeSweepHz = sweepHz;
        refreshUiFromController();
    }

    public void setQuickProfiles(List<PeqProfile> profiles) {
        this.quickProfiles = profiles != null ? profiles : new ArrayList<>();
        rebuildQuickChips();
    }

    private void rebuildQuickChips() {
        Context ctx = getContext();
        quickChipsRow.removeAllViews();
        HardwareState hw = controller.getHardwareState();
        String activeLabel = controller.getActiveProfileLabel();

        int[][] modes = {{3, 0}, {0, 1}, {2, 2}, {1, 3}};
        String[] modeNames = {"User 1", "Vocal", "Bass", "Classic"};

        for (int m = 0; m < modes.length; m++) {
            final int code = modes[m][0];
            boolean isAct = (hw.eqPreset == code);
            TextView chip = UiKit.actionButton(
                    ctx,
                    modeNames[m],
                    isAct ? UiKit.C_AMBER_CONTAINER : UiKit.C_SURFACE_CONTAINER,
                    isAct ? UiKit.C_ON_AMBER : UiKit.C_TEXT_MUTED,
                    isAct ? Color.TRANSPARENT : UiKit.C_BORDER,
                    7f,
                    10.5f
            );
            chip.setMinHeight(UiKit.dp(ctx, 32f));
            chip.setPadding(UiKit.dp(ctx, 10f), UiKit.dp(ctx, 4f), UiKit.dp(ctx, 10f), UiKit.dp(ctx, 4f));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = UiKit.dp(ctx, 6f);
            chip.setLayoutParams(lp);
            chip.setOnClickListener(v -> {
                UiKit.hapticTap(v);
                controller.setEqModeAsync(code);
            });
            quickChipsRow.addView(chip);
        }

        int maxP = Math.min(6, quickProfiles.size());
        for (int i = 0; i < maxP; i++) {
            final PeqProfile p = quickProfiles.get(i);
            String shortName = p.name.replace("JD1 + JA11 | ", "").replace("JD1 | ", "");
            boolean isAct = p.name.equals(activeLabel);
            TextView chip = UiKit.actionButton(
                    ctx,
                    "⚡ " + shortName,
                    isAct ? Color.argb(55, 0, 238, 252) : UiKit.C_SURFACE_CONTAINER,
                    isAct ? UiKit.C_CYAN_TEXT : UiKit.C_TEXT_MUTED,
                    isAct ? UiKit.C_CYAN_CONTAINER : UiKit.C_BORDER,
                    7f,
                    10.5f
            );
            chip.setMinHeight(UiKit.dp(ctx, 32f));
            chip.setPadding(UiKit.dp(ctx, 10f), UiKit.dp(ctx, 4f), UiKit.dp(ctx, 10f), UiKit.dp(ctx, 4f));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = UiKit.dp(ctx, 6f);
            chip.setLayoutParams(lp);
            chip.setOnClickListener(v -> {
                UiKit.hapticTap(v);
                controller.applyProfileLive(p.snapshot, p.name);
            });
            quickChipsRow.addView(chip);
        }
    }

    public void refreshUiFromController() {
        Context ctx = getContext();
        HardwareState hw = controller.getHardwareState();
        PeqSnapshot live = controller.getLivePeq();
        PeqSnapshot saved = controller.getSavedSnapshot();
        boolean unsaved = controller.hasUnsavedRamChanges();
        String label = controller.getActiveProfileLabel();
        boolean bypassed = (hw.eqPreset == 4);

        suppressSeekCallbacks = true;
        try {
            statusDot.setTextColor(hw.connected ? UiKit.C_GREEN : UiKit.C_OUTLINE);
            statusTitle.setText(hw.connected
                    ? (unsaved ? I18n.tr("DSP RAM LIVE (CHƯA LƯU CHIP)", "DSP RAM LIVE (UNSAVED)") : "DSP ONLINE")
                    : I18n.tr("CHẾ ĐỘ OFFLINE", "OFFLINE MODE"));

            sampleRateBadge.setText(hw.connected && !"--".equals(hw.sampleRate) ? hw.sampleRate : "384kHz");
            fwBadge.setText(hw.connected && !"--".equals(hw.firmwareVersion) ? hw.firmwareVersion : "32-BIT");
            uacBadge.setText(hw.uacMode == 0 ? "UAC 1.0" : "UAC 2.0");

            PeqProfile matchedLocal = null;
            for (PeqProfile qp : quickProfiles) {
                if (qp != null && qp.snapshot != null && qp.snapshot.sameValues(live)) {
                    matchedLocal = qp;
                    break;
                }
            }
            boolean isUnmatchedOnChip = hw.connected && hw.eqPreset == 3 && matchedLocal == null;
            if (matchedLocal != null) {
                activeProfileTv.setText(" • ✓ " + matchedLocal.name);
                activeProfileTv.setTextColor(UiKit.C_GREEN);
            } else if (isUnmatchedOnChip) {
                activeProfileTv.setText(I18n.tr(" • ⚡ Trên Chip (Chưa lưu)", " • ⚡ On Chip (Unsaved here)"));
                activeProfileTv.setTextColor(UiKit.C_AMBER_TEXT);
            } else {
                activeProfileTv.setText(" • " + label);
                activeProfileTv.setTextColor(UiKit.C_AMBER_TEXT);
            }
            saveFromChipBtn.setVisibility(isUnmatchedOnChip ? VISIBLE : GONE);
            revertBtn.setVisibility(unsaved ? VISIBLE : GONE);

            graphView.updateState(live, saved, selectedBand, bypassed, activeSweepHz);

            PeqBand selB = live.bands[selectedBand];
            selectedBandReadout.setText(bypassed
                    ? I18n.tr("EQ TẮT • Đường đáp tuyến phẳng (Hardware Bypass 0 dB)", "EQ OFF • Flat Hardware Bypass (0 dB)")
                    : String.format(Locale.US, "B%d • %d Hz • %+.1f dB • Q %.2f",
                    selectedBand + 1, selB.freq, selB.gain, selB.q));

            rebuildQuickChips();

            volValueTv.setText(hw.deviceVolume + " / 60");
            boolean lowVolRisk = hw.deviceVolume < 32;
            volValueTv.setTextColor(lowVolRisk ? UiKit.C_ERROR : UiKit.C_CYAN_TEXT);
            volWarnTv.setTextColor(lowVolRisk ? UiKit.C_ERROR : UiKit.C_TEXT_MUTED);
            volWarnTv.setText(lowVolRisk
                    ? I18n.tr(
                            "⚠ Dưới 32/60 dễ rè trên KT02H20 — nên giữ ≥ 32 và giảm bằng âm lượng máy!",
                            "⚠ Below 32/60 may crackle on KT02H20 — keep ≥ 32 and use phone volume!"
                    )
                    : I18n.tr(
                            "Vùng sạch tiếng (32–60/60) • Giảm thêm bằng âm lượng máy hoặc Master Gain",
                            "Clean zone (32–60/60) • Lower volume via phone volume or Master Gain"
                    ));
            volSeek.setProgress(hw.deviceVolume);

            preampValueTv.setText(String.format(Locale.US, "%+.1f dB", live.masterGain));
            preampSeek.setProgress(Math.round(live.masterGain * 10f) + 120);

            HeadroomResult hr = BiquadMath.computeHeadroom(live);
            boolean clip = hr.maxNetOutputDb > 0.2f;
            preampAutoBtn.setText(clip
                    ? String.format(Locale.US, "Auto %.1fdB", hr.recommendedMasterGain)
                    : "Safe -12dB");
            headroomTv.setTextColor(clip ? UiKit.C_ERROR : UiKit.C_GREEN);
            headroomTv.setText(clip
                    ? String.format(Locale.US,
                            I18n.tr("Cảnh báo vượt đỉnh: +%.1f dB (chạm Auto để hạ)", "Clipping risk: +%.1f dB (tap Auto to trim)"),
                            hr.maxNetOutputDb)
                    : String.format(Locale.US,
                            I18n.tr("Headroom an toàn (Đỉnh thực: %.1f dB)", "Safe headroom (Net peak: %.1f dB)"),
                            hr.maxNetOutputDb));

            for (int i = 0; i < 5; i++) {
                bindBandCard(ctx, bandCards[i], i, live.bands[i], i == selectedBand);
            }

            footerMsgTv.setText(hw.statusMessage);
            saveChipBtn.setVisibility(hw.connected ? VISIBLE : GONE);
        } finally {
            suppressSeekCallbacks = false;
        }
    }

    private BandCardHolder createBandCard(final Context ctx, final int idx) {
        final BandCardHolder h = new BandCardHolder();
        h.card = UiKit.cardContainer(ctx, 10f);
        h.card.setOnClickListener(v -> {
            selectedBand = idx;
            refreshUiFromController();
        });

        // Header row: Badge + Name + LSQ/PK/HSQ buttons
        LinearLayout top = new LinearLayout(ctx);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);

        h.numBadge = UiKit.badge(ctx, String.valueOf(idx + 1), UiKit.C_AMBER_TEXT, UiKit.C_ON_AMBER);
        h.nameTv = UiKit.label(ctx, bandName(idx), 13.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        LinearLayout.LayoutParams nmLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        nmLp.leftMargin = UiKit.dp(ctx, 8f);
        h.nameTv.setLayoutParams(nmLp);

        top.addView(h.numBadge);
        top.addView(h.nameTv);

        FilterType[] types = {FilterType.LSQ, FilterType.PK, FilterType.HSQ};
        for (int t = 0; t < 3; t++) {
            final FilterType ft = types[t];
            TextView tb = UiKit.actionButton(ctx, ft.label, UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_MUTED, Color.TRANSPARENT, 6f, 10f);
            tb.setMinHeight(UiKit.dp(ctx, 28f));
            tb.setPadding(UiKit.dp(ctx, 8f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 8f), UiKit.dp(ctx, 3f));
            LinearLayout.LayoutParams tLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            tLp.leftMargin = UiKit.dp(ctx, 3f);
            tb.setLayoutParams(tLp);
            tb.setOnClickListener(v -> {
                UiKit.hapticTap(v);
                selectedBand = idx;
                PeqBand cur = controller.getLivePeq().bands[idx];
                controller.updateBandLive(idx, cur.withType(ft));
            });
            h.typeBtns[t] = tb;
            top.addView(tb);
        }
        h.card.addView(top, UiKit.matchWrapBottomMargin(ctx, 8f));

        // Row 1: Frequency
        h.freqValBtn = createSliderRow(
                ctx,
                h.card,
                I18n.tr("Tần số", "Freq"),
                1000,
                UiKit.C_TEXT_PRIMARY,
                seek -> h.freqSeek = seek,
                (progress) -> {
                    double r = progress / 1000.0;
                    int hz = (int) Math.round(Math.pow(10.0, Math.log10(20.0) + r * (Math.log10(20000.0) - Math.log10(20.0))));
                    selectedBand = idx;
                    PeqBand cur = controller.getLivePeq().bands[idx];
                    controller.updateBandLive(idx, cur.withFreq(hz));
                },
                () -> promptExactNumber(ctx,
                        I18n.tr("Nhập Tần số Band " + (idx + 1) + " (20–20000 Hz)", "Band " + (idx + 1) + " Frequency (20–20000 Hz)"),
                        String.valueOf(controller.getLivePeq().bands[idx].freq), false, val -> {
                            selectedBand = idx;
                            controller.updateBandLive(idx, controller.getLivePeq().bands[idx].withFreq(Math.round(val)));
                        })
        );

        // Row 2: Gain
        h.gainValBtn = createSliderRow(
                ctx,
                h.card,
                "Gain",
                240,
                UiKit.C_AMBER_CONTAINER,
                seek -> h.gainSeek = seek,
                (progress) -> {
                    float db = (progress - 120) / 10f;
                    selectedBand = idx;
                    PeqBand cur = controller.getLivePeq().bands[idx];
                    controller.updateBandLive(idx, cur.withGain(db));
                },
                () -> promptExactNumber(ctx,
                        I18n.tr("Nhập Gain Band " + (idx + 1) + " (-12.0 .. +12.0 dB)", "Band " + (idx + 1) + " Gain (-12.0 .. +12.0 dB)"),
                        String.valueOf(controller.getLivePeq().bands[idx].gain), true, val -> {
                            selectedBand = idx;
                            controller.updateBandLive(idx, controller.getLivePeq().bands[idx].withGain(val));
                        })
        );

        // Row 3: Q Factor
        h.qValBtn = createSliderRow(
                ctx,
                h.card,
                I18n.tr("Độ rộng Q", "Q Factor"),
                198,
                UiKit.C_CYAN_CONTAINER,
                seek -> h.qSeek = seek,
                (progress) -> {
                    float q = 0.1f + progress * 0.05f;
                    selectedBand = idx;
                    PeqBand cur = controller.getLivePeq().bands[idx];
                    controller.updateBandLive(idx, cur.withQ(q));
                },
                () -> promptExactNumber(ctx,
                        I18n.tr("Nhập Q Band " + (idx + 1) + " (0.10 .. 10.00)", "Band " + (idx + 1) + " Q Factor (0.10 .. 10.00)"),
                        String.valueOf(controller.getLivePeq().bands[idx].q), true, val -> {
                            selectedBand = idx;
                            controller.updateBandLive(idx, controller.getLivePeq().bands[idx].withQ(val));
                        })
        );

        return h;
    }

    private interface SeekConsumer {
        void accept(SeekBar s);
    }

    private interface ProgressAction {
        void onUserProgress(int progress);
    }

    private interface FloatResult {
        void onValue(float v);
    }

    private TextView createSliderRow(
            Context ctx,
            LinearLayout parent,
            String title,
            int maxVal,
            int tintColor,
            SeekConsumer seekOut,
            final ProgressAction action,
            final Runnable onTapBadge
    ) {
        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(UiKit.dp(ctx, 6f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 6f), UiKit.dp(ctx, 3f));
        row.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_CONTAINER, 7f, Color.TRANSPARENT, 0f));

        TextView lbl = UiKit.label(ctx, title, 10.5f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO);
        lbl.setWidth(UiKit.dp(ctx, 68f));

        SeekBar sb = new SeekBar(ctx);
        sb.setMax(maxVal);
        sb.setProgressTintList(ColorStateList.valueOf(tintColor));
        sb.setThumbTintList(ColorStateList.valueOf(tintColor));
        sb.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && !suppressSeekCallbacks) {
                    action.onUserProgress(progress);
                }
            }

            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        seekOut.accept(sb);

        TextView valBadge = UiKit.actionButton(ctx, "--", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_PRIMARY, Color.TRANSPARENT, 6f, 10.5f);
        valBadge.setMinHeight(UiKit.dp(ctx, 28f));
        valBadge.setMinWidth(UiKit.dp(ctx, 68f));
        valBadge.setPadding(UiKit.dp(ctx, 6f), UiKit.dp(ctx, 3f), UiKit.dp(ctx, 6f), UiKit.dp(ctx, 3f));
        valBadge.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            onTapBadge.run();
        });

        row.addView(lbl);
        row.addView(sb);
        row.addView(valBadge);
        parent.addView(row, UiKit.matchWrapBottomMargin(ctx, 4f));
        return valBadge;
    }

    private void bindBandCard(Context ctx, BandCardHolder h, int idx, PeqBand b, boolean isSel) {
        h.card.setBackground(UiKit.roundedBox(
                ctx,
                isSel ? UiKit.C_SURFACE_CONTAINER : UiKit.C_SURFACE_LOW,
                12f,
                isSel ? UiKit.C_CYAN_CONTAINER : UiKit.C_BORDER,
                isSel ? 1.3f : 0.8f
        ));
        h.numBadge.setBackground(UiKit.roundedBox(
                ctx,
                isSel ? UiKit.C_CYAN_CONTAINER : UiKit.C_AMBER_TEXT,
                5f,
                Color.TRANSPARENT,
                0f
        ));
        h.numBadge.setTextColor(isSel ? UiKit.C_ON_CYAN : UiKit.C_ON_AMBER);
        h.nameTv.setTextColor(isSel ? UiKit.C_CYAN_TEXT : UiKit.C_TEXT_PRIMARY);

        FilterType[] types = {FilterType.LSQ, FilterType.PK, FilterType.HSQ};
        for (int t = 0; t < 3; t++) {
            boolean act = (b.type == types[t]);
            int bg = act ? (isSel ? UiKit.C_CYAN_CONTAINER : UiKit.C_AMBER_CONTAINER) : UiKit.C_SURFACE_HIGH;
            int fg = act ? (isSel ? UiKit.C_ON_CYAN : UiKit.C_ON_AMBER) : UiKit.C_TEXT_MUTED;
            h.typeBtns[t].setBackground(UiKit.roundedBox(ctx, bg, 6f, Color.TRANSPARENT, 0f));
            h.typeBtns[t].setTextColor(fg);
        }

        int logPos = (int) Math.round(
                ((Math.log10(Math.max(20.0, b.freq)) - Math.log10(20.0))
                        / (Math.log10(20000.0) - Math.log10(20.0))) * 1000.0
        );
        h.freqSeek.setProgress(Math.max(0, Math.min(1000, logPos)));
        h.freqValBtn.setText(b.freq + " Hz");

        h.gainSeek.setProgress(Math.round(b.gain * 10f) + 120);
        h.gainValBtn.setText(String.format(Locale.US, "%+.1f dB", b.gain));
        h.gainValBtn.setTextColor(b.gain < -0.05f ? UiKit.C_ERROR : UiKit.C_AMBER_TEXT);

        h.qSeek.setProgress(Math.max(0, Math.min(198, Math.round((b.q - 0.1f) / 0.05f))));
        h.qValBtn.setText(String.format(Locale.US, "Q %.2f", b.q));
        h.qValBtn.setTextColor(UiKit.C_CYAN_TEXT);
    }

    private void promptExactNumber(Context ctx, String title, String initial, boolean decimal, final FloatResult cb) {
        final EditText input = new EditText(ctx);
        input.setInputType(InputType.TYPE_CLASS_NUMBER
                | (decimal ? (InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED) : 0));
        input.setText(initial);
        input.setSelection(input.getText().length());

        new AlertDialog.Builder(ctx, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(title)
                .setView(input)
                .setPositiveButton(I18n.tr("Áp dụng", "Apply"), (d, w) -> {
                    try {
                        float v = Float.parseFloat(input.getText().toString().trim());
                        cb.onValue(v);
                    } catch (Exception ignored) {
                    }
                })
                .setNegativeButton(I18n.tr("Hủy", "Cancel"), null)
                .show();
    }

    private static final class BandCardHolder {
        LinearLayout card;
        TextView numBadge;
        TextView nameTv;
        final TextView[] typeBtns = new TextView[3];
        SeekBar freqSeek;
        TextView freqValBtn;
        SeekBar gainSeek;
        TextView gainValBtn;
        SeekBar qSeek;
        TextView qValBtn;
    }
}
