package com.ja11studio.app.core;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Locale;

/**
 * Lightweight bilingual localization manager (English / Vietnamese) for JA11 Studio Android Native.
 * Auto-detects phone language on first launch (Vietnamese -> "vi", all other locales -> "en")
 * and allows instant EN <-> VI switching without dropping USB-C OTG connection.
 */
public final class I18n {
    private static final String PREFS = "ja11_i18n_v1";
    private static final String KEY_LANG = "lang";

    private static volatile boolean viMode = false;

    private I18n() {}

    public static void init(Context ctx) {
        if (ctx == null) return;
        SharedPreferences prefs = ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY_LANG, null);
        if ("vi".equals(saved)) {
            viMode = true;
        } else if ("en".equals(saved)) {
            viMode = false;
        } else {
            String sysLang = Locale.getDefault().getLanguage();
            viMode = "vi".equalsIgnoreCase(sysLang);
        }
    }

    public static boolean isVi() {
        return viMode;
    }

    public static String code() {
        return viMode ? "VI" : "EN";
    }

    public static void toggle(Context ctx) {
        viMode = !viMode;
        if (ctx != null) {
            ctx.getApplicationContext()
                    .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(KEY_LANG, viMode ? "vi" : "en")
                    .apply();
        }
    }

    public static String tr(String vi, String en) {
        return viMode ? vi : en;
    }
}
