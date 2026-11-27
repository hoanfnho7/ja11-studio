package com.ja11studio.app.core;

import com.ja11studio.app.core.Ja11Protocol.AdaptedBands;
import com.ja11studio.app.core.PeqModels.FilterType;
import com.ja11studio.app.core.PeqModels.PeqBand;
import com.ja11studio.app.core.PeqModels.PeqProfile;
import com.ja11studio.app.core.PeqModels.PeqSnapshot;

import org.json.JSONArray;
import org.json.JSONObject;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import java.io.StringReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

/**
 * Bidirectional codec for official FiiO DSP XML (<FiiO_DSP model="JadeAudio JA11">),
 * <FiiO_PEQ_Profile>, AutoEQ ParametricEQ.txt, and JSON presets.
 */
public final class FiioXmlCodec {
    private static final Pattern PREAMP_PATTERN =
            Pattern.compile("^Preamp:\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*dB", Pattern.CASE_INSENSITIVE);
    private static final Pattern FILTER_PATTERN =
            Pattern.compile("^Filter\\s+\\d+:\\s+ON\\s+([A-Z]+)\\s+Fc\\s+(\\d+(?:\\.\\d+)?)\\s*Hz\\s+Gain\\s+([+-]?\\d+(?:\\.\\d+)?)\\s*dB\\s+Q\\s+(\\d+(?:\\.\\d+)?)", Pattern.CASE_INSENSITIVE);

    private FiioXmlCodec() {}

    private static String escapeXml(String str) {
        if (str == null) return "";
        return str.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }

    private static String fmtNum(float v) {
        if (Math.abs(v - Math.round(v)) < 0.001f) {
            return String.valueOf(Math.round(v));
        }
        String s = String.format(Locale.US, "%.2f", v);
        if (s.endsWith("0")) s = s.substring(0, s.length() - 1);
        return s;
    }

    public static String serializeFiioXml(String name, String description, PeqSnapshot snap) {
        StringBuilder sb = new StringBuilder(768);
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        sb.append("<FiiO_DSP model=\"JadeAudio JA11\" version=\"0.0.1\">\n");
        sb.append("  <module name=\"EQ\">\n");
        sb.append("    <eqGroup>\n");
        sb.append("      <param name=\"masterGain\">").append(fmtNum(snap.masterGain)).append("</param>\n");
        sb.append("      <eqList>\n");
        for (int i = 0; i < 5; i++) {
            PeqBand b = snap.bands[i];
            sb.append("        <eq index=\"").append(i).append("\">\n");
            sb.append("          <param name=\"type\">").append(b.type.code).append("</param>\n");
            sb.append("          <param name=\"freq\">").append(b.freq).append("</param>\n");
            sb.append("          <param name=\"gain\">").append(fmtNum(b.gain)).append("</param>\n");
            sb.append("          <param name=\"q\">").append(fmtNum(b.q)).append("</param>\n");
            sb.append("        </eq>\n");
        }
        sb.append("      </eqList>\n");
        sb.append("    </eqGroup>\n");
        sb.append("  </module>\n");
        sb.append("  <styleName>").append(escapeXml(name != null ? name : "JA11 Custom")).append("</styleName>\n");
        if (description != null && !description.trim().isEmpty()) {
            sb.append("  <description>").append(escapeXml(description.trim())).append("</description>\n");
        } else {
            sb.append("  <description/>\n");
        }
        sb.append("</FiiO_DSP>");
        return sb.toString();
    }

    public static PeqProfile parseFiioXml(String xmlContent, String fallbackName) throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(false);
        DocumentBuilder db = dbf.newDocumentBuilder();
        Document doc = db.parse(new InputSource(new StringReader(xmlContent.trim())));
        Element root = doc.getDocumentElement();
        if (root == null) {
            throw new IllegalArgumentException("File XML rỗng hoặc không hợp lệ.");
        }

        String tag = root.getTagName();
        if ("FiiO_PEQ".equalsIgnoreCase(tag) || "FiiO_PEQ_Profile".equalsIgnoreCase(tag)) {
            String altName = fallbackName;
            NodeList nameNodes = doc.getElementsByTagName("Name");
            if (nameNodes.getLength() > 0) {
                altName = nameNodes.item(0).getTextContent().trim();
            } else if (root.hasAttribute("name")) {
                altName = root.getAttribute("name");
            }
            float masterGain = 0f;
            NodeList preNodes = doc.getElementsByTagName("Preamp");
            if (preNodes.getLength() > 0 && preNodes.item(0) instanceof Element) {
                masterGain = parseFloatSafe(((Element) preNodes.item(0)).getAttribute("gain"), 0f);
            }
            List<PeqBand> list = new ArrayList<>();
            NodeList bandNodes = doc.getElementsByTagName("Band");
            for (int i = 0; i < bandNodes.getLength(); i++) {
                if (bandNodes.item(i) instanceof Element) {
                    Element bEl = (Element) bandNodes.item(i);
                    list.add(new PeqBand(
                            FilterType.fromString(bEl.getAttribute("type")),
                            Math.round(parseFloatSafe(bEl.getAttribute("freq"), 1000f)),
                            parseFloatSafe(bEl.getAttribute("gain"), 0f),
                            parseFloatSafe(bEl.getAttribute("q"), 1.0f)
                    ));
                }
            }
            AdaptedBands adapted = Ja11Protocol.adaptBandsToJa11(list);
            return new PeqProfile(
                    "xml-" + System.currentTimeMillis(),
                    altName,
                    "",
                    "personal",
                    "JadeAudio JA11",
                    "XML Import",
                    new PeqSnapshot(masterGain, adapted.bands),
                    adapted.compressedFrom,
                    System.currentTimeMillis()
            );
        }

        if (!"FiiO_DSP".equalsIgnoreCase(tag)) {
            throw new IllegalArgumentException("Không tìm thấy thẻ <FiiO_DSP> hoặc <FiiO_PEQ_Profile>.");
        }

        String model = root.hasAttribute("model") ? root.getAttribute("model") : "JadeAudio JA11";
        String styleName = fallbackName;
        NodeList styleNodes = doc.getElementsByTagName("styleName");
        if (styleNodes.getLength() > 0 && !styleNodes.item(0).getTextContent().trim().isEmpty()) {
            styleName = styleNodes.item(0).getTextContent().trim();
        }
        String desc = "";
        NodeList descNodes = doc.getElementsByTagName("description");
        if (descNodes.getLength() > 0) {
            desc = descNodes.item(0).getTextContent().trim();
        }

        float masterGain = 0f;
        NodeList eqGroups = doc.getElementsByTagName("eqGroup");
        if (eqGroups.getLength() > 0 && eqGroups.item(0) instanceof Element) {
            Element grp = (Element) eqGroups.item(0);
            NodeList params = grp.getChildNodes();
            for (int i = 0; i < params.getLength(); i++) {
                if (params.item(i) instanceof Element) {
                    Element p = (Element) params.item(i);
                    if ("param".equals(p.getTagName()) && "masterGain".equals(p.getAttribute("name"))) {
                        masterGain = parseFloatSafe(p.getTextContent(), 0f);
                    }
                }
            }
        }

        NodeList eqNodes = doc.getElementsByTagName("eq");
        List<IndexedBand> indexed = new ArrayList<>();
        for (int i = 0; i < eqNodes.getLength(); i++) {
            if (!(eqNodes.item(i) instanceof Element)) continue;
            Element eqEl = (Element) eqNodes.item(i);
            int idx = (int) parseFloatSafe(eqEl.getAttribute("index"), i);
            int typeCode = 0;
            int freq = 1000;
            float gain = 0f;
            float q = 1f;
            NodeList pList = eqEl.getElementsByTagName("param");
            for (int j = 0; j < pList.getLength(); j++) {
                Element p = (Element) pList.item(j);
                String k = p.getAttribute("name");
                String val = p.getTextContent().trim();
                if ("type".equals(k)) typeCode = Math.round(parseFloatSafe(val, 0f));
                else if ("freq".equals(k)) freq = Math.round(parseFloatSafe(val, 1000f));
                else if ("gain".equals(k)) gain = parseFloatSafe(val, 0f);
                else if ("q".equals(k)) q = parseFloatSafe(val, 1f);
            }
            indexed.add(new IndexedBand(idx, new PeqBand(FilterType.fromCode(typeCode), freq, gain, q)));
        }

        Collections.sort(indexed, new Comparator<IndexedBand>() {
            @Override
            public int compare(IndexedBand a, IndexedBand b) {
                return Integer.compare(a.index, b.index);
            }
        });

        List<PeqBand> ordered = new ArrayList<>();
        for (IndexedBand ib : indexed) ordered.add(ib.band);
        AdaptedBands adapted = Ja11Protocol.adaptBandsToJa11(ordered);

        return new PeqProfile(
                "xml-" + System.currentTimeMillis(),
                styleName,
                desc,
                "personal",
                model,
                "FiiO XML",
                new PeqSnapshot(masterGain, adapted.bands),
                adapted.compressedFrom,
                System.currentTimeMillis()
        );
    }

    public static PeqProfile parseAutoEqTxt(String txt, String fallbackName) {
        float masterGain = 0f;
        List<PeqBand> raw = new ArrayList<>();
        String[] lines = txt.split("\\r?\\n");
        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            Matcher pm = PREAMP_PATTERN.matcher(line);
            if (pm.find()) {
                masterGain = parseFloatSafe(pm.group(1), 0f);
                continue;
            }
            Matcher fm = FILTER_PATTERN.matcher(line);
            if (fm.find()) {
                raw.add(new PeqBand(
                        FilterType.fromString(fm.group(1)),
                        Math.round(parseFloatSafe(fm.group(2), 1000f)),
                        parseFloatSafe(fm.group(3), 0f),
                        parseFloatSafe(fm.group(4), 1f)
                ));
            }
        }
        if (raw.isEmpty()) {
            throw new IllegalArgumentException("Không tìm thấy băng tần EQ nào trong file .txt.");
        }
        // AutoEQ orders Filters 1..5 as primary 5-band PEQ
        List<PeqBand> slice = raw.size() > 5 ? new ArrayList<>(raw.subList(0, 5)) : new ArrayList<>(raw);
        Collections.sort(slice, new Comparator<PeqBand>() {
            @Override
            public int compare(PeqBand a, PeqBand b) {
                return Integer.compare(a.freq, b.freq);
            }
        });
        AdaptedBands adapted = Ja11Protocol.adaptBandsToJa11(slice);
        String cleanName = fallbackName != null ? fallbackName.replaceAll("(?i)\\.(txt|xml|json)$", "") : "AutoEQ Import";
        return new PeqProfile(
                "autoeq-" + System.currentTimeMillis(),
                cleanName,
                "Nhập từ định dạng AutoEQ / Squig.link",
                "personal",
                "JadeAudio JA11",
                "AutoEQ",
                new PeqSnapshot(masterGain, adapted.bands),
                raw.size() > 5 ? raw.size() : 0,
                System.currentTimeMillis()
        );
    }

    public static PeqProfile parseAnyFile(String content, String filename) throws Exception {
        String trimmed = content != null ? content.trim() : "";
        String baseName = filename != null ? filename.replaceAll("(?i)\\.(xml|txt|json)$", "") : "Imported Preset";
        if (trimmed.startsWith("<") || (filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".xml"))) {
            return parseFiioXml(trimmed, baseName);
        }
        if (trimmed.startsWith("{")) {
            JSONObject obj = new JSONObject(trimmed);
            float mg = (float) obj.optDouble("masterGain", 0.0);
            JSONArray arr = obj.optJSONArray("bands");
            List<PeqBand> list = new ArrayList<>();
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject b = arr.optJSONObject(i);
                    if (b == null) continue;
                    list.add(new PeqBand(
                            FilterType.fromString(b.optString("type", "PK")),
                            b.optInt("freq", 1000),
                            (float) b.optDouble("gain", 0.0),
                            (float) b.optDouble("q", 1.0)
                    ));
                }
            }
            AdaptedBands adapted = Ja11Protocol.adaptBandsToJa11(list);
            return new PeqProfile(
                    "json-" + System.currentTimeMillis(),
                    obj.optString("name", baseName),
                    obj.optString("description", ""),
                    "personal",
                    "JadeAudio JA11",
                    "JSON Import",
                    new PeqSnapshot(mg, adapted.bands),
                    adapted.compressedFrom,
                    System.currentTimeMillis()
            );
        }
        return parseAutoEqTxt(trimmed, baseName);
    }

    private static float parseFloatSafe(String s, float fallback) {
        if (s == null || s.trim().isEmpty()) return fallback;
        try {
            return Float.parseFloat(s.trim());
        } catch (Exception e) {
            return fallback;
        }
    }

    private static final class IndexedBand {
        final int index;
        final PeqBand band;

        IndexedBand(int index, PeqBand band) {
            this.index = index;
            this.band = band;
        }
    }
}
