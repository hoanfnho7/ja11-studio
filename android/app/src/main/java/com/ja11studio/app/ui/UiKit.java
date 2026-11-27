package com.ja11studio.app.ui;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Acoustic Precision Dark design tokens & zero-overhead native Android UI builders with Ripple feedback.
 */
public final class UiKit {
    // Acoustic Precision Dark Palette
    public static final int C_SURFACE_LOWEST = Color.parseColor("#0D0E11");
    public static final int C_SURFACE = Color.parseColor("#121316");
    public static final int C_SURFACE_LOW = Color.parseColor("#1B1B1F");
    public static final int C_SURFACE_CONTAINER = Color.parseColor("#1F1F23");
    public static final int C_SURFACE_HIGH = Color.parseColor("#292A2D");
    public static final int C_SURFACE_HIGHEST = Color.parseColor("#343538");
    public static final int C_BORDER = Color.parseColor("#343538");

    public static final int C_AMBER_CONTAINER = Color.parseColor("#FF9F0A");
    public static final int C_AMBER_TEXT = Color.parseColor("#FFC688");
    public static final int C_ON_AMBER = Color.parseColor("#3E2200");

    public static final int C_CYAN_CONTAINER = Color.parseColor("#00EEFC");
    public static final int C_CYAN_TEXT = Color.parseColor("#7DF4FF");
    public static final int C_ON_CYAN = Color.parseColor("#002B2E");

    public static final int C_GREEN = Color.parseColor("#53EC6F");
    public static final int C_ERROR = Color.parseColor("#FFB4AB");
    public static final int C_ERROR_CONTAINER = Color.parseColor("#93000A");
    public static final int C_ON_ERROR_CONTAINER = Color.parseColor("#FFDAD6");

    public static final int C_TEXT_PRIMARY = Color.parseColor("#E3E2E6");
    public static final int C_TEXT_MUTED = Color.parseColor("#BDB6AE");
    public static final int C_OUTLINE = Color.parseColor("#8A8178");

    public static final Typeface FONT_SANS_BOLD = Typeface.create("sans-serif-medium", Typeface.BOLD);
    public static final Typeface FONT_SANS = Typeface.create("sans-serif", Typeface.NORMAL);
    public static final Typeface FONT_MONO = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL);
    public static final Typeface FONT_MONO_BOLD = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD);

    private UiKit() {}

    public static int dp(Context ctx, float dpVal) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                dpVal,
                ctx.getResources().getDisplayMetrics()
        ));
    }

    public static GradientDrawable roundedBox(Context ctx, int fillColor, float radiusDp, int strokeColor, float strokeWidthDp) {
        GradientDrawable gd = new GradientDrawable();
        gd.setShape(GradientDrawable.RECTANGLE);
        gd.setColor(fillColor);
        gd.setCornerRadius(dp(ctx, radiusDp));
        if (strokeWidthDp > 0f && strokeColor != Color.TRANSPARENT) {
            gd.setStroke(Math.max(1, dp(ctx, strokeWidthDp)), strokeColor);
        }
        return gd;
    }

    public static RippleDrawable rippleBox(
            Context ctx,
            int fillColor,
            float radiusDp,
            int strokeColor,
            float strokeWidthDp,
            int rippleColor
    ) {
        GradientDrawable content = roundedBox(ctx, fillColor, radiusDp, strokeColor, strokeWidthDp);
        GradientDrawable mask = roundedBox(ctx, Color.WHITE, radiusDp, Color.TRANSPARENT, 0f);
        return new RippleDrawable(ColorStateList.valueOf(rippleColor), content, mask);
    }

    public static LinearLayout cardContainer(Context ctx, float padDp) {
        LinearLayout box = new LinearLayout(ctx);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = dp(ctx, padDp);
        box.setPadding(p, p, p, p);
        box.setBackground(roundedBox(ctx, C_SURFACE_LOW, 12f, C_BORDER, 0.8f));
        return box;
    }

    public static TextView label(Context ctx, String text, float spSize, int color, Typeface tf) {
        TextView tv = new TextView(ctx);
        tv.setText(text);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, spSize);
        tv.setTextColor(color);
        tv.setTypeface(tf);
        return tv;
    }

    public static TextView badge(Context ctx, String text, int bg, int fg) {
        TextView tv = label(ctx, text, 10f, fg, FONT_MONO_BOLD);
        tv.setPadding(dp(ctx, 6f), dp(ctx, 2.5f), dp(ctx, 6f), dp(ctx, 2.5f));
        tv.setBackground(roundedBox(ctx, bg, 5f, Color.TRANSPARENT, 0f));
        tv.setGravity(Gravity.CENTER);
        return tv;
    }

    public static TextView actionButton(
            Context ctx,
            String text,
            int bg,
            int fg,
            int borderColor,
            float radiusDp,
            float textSp
    ) {
        TextView btn = new TextView(ctx);
        btn.setText(text);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSp);
        btn.setTextColor(fg);
        btn.setTypeface(FONT_MONO_BOLD);
        btn.setGravity(Gravity.CENTER);
        btn.setMinHeight(dp(ctx, 42f));
        btn.setPadding(dp(ctx, 12f), dp(ctx, 8f), dp(ctx, 12f), dp(ctx, 8f));
        int rip = (bg == C_AMBER_CONTAINER) ? Color.argb(60, 0, 0, 0) : Color.argb(45, 255, 255, 255);
        btn.setBackground(rippleBox(ctx, bg, radiusDp, borderColor, borderColor != Color.TRANSPARENT ? 1f : 0f, rip));
        btn.setClickable(true);
        btn.setFocusable(true);
        return btn;
    }

    public static void hapticTap(View v) {
        if (v != null) {
            v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
        }
    }

    public static void hapticTick(View v) {
        if (v != null) {
            v.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
        }
    }

    public static LinearLayout.LayoutParams matchWrapBottomMargin(Context ctx, float bottomDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.bottomMargin = dp(ctx, bottomDp);
        return lp;
    }
}
