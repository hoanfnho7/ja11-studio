package com.ja11studio.app.core;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.ja11studio.app.core.Ja11Protocol.AdaptedBands;
import com.ja11studio.app.core.PeqModels.FilterType;
import com.ja11studio.app.core.PeqModels.PeqBand;
import com.ja11studio.app.core.PeqModels.PeqProfile;
import com.ja11studio.app.core.PeqModels.PeqSnapshot;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

/**
 * Native Offline Profile Vault + Non-blocking Async FiiO Hand-Picked Cloud (RSA+AES) & AutoEQ client.
 */
public final class PresetRepository {
    private static final String PREFS_NAME = "ja11_native_vault_v3";
    private static final String KEY_OFFLINE_VAULT = "offline_profiles_json";
    private static final String KEY_CLOUD_CACHE = "cloud_cache_json";

    private static final String FIIO_RSA_PUB_B64 =
            "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0mPGrgZPDCPDd9m129qy" +
            "+TV5HeLWDTJbNK5wlUAemqH3NyrOh3HUo+LbTbMf6J45AFDjNRCDiZZc3Y+uCici" +
            "9fHn0dixbtuHOdJer0U/4xHloOgYmsTwhAh56njWQAyaqoi0R3nG0bpCgsi5omlS" +
            "RqP5KyaybuKjPyZvGVn0IKnVVQx3AI1+p/5lWARv23nPNS9ehfKts5oeFdOAKgT2" +
            "mvV80TzJHbc2mKU8XoBr0VgX4Ohgq/A+Ddv0Wz0bNAQJgzrFAN1lIg2NqktcGdzD" +
            "/HHPIeGCYG2gB7ZADsGX6vGpSoeUj3anr25nojQVbZgEBeE/6nJZ793Qhq8vudep" +
            "XQIDAQAB";

    private static final String AUTOEQ_INDEX_URL =
            "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/INDEX.md";
    private static final String AUTOEQ_RAW_BASE =
            "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/";

    public interface CloudCallback {
        void onResult(List<PeqProfile> profiles, int totalRows, String notice);
    }

    private final SharedPreferences prefs;
    private final ExecutorService ioPool = Executors.newFixedThreadPool(3);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile List<AutoEqEntry> cachedAutoEqIndex = null;

    public PresetRepository(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public List<PeqProfile> getBuiltinProfiles() {
        List<PeqProfile> list = new ArrayList<>();
        list.add(new PeqProfile(
                "builtin-jd1-ear4380",
                "JD1 + JA11 | Custom Ear 4380Hz",
                "Đo chuẩn ống tai 4380Hz: Sub-bass sâu gọn, vocal tiến sáng, triệt tiêu chói rít màng LCP.",
                "curated",
                "JadeAudio JA11",
                "Chuẩn tai bạn",
                new PeqSnapshot(-12f, new PeqBand[]{
                        new PeqBand(FilterType.LSQ, 55, 1.5f, 0.71f),
                        new PeqBand(FilterType.PK, 185, -2.8f, 1.10f),
                        new PeqBand(FilterType.PK, 680, 2.0f, 1.00f),
                        new PeqBand(FilterType.PK, 4380, -3.8f, 3.20f),
                        new PeqBand(FilterType.PK, 7500, -2.5f, 1.40f)
                }),
                0,
                1732550000000L
        ));
        list.add(new PeqProfile(
                "builtin-jd1-phonk4380",
                "JD1 + JA11 | Phonk 808 (4380Hz Fix)",
                "Sub-bass 808 uy lực chắc gọn, cowbell nảy nhưng đã gọt đỉnh buốt 4380Hz nghe lâu không mỏi.",
                "curated",
                "JadeAudio JA11",
                "JA11 Studio",
                new PeqSnapshot(-10f, new PeqBand[]{
                        new PeqBand(FilterType.LSQ, 65, 3.5f, 0.71f),
                        new PeqBand(FilterType.PK, 210, -2.8f, 1.20f),
                        new PeqBand(FilterType.PK, 1600, 1.5f, 1.10f),
                        new PeqBand(FilterType.PK, 4380, -4.2f, 3.00f),
                        new PeqBand(FilterType.PK, 8000, -2.5f, 1.50f)
                }),
                0,
                1732545000000L
        ));
        list.add(new PeqProfile(
                "builtin-jd1-podcast",
                "JD1 + JA11 | Podcast & Speech",
                "Loại bỏ ù nền dải trầm và chói âm gió sibilance, giọng đọc rõ nét tự nhiên.",
                "curated",
                "JadeAudio JA11",
                "hoanfnho7",
                new PeqSnapshot(-2f, new PeqBand[]{
                        new PeqBand(FilterType.LSQ, 130, -4.5f, 0.71f),
                        new PeqBand(FilterType.PK, 250, -2.0f, 1.50f),
                        new PeqBand(FilterType.PK, 1500, 2.0f, 1.00f),
                        new PeqBand(FilterType.PK, 3000, 1.5f, 1.60f),
                        new PeqBand(FilterType.PK, 6000, -3.5f, 2.20f)
                }),
                0,
                1732540000000L
        ));
        list.add(new PeqProfile(
                "builtin-jd1-phonk-orig",
                "JD1 + JA11 | Phonk & 808 Original",
                "Bản backup nguyên gốc file Phonk & 808 Bass.xml trên máy tính của bạn.",
                "curated",
                "JadeAudio JA11",
                "Backup gốc",
                new PeqSnapshot(-4f, new PeqBand[]{
                        new PeqBand(FilterType.LSQ, 80, 3.5f, 0.70f),
                        new PeqBand(FilterType.PK, 240, -2.5f, 1.20f),
                        new PeqBand(FilterType.PK, 1800, 1.5f, 1.00f),
                        new PeqBand(FilterType.PK, 4500, -2.5f, 2.00f),
                        new PeqBand(FilterType.PK, 8000, -3.0f, 2.00f)
                }),
                0,
                1732535000000L
        ));
        list.add(new PeqProfile(
                "builtin-jd1-harman",
                "FiiO JD1 → Harman IE 2019v2",
                "Cân chỉnh FiiO JD1 bám sát đường cong chuẩn Harman In-Ear 2019.",
                "curated",
                "JadeAudio JA11",
                "AutoEQ / Harman",
                new PeqSnapshot(-8.5f, new PeqBand[]{
                        new PeqBand(FilterType.LSQ, 85, 1.8f, 0.71f),
                        new PeqBand(FilterType.PK, 195, -3.2f, 1.10f),
                        new PeqBand(FilterType.PK, 720, 1.9f, 1.00f),
                        new PeqBand(FilterType.PK, 3450, -2.5f, 2.20f),
                        new PeqBand(FilterType.PK, 7800, -3.0f, 2.00f)
                }),
                0,
                1732530000000L
        ));
        list.add(new PeqProfile(
                "builtin-flat",
                "Flat Studio Reference (0 dB)",
                "Đường đáp tuyến phẳng trung tính kiểm âm nguyên bản.",
                "curated",
                "JadeAudio JA11",
                "Reference",
                PeqSnapshot.flatNeutral(),
                0,
                1732525000000L
        ));
        return list;
    }

    public List<PeqProfile> loadVaultProfiles() {
        String raw = prefs.getString(KEY_OFFLINE_VAULT, null);
        if (raw == null || raw.isEmpty()) {
            List<PeqProfile> builtins = getBuiltinProfiles();
            saveVaultProfiles(builtins);
            return builtins;
        }
        List<PeqProfile> parsed = deserializeList(raw);
        if (parsed.isEmpty()) {
            return getBuiltinProfiles();
        }
        return parsed;
    }

    public void saveVaultProfiles(List<PeqProfile> list) {
        prefs.edit().putString(KEY_OFFLINE_VAULT, serializeList(list)).apply();
    }

    public List<PeqProfile> upsertVaultProfile(PeqProfile profile) {
        List<PeqProfile> current = loadVaultProfiles();
        List<PeqProfile> next = new ArrayList<>();
        boolean replaced = false;
        for (PeqProfile p : current) {
            if (p.id.equals(profile.id)) {
                next.add(profile);
                replaced = true;
            } else {
                next.add(p);
            }
        }
        if (!replaced) {
            next.add(0, profile);
        }
        saveVaultProfiles(next);
        return next;
    }

    public List<PeqProfile> deleteVaultProfile(String id) {
        List<PeqProfile> current = loadVaultProfiles();
        List<PeqProfile> next = new ArrayList<>();
        for (PeqProfile p : current) {
            if (!p.id.equals(id)) next.add(p);
        }
        saveVaultProfiles(next);
        return next;
    }

    public List<PeqProfile> resetVaultToDefaults() {
        List<PeqProfile> builtins = getBuiltinProfiles();
        saveVaultProfiles(builtins);
        return builtins;
    }

    public List<PeqProfile> loadCachedCloudProfiles() {
        String raw = prefs.getString(KEY_CLOUD_CACHE, null);
        if (raw == null || raw.isEmpty()) {
            return getBuiltinProfiles().subList(0, 3);
        }
        List<PeqProfile> parsed = deserializeList(raw);
        return parsed.isEmpty() ? getBuiltinProfiles().subList(0, 3) : parsed;
    }

    private void saveCachedCloudProfiles(List<PeqProfile> items) {
        List<PeqProfile> capped = items.size() > 80 ? items.subList(0, 80) : items;
        prefs.edit().putString(KEY_CLOUD_CACHE, serializeList(capped)).apply();
    }

    /**
     * Async query to official FiiO Hand-Picked server (deviceType 109 = JA11, or ALL FiiO DACs).
     * Runs entirely on background thread pool; delivers result on UI thread!
     */
    public void fetchFiioHandPickedAsync(
            final String searchQuery,
            final boolean ja11Only,
            final int pageNumber,
            final CloudCallback callback
    ) {
        ioPool.execute(() -> {
            String term = searchQuery != null ? searchQuery.trim() : "";
            try {
                if (!term.isEmpty()) {
                    int[] types = ja11Only ? new int[]{109} : new int[]{109, 110, 108, 31, 35};
                    List<PeqProfile> collected = new ArrayList<>();
                    Set<String> seen = new HashSet<>();

                    for (int dt : types) {
                        JSONObject req = new JSONObject();
                        req.put("searchValue", term);
                        req.put("deviceType", dt);
                        JSONObject res = postFiioEncrypted("/ucenter-api/search-peq", req.toString());
                        extractFiioRecords(res, collected, seen);
                    }
                    JSONObject offReq = new JSONObject();
                    offReq.put("searchValue", term);
                    offReq.put("deviceType", ja11Only ? 109 : -1);
                    JSONObject offRes = postFiioEncrypted("/ucenter-api/search-peq-official", offReq.toString());
                    extractFiioRecords(offRes, collected, seen);

                    if (!collected.isEmpty()) {
                        saveCachedCloudProfiles(collected);
                    }
                    final String notice = !collected.isEmpty()
                            ? ("Tìm thấy " + collected.size() + " profile khớp \"" + term + "\" trên FiiO Hand-Picked!")
                            : ("Không có profile nào khớp \"" + term + "\" (" + (ja11Only ? "thử chọn Mọi DAC FiiO" : "thử từ khóa khác") + ").");
                    mainHandler.post(() -> callback.onResult(collected, collected.size(), notice));
                    return;
                }

                JSONObject req = new JSONObject();
                JSONArray dtArr = new JSONArray();
                dtArr.put(109);
                if (!ja11Only) {
                    dtArr.put(110);
                    dtArr.put(108);
                }
                req.put("deviceType", dtArr);
                req.put("pageNumber", Math.max(1, pageNumber));
                req.put("pageSize", 18);
                req.put("totalRow", -1);

                JSONObject res = postFiioEncrypted("/ucenter-api/get-share-peq", req.toString());
                List<PeqProfile> list = new ArrayList<>();
                Set<String> seen = new HashSet<>();
                int total = extractFiioRecords(res, list, seen);

                if (!list.isEmpty()) {
                    if (pageNumber == 1) saveCachedCloudProfiles(list);
                    final int totalFinal = Math.max(total, list.size());
                    final String notice = "Trang " + pageNumber + " • Tổng " + totalFinal + " cấu hình trực tiếp từ FiiO Cloud!";
                    mainHandler.post(() -> callback.onResult(list, totalFinal, notice));
                } else {
                    List<PeqProfile> cached = loadCachedCloudProfiles();
                    mainHandler.post(() -> callback.onResult(cached, cached.size(), "Đang hiển thị bộ nhớ đệm Offline."));
                }
            } catch (Exception e) {
                List<PeqProfile> cached = loadCachedCloudProfiles();
                List<PeqProfile> filtered = new ArrayList<>();
                String low = term.toLowerCase(Locale.ROOT);
                for (PeqProfile p : cached) {
                    if (low.isEmpty()
                            || p.name.toLowerCase(Locale.ROOT).contains(low)
                            || p.description.toLowerCase(Locale.ROOT).contains(low)
                            || p.author.toLowerCase(Locale.ROOT).contains(low)) {
                        filtered.add(p);
                    }
                }
                final String msg = "Mạng Offline/chậm — hiển thị " + filtered.size() + " cấu hình đã lưu đệm.";
                mainHandler.post(() -> callback.onResult(filtered, filtered.size(), msg));
            }
        });
    }

    public void searchAutoEqAsync(final String query, final CloudCallback callback) {
        ioPool.execute(() -> {
            String term = (query == null || query.trim().isEmpty()) ? "fiio jd" : query.trim().toLowerCase(Locale.ROOT);
            try {
                if (cachedAutoEqIndex == null) {
                    String md = httpGetText(AUTOEQ_INDEX_URL);
                    List<AutoEqEntry> parsed = new ArrayList<>();
                    Pattern p = Pattern.compile("^-\\s+\\[([^\\]]+)\\]\\(\\./([^)]+)\\)\\s+by\\s+(.+)$", Pattern.MULTILINE);
                    Matcher m = p.matcher(md);
                    while (m.find()) {
                        parsed.add(new AutoEqEntry(m.group(1).trim(), m.group(2).trim(), m.group(3).trim()));
                    }
                    cachedAutoEqIndex = parsed;
                }

                String[] words = term.split("\\s+");
                List<AutoEqEntry> matches = new ArrayList<>();
                for (AutoEqEntry item : cachedAutoEqIndex) {
                    String hay = (item.name + " " + item.source).toLowerCase(Locale.ROOT);
                    boolean all = true;
                    for (String w : words) {
                        if (!w.isEmpty() && !hay.contains(w)) {
                            all = false;
                            break;
                        }
                    }
                    if (all) {
                        matches.add(item);
                        if (matches.size() >= 10) break;
                    }
                }

                List<PeqProfile> results = new ArrayList<>();
                for (AutoEqEntry m : matches) {
                    try {
                        String[] segs = m.relPath.split("/");
                        String lastSeg = java.net.URLDecoder.decode(segs[segs.length - 1], "UTF-8");
                        String encModel = URLEncoder.encode(lastSeg, "UTF-8").replace("+", "%20");
                        String url = AUTOEQ_RAW_BASE + m.relPath + "/" + encModel + "%20ParametricEQ.txt";
                        String txt = httpGetText(url);
                        PeqProfile prof = FiioXmlCodec.parseAutoEqTxt(txt, m.name + " — " + m.source);
                        results.add(new PeqProfile(
                                "autoeq-" + m.relPath,
                                m.name + " — " + m.source,
                                "Thông số đo phòng lab chuẩn AutoEQ quốc tế (" + m.source + ").",
                                "handpicked",
                                "JadeAudio JA11",
                                m.source,
                                prof.snapshot,
                                prof.compressedFromBands,
                                System.currentTimeMillis()
                        ));
                    } catch (Exception ignored) {
                    }
                }

                final String notice = results.isEmpty()
                        ? ("AutoEQ không có mẫu tai nghe \"" + term + "\" — hãy bấm nút Tìm FiiO Hand-Picked nếu tìm theo tên thể loại!")
                        : ("Tìm thấy " + results.size() + " mẫu đo phòng lab từ Kho AutoEQ 5000+!");
                mainHandler.post(() -> callback.onResult(results, results.size(), notice));
            } catch (Exception e) {
                mainHandler.post(() -> callback.onResult(
                        new ArrayList<>(),
                        0,
                        "Không tải được AutoEQ (kiểm tra kết nối Internet): " + e.getMessage()
                ));
            }
        });
    }

    private static int extractFiioRecords(JSONObject res, List<PeqProfile> out, Set<String> seen) {
        if (res == null || res.optInt("code") != 200) return 0;
        Object dataObj = res.opt("data");
        JSONArray arr = null;
        int totalRow = 0;
        if (dataObj instanceof JSONArray) {
            arr = (JSONArray) dataObj;
            totalRow = arr.length();
        } else if (dataObj instanceof JSONObject) {
            JSONObject d = (JSONObject) dataObj;
            arr = d.optJSONArray("records");
            totalRow = d.optInt("totalRow", arr != null ? arr.length() : 0);
        }
        if (arr == null) return 0;

        for (int i = 0; i < arr.length(); i++) {
            JSONObject rec = arr.optJSONObject(i);
            if (rec == null) continue;
            PeqProfile prof = mapFiioRecord(rec, i);
            if (prof != null && seen.add(prof.id)) {
                out.add(prof);
            }
        }
        return totalRow;
    }

    private static PeqProfile mapFiioRecord(JSONObject rec, int idx) {
        try {
            Object rawEq = rec.opt("eqParamsJson");
            JSONArray bandArr = null;
            if (rawEq instanceof String) {
                bandArr = new JSONArray((String) rawEq);
            } else if (rawEq instanceof JSONArray) {
                bandArr = (JSONArray) rawEq;
            }
            if (bandArr == null || bandArr.length() == 0) return null;

            List<PeqBand> parsed = new ArrayList<>();
            for (int i = 0; i < bandArr.length(); i++) {
                JSONObject b = bandArr.optJSONObject(i);
                if (b == null) continue;
                int ftCode = b.has("filterType") ? b.optInt("filterType", 0) : b.optInt("type", 0);
                int freq = (int) Math.round(b.has("frequency") ? b.optDouble("frequency", 1000) : b.optDouble("freq", 1000));
                float gain = (float) b.optDouble("gain", 0.0);
                float q = (float) (b.has("qValue") ? b.optDouble("qValue", 1.0) : b.optDouble("q", 1.0));
                parsed.add(new PeqBand(FilterType.fromCode(ftCode), freq, gain, q));
            }

            AdaptedBands adapted = Ja11Protocol.adaptBandsToJa11(parsed);
            int devCode = rec.optInt("deviceType", 109);
            String devModel = devCode == 109 ? "JadeAudio JA11"
                    : devCode == 110 ? "FiiO KA15"
                    : devCode == 108 ? "FiiO KA17"
                    : devCode == 31 ? "FiiO BTR13"
                    : devCode == 35 ? "FiiO BTR17"
                    : "FiiO DSP";

            String id = "fiio-cloud-" + rec.optString("id", String.valueOf(idx));
            String name = rec.optString("styleName", "FiiO Preset #" + (idx + 1));
            String author = rec.optString("peqUserName", "FiiO Community");
            String desc = rec.optString("description", "");
            if (desc.isEmpty()) desc = "Chia sẻ trên FiiO Hand-Picked (" + devModel + ")";
            float mg = (float) rec.optDouble("masterGain", 0.0);

            return new PeqProfile(
                    id,
                    name,
                    desc,
                    "handpicked",
                    devModel,
                    author,
                    new PeqSnapshot(mg, adapted.bands),
                    adapted.compressedFrom,
                    System.currentTimeMillis()
            );
        } catch (Exception e) {
            return null;
        }
    }

    private static JSONObject postFiioEncrypted(String endpointPath, String plainJson) throws Exception {
        byte[] rnd = new byte[16];
        new SecureRandom().nextBytes(rnd);
        StringBuilder hexSb = new StringBuilder(32);
        for (byte b : rnd) hexSb.append(String.format("%02x", b & 0xFF));
        String aesKeyHex = hexSb.toString();
        byte[] keyBytes = aesKeyHex.getBytes(StandardCharsets.UTF_8);

        Cipher aesEnc = Cipher.getInstance("AES/ECB/PKCS5Padding");
        aesEnc.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyBytes, "AES"));
        String cipherText = Base64.encodeToString(
                aesEnc.doFinal(plainJson.getBytes(StandardCharsets.UTF_8)),
                Base64.NO_WRAP
        );

        byte[] pubDer = Base64.decode(FIIO_RSA_PUB_B64, Base64.DEFAULT);
        PublicKey pubKey = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(pubDer));
        Cipher rsaEnc = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        rsaEnc.init(Cipher.ENCRYPT_MODE, pubKey);
        String cipherSign = Base64.encodeToString(rsaEnc.doFinal(keyBytes), Base64.NO_WRAP);

        String wireBody = new JSONObject()
                .put("cipherSign", cipherSign)
                .put("cipherText", cipherText)
                .toString();

        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://fiiocontrol.fiio.com" + endpointPath);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(14000);
            conn.setReadTimeout(14000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/vnd.fiio.v1+json, application/json");
            conn.setRequestProperty("Origin", "https://fiiocontrol.fiio.com");
            conn.setRequestProperty("Referer", "https://fiiocontrol.fiio.com/equalizer/hand-picked");
            conn.setRequestProperty("X-Request-ID", UUID.randomUUID().toString());

            byte[] out = wireBody.getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(out);
            }

            int code = conn.getResponseCode();
            InputStream is = (code >= 200 && code < 400) ? conn.getInputStream() : conn.getErrorStream();
            String respStr = readStreamUtf8(is);
            JSONObject respObj = new JSONObject(respStr);

            if (respObj.optInt("code") == 200 && respObj.has("data")) {
                String encData = respObj.optString("data", "");
                if (!encData.isEmpty() && !encData.startsWith("{") && !encData.startsWith("[")) {
                    Cipher aesDec = Cipher.getInstance("AES/ECB/PKCS5Padding");
                    aesDec.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyBytes, "AES"));
                    byte[] decBytes = aesDec.doFinal(Base64.decode(encData, Base64.DEFAULT));
                    String decJson = new String(decBytes, StandardCharsets.UTF_8).trim();
                    if (decJson.startsWith("[")) {
                        respObj.put("data", new JSONArray(decJson));
                    } else {
                        respObj.put("data", new JSONObject(decJson));
                    }
                }
            }
            return respObj;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String httpGetText(String urlStr) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(14000);
            conn.setReadTimeout(14000);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new RuntimeException("HTTP " + code);
            }
            return readStreamUtf8(conn.getInputStream());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readStreamUtf8(InputStream is) throws Exception {
        if (is == null) return "";
        try (InputStream in = is; ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int r;
            while ((r = in.read(buf)) != -1) {
                baos.write(buf, 0, r);
            }
            return baos.toString("UTF-8");
        }
    }

    private static String serializeList(List<PeqProfile> list) {
        JSONArray arr = new JSONArray();
        for (PeqProfile p : list) {
            try {
                JSONObject o = new JSONObject();
                o.put("id", p.id);
                o.put("name", p.name);
                o.put("description", p.description);
                o.put("category", p.category);
                o.put("deviceModel", p.deviceModel);
                o.put("author", p.author);
                o.put("masterGain", p.snapshot.masterGain);
                o.put("compressedFromBands", p.compressedFromBands);
                o.put("updatedAt", p.updatedAt);
                JSONArray bands = new JSONArray();
                for (int i = 0; i < 5; i++) {
                    PeqBand b = p.snapshot.bands[i];
                    JSONObject bo = new JSONObject();
                    bo.put("type", b.type.label);
                    bo.put("freq", b.freq);
                    bo.put("gain", b.gain);
                    bo.put("q", b.q);
                    bands.put(bo);
                }
                o.put("bands", bands);
                arr.put(o);
            } catch (Exception ignored) {
            }
        }
        return arr.toString();
    }

    private static List<PeqProfile> deserializeList(String json) {
        List<PeqProfile> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                JSONArray ba = o.optJSONArray("bands");
                PeqBand[] bands = new PeqBand[5];
                for (int b = 0; b < 5; b++) {
                    JSONObject bo = ba != null ? ba.optJSONObject(b) : null;
                    if (bo != null) {
                        bands[b] = new PeqBand(
                                FilterType.fromString(bo.optString("type", "PK")),
                                bo.optInt("freq", 1000),
                                (float) bo.optDouble("gain", 0.0),
                                (float) bo.optDouble("q", 1.0)
                        );
                    }
                }
                out.add(new PeqProfile(
                        o.optString("id"),
                        o.optString("name"),
                        o.optString("description"),
                        o.optString("category", "personal"),
                        o.optString("deviceModel", "JadeAudio JA11"),
                        o.optString("author", "User"),
                        new PeqSnapshot((float) o.optDouble("masterGain", 0.0), bands),
                        o.optInt("compressedFromBands", 0),
                        o.optLong("updatedAt", System.currentTimeMillis())
                ));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static final class AutoEqEntry {
        final String name;
        final String relPath;
        final String source;

        AutoEqEntry(String name, String relPath, String source) {
            this.name = name;
            this.relPath = relPath;
            this.source = source;
        }
    }
}
