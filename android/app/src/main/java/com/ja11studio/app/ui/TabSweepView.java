package com.ja11studio.app.ui;

import android.app.AlertDialog;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import com.ja11studio.app.core.I18n;

import java.util.Locale;

/**
 * Tab 2 (Native): Ear Peak Sweep — 48kHz AudioTrack Sine Generator, Auto-Sweep 2k->10k, L/R Router, Assign to Band 4.
 */
public final class TabSweepView extends ScrollView {
    public interface HostActions {
        void onActiveSweepChanged(Integer hz);
        void onAssignPeakToBand4(int hz);
    }

    private final SineGeneratorEngine sineEngine;
    private final HostActions hostActions;
    private boolean suppressSeek = false;

    private final TextView freqHeroTv;
    private final TextView zoneTv;
    private final ProgressBar sweepProgress;
    private final TextView sweepPctTv;
    private final TextView playBtn;
    private final TextView sweepBtn;
    private final SeekBar freqSeek;
    private final TextView[] panBtns = new TextView[3];
    private final TextView volValTv;

    public TabSweepView(Context ctx, SineGeneratorEngine engine, HostActions actions) {
        super(ctx);
        this.sineEngine = engine;
        this.hostActions = actions;
        setFillViewport(true);
        setVerticalScrollBarEnabled(false);

        LinearLayout root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        int padH = UiKit.dp(ctx, 12f);
        root.setPadding(padH, UiKit.dp(ctx, 10f), padH, UiKit.dp(ctx, 24f));
        addView(root, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // 1. Advisory Banner
        LinearLayout banner = UiKit.cardContainer(ctx, 10f);
        banner.setOrientation(LinearLayout.HORIZONTAL);
        banner.setGravity(Gravity.CENTER_VERTICAL);
        TextView bTxt = UiKit.label(ctx, I18n.tr("🎧 Đo đỉnh cộng hưởng ống tai (Ear Sweep)", "🎧 Ear Canal Resonance Sweep"), 11.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO_BOLD);
        bTxt.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView bTag = UiKit.badge(ctx, "PCM 48kHz", UiKit.C_SURFACE_HIGH, UiKit.C_AMBER_TEXT);
        banner.addView(bTxt);
        banner.addView(bTag);
        root.addView(banner, UiKit.matchWrapBottomMargin(ctx, 10f));

        // 2. Hero Sine Generator Card
        LinearLayout heroCard = UiKit.cardContainer(ctx, 12f);

        LinearLayout heroTop = new LinearLayout(ctx);
        heroTop.setOrientation(LinearLayout.HORIZONTAL);
        heroTop.setGravity(Gravity.CENTER_VERTICAL);
        TextView sLbl = UiKit.label(ctx, I18n.tr("BỘ PHÁT SÓNG ĐƠN SẮC (SINE GEN)", "PURE SINE WAVE GENERATOR"), 10.5f, UiKit.C_CYAN_TEXT, UiKit.FONT_MONO_BOLD);
        sLbl.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView thdBadge = UiKit.badge(ctx, "FLOAT 32-BIT", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_MUTED);
        heroTop.addView(sLbl);
        heroTop.addView(thdBadge);
        heroCard.addView(heroTop, UiKit.matchWrapBottomMargin(ctx, 10f));

        // Display Box
        LinearLayout dispBox = new LinearLayout(ctx);
        dispBox.setOrientation(LinearLayout.VERTICAL);
        int dp12 = UiKit.dp(ctx, 12f);
        dispBox.setPadding(dp12, dp12, dp12, dp12);
        dispBox.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_LOWEST, 10f, UiKit.C_BORDER, 0.8f));

        LinearLayout hzRow = new LinearLayout(ctx);
        hzRow.setOrientation(LinearLayout.HORIZONTAL);
        hzRow.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout hzCol = new LinearLayout(ctx);
        hzCol.setOrientation(LinearLayout.VERTICAL);
        hzCol.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        freqHeroTv = UiKit.label(ctx, "4.380 Hz", 28f, UiKit.C_AMBER_TEXT, UiKit.FONT_SANS_BOLD);
        zoneTv = UiKit.label(ctx, zoneLabel(4380), 10f, UiKit.C_CYAN_TEXT, UiKit.FONT_MONO);
        hzCol.addView(freqHeroTv);
        hzCol.addView(zoneTv);

        TextView assignBtn = UiKit.actionButton(
                ctx,
                I18n.tr("⊕ Gán vào B4", "⊕ Set Band 4"),
                Color.argb(45, 0, 238, 252),
                UiKit.C_CYAN_TEXT,
                UiKit.C_CYAN_CONTAINER,
                8f,
                11f
        );
        assignBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            int hz = sineEngine.getFreqHz();
            sineEngine.stopAll();
            hostActions.onAssignPeakToBand4(hz);
        });

        hzRow.addView(hzCol);
        hzRow.addView(assignBtn);
        dispBox.addView(hzRow, UiKit.matchWrapBottomMargin(ctx, 10f));

        // 2k -> 10k Progress Bar
        LinearLayout progHdr = new LinearLayout(ctx);
        progHdr.setOrientation(LinearLayout.HORIZONTAL);
        TextView pLbl = UiKit.label(ctx, I18n.tr("Tiến trình dải nhạy (2k → 10k)", "Sensitive band progress (2k → 10k)"), 10f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO);
        pLbl.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        sweepPctTv = UiKit.label(ctx, "30%", 10f, UiKit.C_AMBER_TEXT, UiKit.FONT_MONO_BOLD);
        progHdr.addView(pLbl);
        progHdr.addView(sweepPctTv);
        dispBox.addView(progHdr, UiKit.matchWrapBottomMargin(ctx, 4f));

        sweepProgress = new ProgressBar(ctx, null, android.R.attr.progressBarStyleHorizontal);
        sweepProgress.setMax(100);
        sweepProgress.setProgressTintList(ColorStateList.valueOf(UiKit.C_AMBER_CONTAINER));
        dispBox.addView(sweepProgress);
        heroCard.addView(dispBox, UiKit.matchWrapBottomMargin(ctx, 10f));

        // Two Hero Action Buttons
        LinearLayout btnRow = new LinearLayout(ctx);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);

        playBtn = UiKit.actionButton(ctx, I18n.tr("▶ PHÁT SÓNG SIN", "▶ PLAY SINE"), UiKit.C_AMBER_CONTAINER, UiKit.C_ON_AMBER, Color.TRANSPARENT, 10f, 11.5f);
        LinearLayout.LayoutParams pbLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        pbLp.rightMargin = UiKit.dp(ctx, 6f);
        playBtn.setLayoutParams(pbLp);
        playBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            sineEngine.togglePlay();
        });

        sweepBtn = UiKit.actionButton(ctx, I18n.tr("⏩ TỰ QUÉT 2K→10K", "⏩ AUTO SWEEP 2K→10K"), UiKit.C_SURFACE_HIGH, UiKit.C_CYAN_TEXT, UiKit.C_BORDER, 10f, 11.5f);
        sweepBtn.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        sweepBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            sineEngine.toggleAutoSweep();
        });

        btnRow.addView(playBtn);
        btnRow.addView(sweepBtn);
        heroCard.addView(btnRow);
        root.addView(heroCard, UiKit.matchWrapBottomMargin(ctx, 10f));

        // 3. Signal Parameters & Stereo Channel Routing
        LinearLayout paramCard = UiKit.cardContainer(ctx, 12f);
        TextView paramTitle = UiKit.label(ctx, I18n.tr("Thông số sóng thử & Kênh L/R", "Tone Parameters & L/R Routing"), 14.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        paramCard.addView(paramTitle, UiKit.matchWrapBottomMargin(ctx, 8f));

        freqSeek = new SeekBar(ctx);
        freqSeek.setMax(15000);
        freqSeek.setProgressTintList(ColorStateList.valueOf(UiKit.C_AMBER_CONTAINER));
        freqSeek.setThumbTintList(ColorStateList.valueOf(UiKit.C_AMBER_TEXT));
        freqSeek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && !suppressSeek) {
                    sineEngine.setFreqHz(Math.max(20, progress));
                }
            }

            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        paramCard.addView(freqSeek, UiKit.matchWrapBottomMargin(ctx, 8f));

        // Step buttons -100 / -10 / +10 / +100 Hz
        LinearLayout stepRow = new LinearLayout(ctx);
        stepRow.setOrientation(LinearLayout.HORIZONTAL);
        int[] deltas = {-100, -10, 10, 100};
        for (int i = 0; i < deltas.length; i++) {
            final int d = deltas[i];
            String txt = (d > 0 ? "+" : "") + d + "Hz";
            TextView sb = UiKit.actionButton(ctx, txt, UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_PRIMARY, Color.TRANSPARENT, 8f, 11f);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            if (i < 3) lp.rightMargin = UiKit.dp(ctx, 5f);
            sb.setLayoutParams(lp);
            sb.setOnClickListener(v -> {
                UiKit.hapticTick(v);
                sineEngine.setFreqHz(sineEngine.getFreqHz() + d);
            });
            stepRow.addView(sb);
        }
        paramCard.addView(stepRow, UiKit.matchWrapBottomMargin(ctx, 10f));

        // Channel Routing L / L+R / R
        LinearLayout panRow = new LinearLayout(ctx);
        panRow.setOrientation(LinearLayout.HORIZONTAL);
        panRow.setPadding(UiKit.dp(ctx, 4f), UiKit.dp(ctx, 4f), UiKit.dp(ctx, 4f), UiKit.dp(ctx, 4f));
        panRow.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_LOWEST, 10f, Color.TRANSPARENT, 0f));
        String[] panLabels = {
                I18n.tr("◀ Trái (L)", "◀ Left (L)"),
                I18n.tr("Cả hai (L+R)", "Both (L+R)"),
                I18n.tr("Phải (R) ▶", "Right (R) ▶")
        };
        final int[] panVals = {-1, 0, 1};
        for (int i = 0; i < 3; i++) {
            final int pv = panVals[i];
            TextView pb = UiKit.actionButton(ctx, panLabels[i], UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_MUTED, Color.TRANSPARENT, 8f, 10.5f);
            pb.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            pb.setOnClickListener(v -> {
                UiKit.hapticTap(v);
                sineEngine.setPanMode(pv);
                refreshPanButtons();
            });
            panBtns[i] = pb;
            panRow.addView(pb);
        }
        paramCard.addView(panRow, UiKit.matchWrapBottomMargin(ctx, 10f));

        // Safe Volume Slider
        LinearLayout volHdr = new LinearLayout(ctx);
        volHdr.setOrientation(LinearLayout.HORIZONTAL);
        TextView vLbl = UiKit.label(ctx, I18n.tr("Âm lượng sóng thử (Khuyên < 20%)", "Test tone level (Keep < 20%)"), 10.5f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO);
        vLbl.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        int initVol = sineEngine.getVolumePercent();
        volValTv = UiKit.label(ctx, initVol + "% " + (initVol <= 25 ? "(SAFE)" : I18n.tr("(CAO)", "(LOUD)")), 10.5f, UiKit.C_AMBER_TEXT, UiKit.FONT_MONO_BOLD);
        volHdr.addView(vLbl);
        volHdr.addView(volValTv);
        paramCard.addView(volHdr, UiKit.matchWrapBottomMargin(ctx, 4f));

        SeekBar volSeek = new SeekBar(ctx);
        volSeek.setMax(100);
        volSeek.setProgress(initVol);
        volSeek.setProgressTintList(ColorStateList.valueOf(UiKit.C_AMBER_CONTAINER));
        volSeek.setThumbTintList(ColorStateList.valueOf(UiKit.C_AMBER_TEXT));
        volSeek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                int v = Math.max(1, progress);
                sineEngine.setVolumePercent(v);
                volValTv.setText(v + "% " + (v <= 25 ? "(SAFE)" : I18n.tr("(CAO)", "(LOUD)")));
            }

            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        paramCard.addView(volSeek);
        root.addView(paramCard, UiKit.matchWrapBottomMargin(ctx, 10f));

        // 4. Reference Frequency Pills (2x3 Grid)
        LinearLayout refCard = UiKit.cardContainer(ctx, 12f);
        LinearLayout refHdr = new LinearLayout(ctx);
        refHdr.setOrientation(LinearLayout.HORIZONTAL);
        refHdr.setGravity(Gravity.CENTER_VERTICAL);
        TextView refTitle = UiKit.label(ctx, I18n.tr("Tần số tham chiếu nhanh", "Quick Reference Frequencies"), 14.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        refTitle.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView tipBtn = UiKit.actionButton(ctx, I18n.tr("💡 Mẹo dò", "💡 Tips"), UiKit.C_SURFACE_HIGH, UiKit.C_AMBER_TEXT, Color.TRANSPARENT, 7f, 10f);
        tipBtn.setMinHeight(UiKit.dp(ctx, 30f));
        tipBtn.setOnClickListener(v -> showTipDialog(ctx));
        refHdr.addView(refTitle);
        refHdr.addView(tipBtn);
        refCard.addView(refHdr, UiKit.matchWrapBottomMargin(ctx, 8f));

        final int[] refHz = {55, 185, 680, 3200, 4380, 7500};
        final String[] refLbl = {
                "55 Hz\nSub-bass",
                "185 Hz\nMid-bass",
                "680 Hz\nLow-mid",
                "3.2 kHz\nPinna",
                I18n.tr("★ 4.38 kHz\nĐỉnh tai bạn", "★ 4.38 kHz\nEar Peak"),
                "7.5 kHz\nSibilance"
        };

        for (int rowIdx = 0; rowIdx < 2; rowIdx++) {
            LinearLayout r = new LinearLayout(ctx);
            r.setOrientation(LinearLayout.HORIZONTAL);
            for (int col = 0; col < 3; col++) {
                int k = rowIdx * 3 + col;
                final int hz = refHz[k];
                boolean featured = (hz == 4380);
                TextView pill = UiKit.actionButton(
                        ctx,
                        refLbl[k],
                        featured ? UiKit.C_SURFACE_HIGH : UiKit.C_SURFACE_CONTAINER,
                        featured ? UiKit.C_AMBER_TEXT : UiKit.C_TEXT_PRIMARY,
                        featured ? UiKit.C_AMBER_CONTAINER : Color.TRANSPARENT,
                        8f,
                        10.5f
                );
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
                if (col < 2) lp.rightMargin = UiKit.dp(ctx, 6f);
                pill.setLayoutParams(lp);
                pill.setOnClickListener(v -> {
                    UiKit.hapticTap(v);
                    sineEngine.setFreqHz(hz);
                });
                r.addView(pill);
            }
            refCard.addView(r, UiKit.matchWrapBottomMargin(ctx, rowIdx == 0 ? 6f : 0f));
        }
        root.addView(refCard);

        sineEngine.setListener((freqHz, playing, sweeping) -> {
            updateDisplay(freqHz, playing, sweeping);
            hostActions.onActiveSweepChanged(playing ? freqHz : null);
        });
        refreshPanButtons();
        updateDisplay(sineEngine.getFreqHz(), false, false);
    }

    private void refreshPanButtons() {
        Context ctx = getContext();
        int p = sineEngine.getPanMode();
        int activeIdx = (p < 0) ? 0 : (p > 0 ? 2 : 1);
        for (int i = 0; i < 3; i++) {
            boolean act = (i == activeIdx);
            panBtns[i].setBackground(UiKit.roundedBox(
                    ctx,
                    act ? UiKit.C_SURFACE_HIGH : Color.TRANSPARENT,
                    8f,
                    Color.TRANSPARENT,
                    0f
            ));
            panBtns[i].setTextColor(act ? UiKit.C_AMBER_TEXT : UiKit.C_TEXT_MUTED);
        }
    }

    private void updateDisplay(int hz, boolean playing, boolean sweeping) {
        Context ctx = getContext();
        suppressSeek = true;
        try {
            freqHeroTv.setText(String.format(Locale.US, "%,d Hz", hz));
            zoneTv.setText(zoneLabel(hz));
            int pct = hz <= 2000 ? 0 : (hz >= 10000 ? 100 : Math.round(((hz - 2000f) / 8000f) * 100f));
            sweepProgress.setProgress(pct);
            sweepPctTv.setText(pct + "%");
            freqSeek.setProgress(Math.min(15000, hz));

            playBtn.setText(playing ? I18n.tr("■ DỪNG PHÁT", "■ STOP TONE") : I18n.tr("▶ PHÁT SÓNG SIN", "▶ PLAY SINE"));
            playBtn.setBackground(UiKit.rippleBox(
                    ctx,
                    playing ? UiKit.C_ERROR_CONTAINER : UiKit.C_AMBER_CONTAINER,
                    10f,
                    Color.TRANSPARENT,
                    0f,
                    Color.argb(50, 255, 255, 255)
            ));
            playBtn.setTextColor(playing ? UiKit.C_ON_ERROR_CONTAINER : UiKit.C_ON_AMBER);

            sweepBtn.setText(sweeping ? I18n.tr("⏸ DỪNG TẠI ĐÂY", "⏸ STOP HERE") : I18n.tr("⏩ TỰ QUÉT 2K→10K", "⏩ AUTO SWEEP 2K→10K"));
            sweepBtn.setBackground(UiKit.rippleBox(
                    ctx,
                    sweeping ? UiKit.C_ERROR_CONTAINER : UiKit.C_SURFACE_HIGH,
                    10f,
                    UiKit.C_BORDER,
                    1f,
                    Color.argb(50, 255, 255, 255)
            ));
            sweepBtn.setTextColor(sweeping ? UiKit.C_ON_ERROR_CONTAINER : UiKit.C_CYAN_TEXT);
        } finally {
            suppressSeek = false;
        }
    }

    private static String zoneLabel(int f) {
        if (f < 100) return I18n.tr("ÂM SIÊU TRẦM (SUB-BASS)", "SUB-BASS REGION");
        if (f < 300) return I18n.tr("DẢI TRẦM ẤM (MID-BASS)", "MID-BASS WARMTH");
        if (f < 1200) return I18n.tr("DẢI TRUNG ÂM (MID VOCAL)", "MIDRANGE & VOCALS");
        if (f < 3000) return I18n.tr("DẢI TRUNG CAO (HIGH MID)", "UPPER MIDRANGE");
        if (f <= 5500) return I18n.tr("VÙNG CỘNG HƯỞNG TAI (PINNA PEAK)", "EAR CANAL RESONANCE (PINNA PEAK)");
        if (f < 9000) return I18n.tr("DẢI CHÓI GẮT (TREBLE SIBILANCE)", "TREBLE SIBILANCE ZONE");
        return I18n.tr("DẢI KHÔNG GIAN & KHÍ (ULTRA-HIGH)", "AIR & ULTRA-HIGH");
    }

    private static void showTipDialog(Context ctx) {
        new AlertDialog.Builder(ctx, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(I18n.tr("Mẹo bắt đỉnh chói ống tai", "How to Find Your Ear Peak"))
                .setMessage(I18n.tr(
                        "1. Để âm lượng sóng thử khoảng 12–15%.\n\n"
                                + "2. Bấm 'Tự quét 2k→10k' và lắng nghe. Ngay khoảnh khắc tiếng rít nhô to buốt nhất trong tai, chạm 'Dừng tại đây'.\n\n"
                                + "3. Bấm 'Gán vào B4' để tự động đưa tần số đó sang Band 4 cắt chói (-3.8 dB, Q 3.2) ngay lập tức!",
                        "1. Keep the test tone level around 12–15%.\n\n"
                                + "2. Tap 'Auto Sweep 2k→10k' and listen carefully. The instant the tone sounds noticeably sharper or louder, tap 'Stop Here'.\n\n"
                                + "3. Tap 'Set Band 4' to immediately notch out that frequency (-3.8 dB, Q 3.2) on Band 4!"
                ))
                .setPositiveButton(I18n.tr("Đã hiểu", "Got it"), null)
                .show();
    }
}
