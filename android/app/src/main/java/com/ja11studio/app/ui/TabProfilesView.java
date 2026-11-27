package com.ja11studio.app.ui;

import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.ja11studio.app.core.FiioXmlCodec;
import com.ja11studio.app.core.PeqModels.HardwareState;
import com.ja11studio.app.core.PeqModels.PeqBand;
import com.ja11studio.app.core.PeqModels.PeqProfile;
import com.ja11studio.app.core.PeqModels.PeqSnapshot;
import com.ja11studio.app.core.PresetRepository;
import com.ja11studio.app.usb.Ja11UsbController;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Tab 3 (Native): Kho Profile & XML — Pinned Top Mini-PEQ Graph + Offline Vault + Async FiiO Cloud + XML Editor.
 */
public final class TabProfilesView extends LinearLayout {
    public interface HostActions {
        void onRequestImportXml();
        void onExportXmlFile(String filename, String xmlContent);
        void onVaultUpdated(List<PeqProfile> nextVault);
        void showToast(String msg);
    }

    private final Ja11UsbController controller;
    private final PresetRepository repository;
    private final HostActions hostActions;

    private boolean onlineMode = false;
    private boolean showMiniGraph = true;
    private boolean showSaveDrawer = false;
    private boolean cloudJa11Only = true;
    private int cloudPage = 1;
    private int cloudTotal = 0;
    private boolean loadedCloudOnce = false;

    private List<PeqProfile> vaultProfiles;
    private List<PeqProfile> cloudProfiles;
    private String offlineFilter = "";

    // Pinned Top Curve Monitor
    private TextView stickyLabelTv;
    private TextView stickyPreampTv;
    private TextView toggleGraphBtn;
    private PeqGraphView miniGraph;

    // Source Switcher & Sections
    private TextView tabOfflineBtn;
    private TextView tabOnlineBtn;
    private LinearLayout offlineSection;
    private LinearLayout onlineSection;
    private LinearLayout saveDrawerBody;
    private EditText newNameEt;
    private EditText newNoteEt;

    // Online controls
    private TextView filterJa11Btn;
    private TextView filterAllBtn;
    private EditText cloudSearchEt;
    private TextView cloudNoticeTv;
    private TextView pageInfoTv;
    private TextView prevPageBtn;
    private TextView nextPageBtn;

    // List container
    private TextView countBadge;
    private TextView resetVaultBtn;
    private LinearLayout cardsContainer;

    public TabProfilesView(
            Context ctx,
            Ja11UsbController controller,
            PresetRepository repository,
            HostActions hostActions
    ) {
        super(ctx);
        this.controller = controller;
        this.repository = repository;
        this.hostActions = hostActions;
        this.vaultProfiles = repository.loadVaultProfiles();
        this.cloudProfiles = repository.loadCachedCloudProfiles();

        setOrientation(VERTICAL);

        // 1. Pinned Live Mini-PEQ Curve Header (NEVER scrolls away -> watch curve morph live!)
        LinearLayout pinnedWrap = new LinearLayout(ctx);
        pinnedWrap.setOrientation(VERTICAL);
        int padH = UiKit.dp(ctx, 12f);
        pinnedWrap.setPadding(padH, UiKit.dp(ctx, 8f), padH, UiKit.dp(ctx, 8f));
        pinnedWrap.setBackgroundColor(UiKit.C_SURFACE);

        LinearLayout pinnedCard = UiKit.cardContainer(ctx, 9f);
        LinearLayout pHdr = new LinearLayout(ctx);
        pHdr.setOrientation(HORIZONTAL);
        pHdr.setGravity(Gravity.CENTER_VERTICAL);

        stickyLabelTv = UiKit.label(ctx, "● Đáp tuyến Live: Custom Ear 4380Hz", 11f, UiKit.C_AMBER_TEXT, UiKit.FONT_MONO_BOLD);
        stickyLabelTv.setSingleLine(true);
        stickyLabelTv.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        stickyPreampTv = UiKit.badge(ctx, "Pre -12.0dB", UiKit.C_SURFACE_HIGH, UiKit.C_CYAN_TEXT);
        toggleGraphBtn = UiKit.actionButton(ctx, "Thu gọn", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_MUTED, Color.TRANSPARENT, 6f, 9.5f);
        toggleGraphBtn.setMinHeight(UiKit.dp(ctx, 26f));
        toggleGraphBtn.setPadding(UiKit.dp(ctx, 8f), UiKit.dp(ctx, 2f), UiKit.dp(ctx, 8f), UiKit.dp(ctx, 2f));
        LayoutParams tgLp = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tgLp.leftMargin = UiKit.dp(ctx, 5f);
        toggleGraphBtn.setLayoutParams(tgLp);
        toggleGraphBtn.setOnClickListener(v -> {
            showMiniGraph = !showMiniGraph;
            miniGraph.setVisibility(showMiniGraph ? VISIBLE : GONE);
            toggleGraphBtn.setText(showMiniGraph ? "Thu gọn" : "Hiện đồ thị");
        });

        pHdr.addView(stickyLabelTv);
        pHdr.addView(stickyPreampTv);
        pHdr.addView(toggleGraphBtn);
        pinnedCard.addView(pHdr, UiKit.matchWrapBottomMargin(ctx, 6f));

        miniGraph = new PeqGraphView(ctx, true);
        pinnedCard.addView(miniGraph);
        pinnedWrap.addView(pinnedCard);
        addView(pinnedWrap, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // 2. Scrollable Body below Pinned Graph
        ScrollView scroll = new ScrollView(ctx);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        LinearLayout body = new LinearLayout(ctx);
        body.setOrientation(VERTICAL);
        body.setPadding(padH, UiKit.dp(ctx, 4f), padH, UiKit.dp(ctx, 24f));
        scroll.addView(body, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        addView(scroll, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // Segmented Source Switcher
        LinearLayout segRow = new LinearLayout(ctx);
        segRow.setOrientation(HORIZONTAL);
        int sp4 = UiKit.dp(ctx, 4f);
        segRow.setPadding(sp4, sp4, sp4, sp4);
        segRow.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_LOW, 10f, UiKit.C_BORDER, 0.8f));

        tabOfflineBtn = UiKit.actionButton(ctx, "💾 Offline & FiiO XML", UiKit.C_SURFACE_HIGH, UiKit.C_AMBER_TEXT, Color.TRANSPARENT, 8f, 11f);
        tabOfflineBtn.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        tabOfflineBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            setSourceMode(false);
        });

        tabOnlineBtn = UiKit.actionButton(ctx, "🌐 FiiO Online Cloud", Color.TRANSPARENT, UiKit.C_TEXT_MUTED, Color.TRANSPARENT, 8f, 11f);
        tabOnlineBtn.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        tabOnlineBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            setSourceMode(true);
        });

        segRow.addView(tabOfflineBtn);
        segRow.addView(tabOnlineBtn);
        body.addView(segRow, UiKit.matchWrapBottomMargin(ctx, 8f));

        // Import / Export XML Buttons
        LinearLayout ioRow = new LinearLayout(ctx);
        ioRow.setOrientation(HORIZONTAL);
        TextView importBtn = UiKit.actionButton(ctx, "📥 NHẬP FILE .XML", UiKit.C_SURFACE_HIGH, UiKit.C_CYAN_TEXT, UiKit.C_BORDER, 10f, 10.5f);
        LayoutParams imLp = new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        imLp.rightMargin = UiKit.dp(ctx, 6f);
        importBtn.setLayoutParams(imLp);
        importBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            hostActions.onRequestImportXml();
        });

        TextView exportBtn = UiKit.actionButton(ctx, "📤 XUẤT .XML HIỆN TẠI", UiKit.C_SURFACE_HIGH, UiKit.C_AMBER_TEXT, UiKit.C_BORDER, 10f, 10.5f);
        exportBtn.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        exportBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            String name = controller.getActiveProfileLabel();
            String xml = FiioXmlCodec.serializeFiioXml(name, "Exported from JA11 Studio Android v3.0", controller.getLivePeq());
            String safeFile = name.replaceAll("[<>:\"/\\\\|?*]+", "_") + ".xml";
            hostActions.onExportXmlFile(safeFile, xml);
        });

        ioRow.addView(importBtn);
        ioRow.addView(exportBtn);
        body.addView(ioRow, UiKit.matchWrapBottomMargin(ctx, 8f));

        // 3A. Offline Search & Save Drawer
        offlineSection = new LinearLayout(ctx);
        offlineSection.setOrientation(VERTICAL);

        EditText offSearch = styledInput(ctx, "🔍 Lọc nhanh tên profile trong kho Offline...");
        offSearch.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override
            public void afterTextChanged(Editable s) {
                offlineFilter = s.toString().trim();
                rebuildCards();
            }
        });
        offlineSection.addView(offSearch, UiKit.matchWrapBottomMargin(ctx, 8f));

        LinearLayout saveCard = UiKit.cardContainer(ctx, 10f);
        TextView saveToggle = UiKit.actionButton(ctx, "＋ Lưu Cấu Hình Đang Chỉnh Vào Kho Offline ▾", UiKit.C_SURFACE_CONTAINER, UiKit.C_AMBER_TEXT, Color.TRANSPARENT, 8f, 11f);
        saveToggle.setOnClickListener(v -> {
            showSaveDrawer = !showSaveDrawer;
            saveDrawerBody.setVisibility(showSaveDrawer ? VISIBLE : GONE);
        });
        saveCard.addView(saveToggle);

        saveDrawerBody = new LinearLayout(ctx);
        saveDrawerBody.setOrientation(VERTICAL);
        saveDrawerBody.setVisibility(GONE);
        saveDrawerBody.setPadding(0, UiKit.dp(ctx, 8f), 0, 0);

        newNameEt = styledInput(ctx, "Tên Profile (VD: FiiO JD1 - Cắt chói 4.38kHz)");
        newNoteEt = styledInput(ctx, "Ghi chú âm sắc (tùy chọn)");
        TextView commitVaultBtn = UiKit.actionButton(ctx, "📦 CẤT VÀO KHO OFFLINE", UiKit.C_AMBER_CONTAINER, UiKit.C_ON_AMBER, Color.TRANSPARENT, 8f, 11f);
        commitVaultBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            String nm = newNameEt.getText().toString().trim();
            if (nm.isEmpty()) {
                hostActions.showToast("Vui lòng nhập Tên Profile trước khi lưu!");
                return;
            }
            PeqProfile created = new PeqProfile(
                    "personal-" + System.currentTimeMillis(),
                    nm,
                    newNoteEt.getText().toString().trim(),
                    "personal",
                    "JadeAudio JA11",
                    "Bạn",
                    controller.getLivePeq(),
                    0,
                    System.currentTimeMillis()
            );
            vaultProfiles = repository.upsertVaultProfile(created);
            hostActions.onVaultUpdated(vaultProfiles);
            newNameEt.setText("");
            newNoteEt.setText("");
            showSaveDrawer = false;
            saveDrawerBody.setVisibility(GONE);
            rebuildCards();
            hostActions.showToast("Đã lưu \"" + nm + "\" vào Kho Offline!");
        });

        saveDrawerBody.addView(newNameEt, UiKit.matchWrapBottomMargin(ctx, 6f));
        saveDrawerBody.addView(newNoteEt, UiKit.matchWrapBottomMargin(ctx, 8f));
        saveDrawerBody.addView(commitVaultBtn);
        saveCard.addView(saveDrawerBody);
        offlineSection.addView(saveCard, UiKit.matchWrapBottomMargin(ctx, 8f));
        body.addView(offlineSection);

        // 3B. Online FiiO Hand-Picked & AutoEQ Search Section
        onlineSection = UiKit.cardContainer(ctx, 10f);
        onlineSection.setVisibility(GONE);

        LinearLayout filterRow = new LinearLayout(ctx);
        filterRow.setOrientation(HORIZONTAL);
        filterJa11Btn = UiKit.actionButton(ctx, "JA11 (814+)", UiKit.C_AMBER_CONTAINER, UiKit.C_ON_AMBER, Color.TRANSPARENT, 7f, 10f);
        filterJa11Btn.setMinHeight(UiKit.dp(ctx, 30f));
        filterJa11Btn.setOnClickListener(v -> {
            cloudJa11Only = true;
            refreshCloudFilterButtons();
            triggerFiioFetch(1);
        });

        filterAllBtn = UiKit.actionButton(ctx, "Mọi DAC FiiO", UiKit.C_SURFACE_CONTAINER, UiKit.C_TEXT_MUTED, Color.TRANSPARENT, 7f, 10f);
        filterAllBtn.setMinHeight(UiKit.dp(ctx, 30f));
        LayoutParams faLp = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        faLp.leftMargin = UiKit.dp(ctx, 6f);
        filterAllBtn.setLayoutParams(faLp);
        filterAllBtn.setOnClickListener(v -> {
            cloudJa11Only = false;
            refreshCloudFilterButtons();
            triggerFiioFetch(1);
        });

        filterRow.addView(filterJa11Btn);
        filterRow.addView(filterAllBtn);
        onlineSection.addView(filterRow, UiKit.matchWrapBottomMargin(ctx, 8f));

        cloudSearchEt = styledInput(ctx, "Tìm tên profile FiiO (podcast, vocal, jd1) hoặc tai nghe...");
        onlineSection.addView(cloudSearchEt, UiKit.matchWrapBottomMargin(ctx, 8f));

        LinearLayout searchBtns = new LinearLayout(ctx);
        searchBtns.setOrientation(HORIZONTAL);
        TextView fiioSearchBtn = UiKit.actionButton(ctx, "🔎 TÌM FIIO HAND-PICKED", UiKit.C_AMBER_CONTAINER, UiKit.C_ON_AMBER, Color.TRANSPARENT, 8f, 10.5f);
        LayoutParams fsLp = new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        fsLp.rightMargin = UiKit.dp(ctx, 6f);
        fiioSearchBtn.setLayoutParams(fsLp);
        fiioSearchBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            triggerFiioFetch(1);
        });

        TextView autoEqBtn = UiKit.actionButton(ctx, "🌐 ĐO AUTOEQ 5000+", UiKit.C_SURFACE_HIGH, UiKit.C_CYAN_TEXT, UiKit.C_BORDER, 8f, 10.5f);
        autoEqBtn.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        autoEqBtn.setOnClickListener(v -> {
            UiKit.hapticTap(v);
            cloudNoticeTv.setText("Đang tra cứu Kho AutoEQ 5000+ mẫu tai nghe...");
            repository.searchAutoEqAsync(cloudSearchEt.getText().toString(), (profiles, totalRows, notice) -> {
                cloudProfiles = profiles;
                cloudTotal = totalRows;
                cloudPage = 1;
                cloudNoticeTv.setText(notice);
                rebuildCards();
            });
        });

        searchBtns.addView(fiioSearchBtn);
        searchBtns.addView(autoEqBtn);
        onlineSection.addView(searchBtns, UiKit.matchWrapBottomMargin(ctx, 8f));

        LinearLayout pageRow = new LinearLayout(ctx);
        pageRow.setOrientation(HORIZONTAL);
        pageRow.setGravity(Gravity.CENTER_VERTICAL);
        cloudNoticeTv = UiKit.label(ctx, "Kho trực tuyến FiiO Hand-Picked & AutoEQ.", 10f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO);
        cloudNoticeTv.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        prevPageBtn = UiKit.actionButton(ctx, "◀", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_PRIMARY, Color.TRANSPARENT, 6f, 10f);
        prevPageBtn.setMinHeight(UiKit.dp(ctx, 28f));
        prevPageBtn.setOnClickListener(v -> {
            if (cloudPage > 1) triggerFiioFetch(cloudPage - 1);
        });
        pageInfoTv = UiKit.label(ctx, "Tr.1", 10f, UiKit.C_AMBER_TEXT, UiKit.FONT_MONO_BOLD);
        pageInfoTv.setPadding(UiKit.dp(ctx, 6f), 0, UiKit.dp(ctx, 6f), 0);
        nextPageBtn = UiKit.actionButton(ctx, "▶", UiKit.C_SURFACE_HIGH, UiKit.C_TEXT_PRIMARY, Color.TRANSPARENT, 6f, 10f);
        nextPageBtn.setMinHeight(UiKit.dp(ctx, 28f));
        nextPageBtn.setOnClickListener(v -> {
            if (cloudPage * 18 < cloudTotal) triggerFiioFetch(cloudPage + 1);
        });

        pageRow.addView(cloudNoticeTv);
        pageRow.addView(prevPageBtn);
        pageRow.addView(pageInfoTv);
        pageRow.addView(nextPageBtn);
        onlineSection.addView(pageRow);
        body.addView(onlineSection, UiKit.matchWrapBottomMargin(ctx, 10f));

        // 4. List Header
        LinearLayout listHdr = new LinearLayout(ctx);
        listHdr.setOrientation(HORIZONTAL);
        listHdr.setGravity(Gravity.CENTER_VERTICAL);
        TextView listTitle = UiKit.label(ctx, "Danh Sách Profile", 14.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
        countBadge = UiKit.badge(ctx, "6 Cấu hình", UiKit.C_SURFACE_HIGH, UiKit.C_CYAN_TEXT);
        LayoutParams cbLp = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cbLp.leftMargin = UiKit.dp(ctx, 6f);
        countBadge.setLayoutParams(cbLp);

        View spacer = new View(ctx);
        spacer.setLayoutParams(new LayoutParams(0, 1, 1f));

        resetVaultBtn = UiKit.label(ctx, "Khôi phục mẫu gốc", 10.5f, UiKit.C_TEXT_MUTED, UiKit.FONT_MONO);
        resetVaultBtn.setOnClickListener(v -> {
            vaultProfiles = repository.resetVaultToDefaults();
            hostActions.onVaultUpdated(vaultProfiles);
            rebuildCards();
            hostActions.showToast("Đã khôi phục 6 Profile mẫu mặc định.");
        });

        listHdr.addView(listTitle);
        listHdr.addView(countBadge);
        listHdr.addView(spacer);
        listHdr.addView(resetVaultBtn);
        body.addView(listHdr, UiKit.matchWrapBottomMargin(ctx, 8f));

        cardsContainer = new LinearLayout(ctx);
        cardsContainer.setOrientation(VERTICAL);
        body.addView(cardsContainer);

        rebuildCards();
    }

    public void reloadVaultFromDisk() {
        this.vaultProfiles = repository.loadVaultProfiles();
        rebuildCards();
    }

    public void refreshFromController() {
        HardwareState hw = controller.getHardwareState();
        PeqSnapshot live = controller.getLivePeq();
        PeqSnapshot saved = controller.getSavedSnapshot();
        String label = controller.getActiveProfileLabel();
        boolean bypassed = (hw.eqPreset == 4);

        stickyLabelTv.setText("● Đáp tuyến Live: " + (bypassed ? "EQ TẮT (0 dB)" : label));
        stickyPreampTv.setText(String.format(Locale.US, "Pre %+.1fdB", live.masterGain));
        miniGraph.updateState(live, saved, 3, bypassed, null);
        rebuildCards();
    }

    private void setSourceMode(boolean online) {
        Context ctx = getContext();
        this.onlineMode = online;
        offlineSection.setVisibility(online ? GONE : VISIBLE);
        onlineSection.setVisibility(online ? VISIBLE : GONE);
        resetVaultBtn.setVisibility(online ? GONE : VISIBLE);

        tabOfflineBtn.setBackground(UiKit.roundedBox(ctx, online ? Color.TRANSPARENT : UiKit.C_SURFACE_HIGH, 8f, Color.TRANSPARENT, 0f));
        tabOfflineBtn.setTextColor(online ? UiKit.C_TEXT_MUTED : UiKit.C_AMBER_TEXT);
        tabOnlineBtn.setBackground(UiKit.roundedBox(ctx, online ? UiKit.C_SURFACE_HIGH : Color.TRANSPARENT, 8f, Color.TRANSPARENT, 0f));
        tabOnlineBtn.setTextColor(online ? UiKit.C_CYAN_TEXT : UiKit.C_TEXT_MUTED);

        if (online && !loadedCloudOnce) {
            loadedCloudOnce = true;
            triggerFiioFetch(1);
        } else {
            rebuildCards();
        }
    }

    private void refreshCloudFilterButtons() {
        Context ctx = getContext();
        filterJa11Btn.setBackground(UiKit.roundedBox(ctx, cloudJa11Only ? UiKit.C_AMBER_CONTAINER : UiKit.C_SURFACE_CONTAINER, 7f, Color.TRANSPARENT, 0f));
        filterJa11Btn.setTextColor(cloudJa11Only ? UiKit.C_ON_AMBER : UiKit.C_TEXT_MUTED);
        filterAllBtn.setBackground(UiKit.roundedBox(ctx, !cloudJa11Only ? UiKit.C_AMBER_CONTAINER : UiKit.C_SURFACE_CONTAINER, 7f, Color.TRANSPARENT, 0f));
        filterAllBtn.setTextColor(!cloudJa11Only ? UiKit.C_ON_AMBER : UiKit.C_TEXT_MUTED);
    }

    private void triggerFiioFetch(int page) {
        cloudNoticeTv.setText("Đang kết nối máy chủ FiiO Hand-Picked...");
        String q = cloudSearchEt.getText().toString();
        repository.fetchFiioHandPickedAsync(q, cloudJa11Only, page, (profiles, totalRows, notice) -> {
            cloudProfiles = profiles;
            cloudTotal = totalRows;
            cloudPage = page;
            cloudNoticeTv.setText(notice);
            pageInfoTv.setText("Tr." + page);
            rebuildCards();
        });
    }

    private void rebuildCards() {
        Context ctx = getContext();
        cardsContainer.removeAllViews();
        String activeName = controller.getActiveProfileLabel();

        List<PeqProfile> list = new ArrayList<>();
        if (onlineMode) {
            list.addAll(cloudProfiles);
        } else {
            String q = offlineFilter.toLowerCase(Locale.ROOT);
            for (PeqProfile p : vaultProfiles) {
                if (q.isEmpty()
                        || p.name.toLowerCase(Locale.ROOT).contains(q)
                        || p.description.toLowerCase(Locale.ROOT).contains(q)
                        || p.author.toLowerCase(Locale.ROOT).contains(q)) {
                    list.add(p);
                }
            }
        }

        countBadge.setText(list.size() + " Cấu hình");

        if (list.isEmpty()) {
            LinearLayout empty = UiKit.cardContainer(ctx, 20f);
            empty.setGravity(Gravity.CENTER);
            empty.addView(UiKit.label(ctx, "Không tìm thấy cấu hình phù hợp.", 13f, UiKit.C_TEXT_MUTED, UiKit.FONT_SANS));
            cardsContainer.addView(empty);
            return;
        }

        for (final PeqProfile prof : list) {
            boolean isActive = prof.name.equals(activeName);
            LinearLayout card = UiKit.cardContainer(ctx, 11f);
            card.setBackground(UiKit.roundedBox(
                    ctx,
                    isActive ? UiKit.C_SURFACE_CONTAINER : UiKit.C_SURFACE_LOW,
                    12f,
                    isActive ? UiKit.C_AMBER_CONTAINER : UiKit.C_BORDER,
                    isActive ? 1.4f : 0.8f
            ));

            LinearLayout top = new LinearLayout(ctx);
            top.setOrientation(HORIZONTAL);
            top.setGravity(Gravity.CENTER_VERTICAL);

            LinearLayout titleCol = new LinearLayout(ctx);
            titleCol.setOrientation(VERTICAL);
            titleCol.setLayoutParams(new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

            TextView tTv = UiKit.label(ctx, prof.name, 14.5f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_SANS_BOLD);
            String sub = "Bởi " + prof.author + " • " + prof.deviceModel
                    + (prof.compressedFromBands > 5 ? (" (Gộp từ " + prof.compressedFromBands + "-Band)") : "");
            TextView sTv = UiKit.label(ctx, sub, 10f, UiKit.C_AMBER_TEXT, UiKit.FONT_MONO);
            titleCol.addView(tTv);
            titleCol.addView(sTv);

            TextView preBadge = UiKit.badge(
                    ctx,
                    String.format(Locale.US, "Pre %+.1f dB", prof.snapshot.masterGain),
                    UiKit.C_SURFACE_HIGH,
                    Math.abs(prof.snapshot.masterGain) < 0.05f ? UiKit.C_GREEN : UiKit.C_AMBER_TEXT
            );

            top.addView(titleCol);
            top.addView(preBadge);
            card.addView(top, UiKit.matchWrapBottomMargin(ctx, 5f));

            if (!prof.description.isEmpty()) {
                TextView dTv = UiKit.label(ctx, prof.description, 12f, UiKit.C_TEXT_MUTED, UiKit.FONT_SANS);
                dTv.setMaxLines(2);
                card.addView(dTv, UiKit.matchWrapBottomMargin(ctx, 6f));
            }

            // 5-Band summary box
            StringBuilder bSb = new StringBuilder();
            for (int i = 0; i < 5; i++) {
                PeqBand b = prof.snapshot.bands[i];
                if (i > 0) bSb.append("  •  ");
                String fStr = b.freq >= 1000 ? String.format(Locale.US, "%.1fk", b.freq / 1000f).replace(".0k", "k") : (b.freq + "Hz");
                bSb.append("B").append(i + 1).append(' ').append(fStr).append(String.format(Locale.US, " %+.1fdB", b.gain));
            }
            TextView bandsSummary = UiKit.label(ctx, bSb.toString(), 9.8f, UiKit.C_TEXT_PRIMARY, UiKit.FONT_MONO);
            int p8 = UiKit.dp(ctx, 8f);
            bandsSummary.setPadding(p8, p8, p8, p8);
            bandsSummary.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_LOWEST, 8f, Color.TRANSPARENT, 0f));
            card.addView(bandsSummary, UiKit.matchWrapBottomMargin(ctx, 8f));

            // Action row
            LinearLayout actRow = new LinearLayout(ctx);
            actRow.setOrientation(HORIZONTAL);

            boolean isSyncing = controller.getHardwareState().syncing;
            TextView liveBtn = UiKit.actionButton(
                    ctx,
                    isActive ? (isSyncing ? "⏳ ĐANG GỬI..." : "✓ ĐANG ÁP DỤNG") : "⚡ NGHE THỬ LIVE (RAM)",
                    isActive ? UiKit.C_AMBER_CONTAINER : UiKit.C_SURFACE_HIGH,
                    isActive ? UiKit.C_ON_AMBER : UiKit.C_TEXT_PRIMARY,
                    Color.TRANSPARENT,
                    8f,
                    10.5f
            );
            LayoutParams lbLp = new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lbLp.rightMargin = UiKit.dp(ctx, 6f);
            liveBtn.setLayoutParams(lbLp);
            liveBtn.setOnClickListener(v -> {
                UiKit.hapticTap(v);
                controller.applyProfileLive(prof.snapshot, prof.name);
            });
            actRow.addView(liveBtn);

            if (onlineMode) {
                TextView saveOffBtn = UiKit.actionButton(ctx, "＋Kho", UiKit.C_SURFACE_HIGH, UiKit.C_AMBER_TEXT, Color.TRANSPARENT, 8f, 10.5f);
                LayoutParams soLp = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                soLp.rightMargin = UiKit.dp(ctx, 6f);
                saveOffBtn.setLayoutParams(soLp);
                saveOffBtn.setOnClickListener(v -> {
                    UiKit.hapticTap(v);
                    PeqProfile copy = new PeqProfile(
                            prof.id, prof.name, prof.description, "personal",
                            prof.deviceModel, prof.author, prof.snapshot, prof.compressedFromBands, System.currentTimeMillis()
                    );
                    vaultProfiles = repository.upsertVaultProfile(copy);
                    hostActions.onVaultUpdated(vaultProfiles);
                    hostActions.showToast("Đã cất \"" + prof.name + "\" vào Kho Offline!");
                });
                actRow.addView(saveOffBtn);
            }

            TextView xmlBtn = UiKit.actionButton(ctx, "{ }", UiKit.C_SURFACE_HIGH, UiKit.C_CYAN_TEXT, Color.TRANSPARENT, 8f, 11f);
            xmlBtn.setOnClickListener(v -> {
                UiKit.hapticTap(v);
                showXmlEditorDialog(ctx, prof);
            });
            actRow.addView(xmlBtn);

            if (!onlineMode && "personal".equals(prof.category)) {
                TextView delBtn = UiKit.actionButton(ctx, "✕", UiKit.C_SURFACE_HIGH, UiKit.C_ERROR, Color.TRANSPARENT, 8f, 11f);
                LayoutParams dlLp = new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                dlLp.leftMargin = UiKit.dp(ctx, 6f);
                delBtn.setLayoutParams(dlLp);
                delBtn.setOnClickListener(v -> {
                    UiKit.hapticTap(v);
                    vaultProfiles = repository.deleteVaultProfile(prof.id);
                    hostActions.onVaultUpdated(vaultProfiles);
                    rebuildCards();
                    hostActions.showToast("Đã xóa \"" + prof.name + "\".");
                });
                actRow.addView(delBtn);
            }

            card.addView(actRow);
            cardsContainer.addView(card, UiKit.matchWrapBottomMargin(ctx, 8f));
        }
    }

    private void showXmlEditorDialog(final Context ctx, final PeqProfile prof) {
        final String initialXml = FiioXmlCodec.serializeFiioXml(prof.name, prof.description, prof.snapshot);
        final EditText xmlEt = new EditText(ctx);
        xmlEt.setText(initialXml);
        xmlEt.setTypeface(UiKit.FONT_MONO);
        xmlEt.setTextSize(11f);
        xmlEt.setTextColor(UiKit.C_TEXT_PRIMARY);
        xmlEt.setBackgroundColor(UiKit.C_SURFACE_LOWEST);
        int p10 = UiKit.dp(ctx, 10f);
        xmlEt.setPadding(p10, p10, p10, p10);
        xmlEt.setHorizontallyScrolling(true);
        xmlEt.setMaxLines(18);

        new AlertDialog.Builder(ctx, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Mã nguồn XML: " + prof.name)
                .setView(xmlEt)
                .setPositiveButton("⚡ Nạp vào RAM", (d, w) -> {
                    try {
                        PeqProfile parsed = FiioXmlCodec.parseFiioXml(xmlEt.getText().toString(), prof.name);
                        controller.applyProfileLive(parsed.snapshot, parsed.name);
                        hostActions.showToast("Đã nạp mã XML \"" + parsed.name + "\" vào RAM!");
                    } catch (Exception e) {
                        hostActions.showToast("Lỗi cú pháp XML: " + e.getMessage());
                    }
                })
                .setNeutralButton("Xuất .XML", (d, w) -> {
                    String safe = prof.name.replaceAll("[<>:\"/\\\\|?*]+", "_") + ".xml";
                    hostActions.onExportXmlFile(safe, xmlEt.getText().toString());
                })
                .setNegativeButton("Sao chép", (d, w) -> {
                    ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) {
                        cm.setPrimaryClip(ClipData.newPlainText("FiiO XML", xmlEt.getText().toString()));
                        hostActions.showToast("Đã sao chép mã XML vào bộ nhớ đệm!");
                    }
                })
                .show();
    }

    private static EditText styledInput(Context ctx, String hint) {
        EditText et = new EditText(ctx);
        et.setHint(hint);
        et.setHintTextColor(UiKit.C_OUTLINE);
        et.setTextColor(UiKit.C_TEXT_PRIMARY);
        et.setTextSize(13f);
        et.setSingleLine(true);
        int px = UiKit.dp(ctx, 12f);
        int py = UiKit.dp(ctx, 9f);
        et.setPadding(px, py, px, py);
        et.setBackground(UiKit.roundedBox(ctx, UiKit.C_SURFACE_CONTAINER, 9f, UiKit.C_BORDER, 0.8f));
        return et;
    }
}
