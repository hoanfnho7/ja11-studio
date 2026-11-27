package com.ja11studio.app.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewParent;

import com.ja11studio.app.core.BiquadMath;
import com.ja11studio.app.core.PeqModels;
import com.ja11studio.app.core.PeqModels.PeqBand;
import com.ja11studio.app.core.PeqModels.PeqSnapshot;

import java.util.Locale;

/**
 * Hardware-accelerated 120Hz Skia Canvas PEQ Curve View with zero-GC onDraw.
 * Supports:
 * - Interactive Mode (Tab 1): 1-finger drag for Freq/Gain + 2-finger pinch for Q factor.
 * - Compact Sticky Monitor Mode (Tab 3 & Tab 4): Pinned live response curve when switching profiles.
 */
public final class PeqGraphView extends View {
    public interface BandListener {
        void onBandSelected(int bandIndex);
        void onBandDragged(int bandIndex, int nextFreq, float nextGain);
        void onBandQPinched(int bandIndex, float nextQ);
    }

    private static final double LOG_MIN = Math.log10(20.0);
    private static final double LOG_MAX = Math.log10(20000.0);
    private static final float MIN_DB = -13.5f;
    private static final float MAX_DB = 13.5f;

    private static final int[] FREQ_TICKS_FULL = {20, 100, 1000, 4380, 10000, 20000};
    private static final int[] FREQ_TICKS_COMPACT = {20, 100, 1000, 10000, 20000};
    private static final int[] DB_TICKS_FULL = {-12, -6, 0, 6, 12};
    private static final int[] DB_TICKS_COMPACT = {-12, 0, 12};

    private final boolean compact;
    private BandListener listener;

    private PeqSnapshot liveSnapshot = PeqSnapshot.defaultUserCurve();
    private PeqSnapshot savedSnapshot = null;
    private int selectedBand = 3;
    private boolean bypassed = false;
    private Integer activeSweepHz = null;
    private int draggingBand = -1;

    // Pre-allocated drawing primitives (Zero-GC in onDraw!)
    private final double[] liveCoeffs = new double[25];
    private final double[] savedCoeffs = new double[25];
    private final Path curvePath = new Path();
    private final Path fillPath = new Path();
    private final Path ghostPath = new Path();
    private final RectF bgRect = new RectF();

    private final Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint gridPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint zeroLinePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint curvePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ghostPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint sweepPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint nodeFillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint nodeStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint nodeHaloPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint nodeTextPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private LinearGradient cachedAmberGrad;
    private LinearGradient cachedBypassGrad;
    private int cachedGradHeight = -1;

    private final ScaleGestureDetector pinchDetector;

    public PeqGraphView(Context context, boolean compact) {
        super(context);
        this.compact = compact;

        float d = context.getResources().getDisplayMetrics().density;

        bgPaint.setStyle(Paint.Style.FILL);
        bgPaint.setColor(UiKit.C_SURFACE_LOWEST);

        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(1f * d);
        borderPaint.setColor(UiKit.C_BORDER);

        gridPaint.setStyle(Paint.Style.STROKE);
        gridPaint.setStrokeWidth(0.8f * d);

        zeroLinePaint.setStyle(Paint.Style.STROKE);
        zeroLinePaint.setStrokeWidth(1f * d);
        zeroLinePaint.setColor(Color.argb(85, 255, 159, 10));
        zeroLinePaint.setPathEffect(new DashPathEffect(new float[]{4f * d, 4f * d}, 0f));

        labelPaint.setTypeface(UiKit.FONT_MONO);
        labelPaint.setTextSize((compact ? 8.5f : 9.5f) * d);

        curvePaint.setStyle(Paint.Style.STROKE);
        curvePaint.setStrokeCap(Paint.Cap.ROUND);
        curvePaint.setStrokeJoin(Paint.Join.ROUND);
        curvePaint.setStrokeWidth((compact ? 2.0f : 2.6f) * d);

        ghostPaint.setStyle(Paint.Style.STROKE);
        ghostPaint.setStrokeWidth(1.2f * d);
        ghostPaint.setColor(Color.argb(95, 218, 195, 173));
        ghostPaint.setPathEffect(new DashPathEffect(new float[]{5f * d, 4f * d}, 0f));

        sweepPaint.setStyle(Paint.Style.STROKE);
        sweepPaint.setStrokeWidth(1.5f * d);
        sweepPaint.setColor(UiKit.C_CYAN_CONTAINER);
        sweepPaint.setPathEffect(new DashPathEffect(new float[]{4f * d, 3f * d}, 0f));

        nodeFillPaint.setStyle(Paint.Style.FILL);
        nodeFillPaint.setColor(UiKit.C_SURFACE);

        nodeStrokePaint.setStyle(Paint.Style.STROKE);
        nodeStrokePaint.setStrokeWidth((compact ? 1.5f : 2.2f) * d);

        nodeHaloPaint.setStyle(Paint.Style.FILL);
        nodeHaloPaint.setColor(Color.argb(46, 0, 238, 252));

        nodeTextPaint.setTypeface(UiKit.FONT_MONO_BOLD);
        nodeTextPaint.setTextSize(9.5f * d);
        nodeTextPaint.setTextAlign(Paint.Align.CENTER);

        pinchDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                if (compact || listener == null) return false;
                float factor = detector.getScaleFactor();
                PeqBand b = liveSnapshot.bands[selectedBand];
                // Pinch out (wider finger spread) -> wider bandwidth (lower Q); pinch in -> sharper notch (higher Q)
                float nextQ = PeqModels.round2(Math.max(0.1f, Math.min(10f, b.q / factor)));
                listener.onBandQPinched(selectedBand, nextQ);
                return true;
            }
        });
    }

    public void setBandListener(BandListener listener) {
        this.listener = listener;
    }

    public void updateState(
            PeqSnapshot live,
            PeqSnapshot saved,
            int selectedBandIdx,
            boolean isBypassed,
            Integer sweepHz
    ) {
        if (live != null) this.liveSnapshot = live;
        this.savedSnapshot = saved;
        this.selectedBand = Math.max(0, Math.min(4, selectedBandIdx));
        this.bypassed = isBypassed;
        this.activeSweepHz = sweepHz;
        invalidate();
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int w = MeasureSpec.getSize(widthMeasureSpec);
        int targetH = compact ? UiKit.dp(getContext(), 92f) : Math.max(UiKit.dp(getContext(), 188f), Math.round(w * 0.49f));
        int hMode = MeasureSpec.getMode(heightMeasureSpec);
        int hSize = MeasureSpec.getSize(heightMeasureSpec);
        int finalH = (hMode == MeasureSpec.EXACTLY) ? hSize : targetH;
        setMeasuredDimension(w, finalH);
    }

    private float padLeft() {
        return UiKit.dp(getContext(), compact ? 28f : 34f);
    }

    private float padRight() {
        return UiKit.dp(getContext(), compact ? 10f : 14f);
    }

    private float padTop() {
        return UiKit.dp(getContext(), compact ? 10f : 18f);
    }

    private float padBottom() {
        return UiKit.dp(getContext(), compact ? 17f : 22f);
    }

    private float freqToX(double freq, int w) {
        float pl = padLeft();
        float usable = Math.max(1f, w - pl - padRight());
        double clamped = Math.max(20.0, Math.min(20000.0, freq));
        double ratio = (Math.log10(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN);
        return pl + (float) (ratio * usable);
    }

    private int xToFreq(float x, int w) {
        float pl = padLeft();
        float usable = Math.max(1f, w - pl - padRight());
        double ratio = Math.max(0.0, Math.min(1.0, (x - pl) / usable));
        return (int) Math.round(Math.pow(10.0, LOG_MIN + ratio * (LOG_MAX - LOG_MIN)));
    }

    private float dbToY(double db, int h) {
        float pt = padTop();
        float usable = Math.max(1f, h - pt - padBottom());
        double clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
        double ratio = (MAX_DB - clamped) / (MAX_DB - MIN_DB);
        return pt + (float) (ratio * usable);
    }

    private float yToDb(float y, int h) {
        float pt = padTop();
        float usable = Math.max(1f, h - pt - padBottom());
        float ratio = Math.max(0f, Math.min(1f, (y - pt) / usable));
        float raw = MAX_DB - ratio * (MAX_DB - MIN_DB);
        return PeqModels.round1(Math.max(-12f, Math.min(12f, raw)));
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int w = getWidth();
        int h = getHeight();
        if (w <= 0 || h <= 0) return;

        float d = getResources().getDisplayMetrics().density;
        float cornerR = 10f * d;
        bgRect.set(0.5f * d, 0.5f * d, w - 0.5f * d, h - 0.5f * d);
        canvas.drawRoundRect(bgRect, cornerR, cornerR, bgPaint);

        float pl = padLeft();
        float pr = padRight();
        float pt = padTop();
        float pb = padBottom();

        if (cachedGradHeight != h) {
            cachedGradHeight = h;
            cachedAmberGrad = new LinearGradient(
                    0f, pt, 0f, h - pb,
                    new int[]{Color.argb(76, 255, 159, 10), Color.argb(14, 255, 159, 10), Color.TRANSPARENT},
                    new float[]{0f, 0.58f, 1f},
                    Shader.TileMode.CLAMP
            );
            cachedBypassGrad = new LinearGradient(
                    0f, pt, 0f, h - pb,
                    Color.argb(30, 140, 144, 152),
                    Color.TRANSPARENT,
                    Shader.TileMode.CLAMP
            );
        }

        // 1. Horizontal dB Grid
        int[] dbTicks = compact ? DB_TICKS_COMPACT : DB_TICKS_FULL;
        labelPaint.setTextAlign(Paint.Align.RIGHT);
        for (int db : dbTicks) {
            float y = dbToY(db, h);
            if (db == 0) {
                canvas.drawLine(pl, y, w - pr, y, zeroLinePaint);
                labelPaint.setColor(UiKit.C_AMBER_TEXT);
                canvas.drawText("0", pl - 4f * d, y + 3f * d, labelPaint);
            } else {
                gridPaint.setColor(Color.argb(110, 52, 53, 56));
                canvas.drawLine(pl, y, w - pr, y, gridPaint);
                labelPaint.setColor(Color.parseColor("#686B75"));
                String txt = db > 0 ? ("+" + db) : String.valueOf(db);
                canvas.drawText(txt, pl - 4f * d, y + 3f * d, labelPaint);
            }
        }

        // 2. Vertical Frequency Grid
        int[] freqTicks = compact ? FREQ_TICKS_COMPACT : FREQ_TICKS_FULL;
        labelPaint.setTextAlign(Paint.Align.CENTER);
        for (int f : freqTicks) {
            float x = freqToX(f, w);
            boolean isPeakRef = (f == 4380);
            gridPaint.setColor(isPeakRef ? Color.argb(50, 0, 238, 252) : Color.argb(90, 52, 53, 56));
            canvas.drawLine(x, pt, x, h - pb, gridPaint);

            labelPaint.setColor(isPeakRef ? UiKit.C_CYAN_TEXT : Color.parseColor("#727580"));
            String lbl = isPeakRef ? "4.38k" : (f >= 1000 ? (f / 1000) + "kHz" : f + "Hz");
            float clampedX = Math.max(pl + 12f * d, Math.min(w - pr - 14f * d, x));
            canvas.drawText(lbl, clampedX, h - 4f * d, labelPaint);
        }

        // 3. Saved Hardware Snapshot Ghost Curve
        int samples = compact ? 96 : 150;
        float plotW = Math.max(1f, w - pl - pr);
        if (savedSnapshot != null && !bypassed) {
            for (int i = 0; i < 5; i++) {
                BiquadMath.computeCoeffsInto(savedSnapshot.bands[i], BiquadMath.DEFAULT_FS, savedCoeffs, i * 5);
            }
            ghostPath.reset();
            for (int s = 0; s <= samples; s++) {
                float px = pl + (s / (float) samples) * plotW;
                double freq = xToFreq(px, w);
                double db = BiquadMath.evaluateCompositeDb(savedCoeffs, freq, BiquadMath.DEFAULT_FS);
                float py = dbToY(db, h);
                if (s == 0) ghostPath.moveTo(px, py);
                else ghostPath.lineTo(px, py);
            }
            canvas.drawPath(ghostPath, ghostPaint);
        }

        // 4. Live Composite PEQ Curve + Electric Amber Gradient Fill
        for (int i = 0; i < 5; i++) {
            BiquadMath.computeCoeffsInto(liveSnapshot.bands[i], BiquadMath.DEFAULT_FS, liveCoeffs, i * 5);
        }
        float zeroY = dbToY(0.0, h);
        curvePath.reset();
        fillPath.reset();
        fillPath.moveTo(pl, zeroY);

        for (int s = 0; s <= samples; s++) {
            float px = pl + (s / (float) samples) * plotW;
            double db = 0.0;
            if (!bypassed) {
                double freq = xToFreq(px, w);
                db = BiquadMath.evaluateCompositeDb(liveCoeffs, freq, BiquadMath.DEFAULT_FS);
            }
            float py = dbToY(db, h);
            if (s == 0) curvePath.moveTo(px, py);
            else curvePath.lineTo(px, py);
            fillPath.lineTo(px, py);
        }
        fillPath.lineTo(pl + plotW, zeroY);
        fillPath.close();

        fillPaint.setShader(bypassed ? cachedBypassGrad : cachedAmberGrad);
        canvas.drawPath(fillPath, fillPaint);

        curvePaint.setColor(bypassed ? Color.parseColor("#6E717A") : UiKit.C_AMBER_CONTAINER);
        canvas.drawPath(curvePath, curvePaint);

        // 5. Active Sine Sweep Laser Line
        if (activeSweepHz != null) {
            float sx = freqToX(activeSweepHz, w);
            canvas.drawLine(sx, pt, sx, h - pb, sweepPaint);
        }

        // 6. Band Nodes B1..B5
        if (!bypassed) {
            for (int i = 0; i < 5; i++) {
                PeqBand b = liveSnapshot.bands[i];
                float nx = freqToX(b.freq, w);
                float ny = dbToY(b.gain, h);
                boolean sel = !compact && (i == selectedBand);
                int accent = sel ? UiKit.C_CYAN_CONTAINER : UiKit.C_AMBER_CONTAINER;

                if (sel) {
                    canvas.drawCircle(nx, ny, 14f * d, nodeHaloPaint);
                }

                float radius = (compact ? 4.2f : (sel ? 8.2f : 7.0f)) * d;
                canvas.drawCircle(nx, ny, radius, nodeFillPaint);
                nodeStrokePaint.setColor(accent);
                canvas.drawCircle(nx, ny, radius, nodeStrokePaint);

                nodeHaloPaint.setColor(accent);
                canvas.drawCircle(nx, ny, (compact ? 1.5f : 2.6f) * d, nodeHaloPaint);
                nodeHaloPaint.setColor(Color.argb(46, 0, 238, 252));

                if (!compact) {
                    nodeTextPaint.setColor(accent);
                    float ly = (ny < pt + 16f * d) ? (ny + 19f * d) : (ny - 10f * d);
                    canvas.drawText(String.format(Locale.US, "B%d", i + 1), nx, ly, nodeTextPaint);
                }
            }
        }

        canvas.drawRoundRect(bgRect, cornerR, cornerR, borderPaint);
    }

    private int findNearestNode(float x, float y) {
        int w = getWidth();
        int h = getHeight();
        float maxHit = UiKit.dp(getContext(), 36f);
        int bestIdx = -1;
        float bestDist = maxHit;
        for (int i = 0; i < 5; i++) {
            PeqBand b = liveSnapshot.bands[i];
            float nx = freqToX(b.freq, w);
            float ny = dbToY(b.gain, h);
            float dist = (float) Math.hypot(nx - x, ny - y);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (compact || listener == null) {
            return super.onTouchEvent(event);
        }

        pinchDetector.onTouchEvent(event);
        if (pinchDetector.isInProgress()) {
            draggingBand = -1;
            return true;
        }

        int action = event.getActionMasked();
        float x = event.getX();
        float y = event.getY();

        switch (action) {
            case MotionEvent.ACTION_DOWN: {
                ViewParent parent = getParent();
                if (parent != null) {
                    parent.requestDisallowInterceptTouchEvent(true);
                }
                int hit = findNearestNode(x, y);
                int target = hit >= 0 ? hit : selectedBand;
                selectedBand = target;
                draggingBand = target;
                UiKit.hapticTick(this);
                listener.onBandSelected(target);
                if (hit >= 0) {
                    listener.onBandDragged(target, xToFreq(x, getWidth()), yToDb(y, getHeight()));
                }
                invalidate();
                return true;
            }

            case MotionEvent.ACTION_MOVE: {
                if (draggingBand >= 0 && event.getPointerCount() == 1) {
                    listener.onBandDragged(draggingBand, xToFreq(x, getWidth()), yToDb(y, getHeight()));
                    invalidate();
                }
                return true;
            }

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL: {
                draggingBand = -1;
                ViewParent parent = getParent();
                if (parent != null) {
                    parent.requestDisallowInterceptTouchEvent(false);
                }
                return true;
            }
        }
        return super.onTouchEvent(event);
    }
}
