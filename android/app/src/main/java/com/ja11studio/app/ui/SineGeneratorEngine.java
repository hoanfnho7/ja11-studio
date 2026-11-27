package com.ja11studio.app.ui;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Pure Native 48kHz Stereo Float Sine Generator via Android AudioTrack.
 * Phase-continuous synthesis guarantees zero clicks/pops during live frequency sweeps or L/R pan!
 */
public final class SineGeneratorEngine {
    public interface SweepListener {
        void onStateUpdated(int freqHz, boolean playing, boolean sweeping);
    }

    private static final int SAMPLE_RATE = 48000;
    private static final int CHUNK_FRAMES = 480; // 10ms low-latency audio chunks

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private SweepListener listener;

    private volatile int targetFreqHz = 4380;
    private volatile int volumePercent = 15; // 1 .. 100
    private volatile int panMode = 0;        // -1 = Left, 0 = Stereo, +1 = Right

    private final AtomicBoolean playing = new AtomicBoolean(false);
    private final AtomicBoolean sweeping = new AtomicBoolean(false);
    private Thread audioThread;

    public void setListener(SweepListener listener) {
        this.listener = listener;
    }

    public int getFreqHz() {
        return targetFreqHz;
    }

    public int getVolumePercent() {
        return volumePercent;
    }

    public int getPanMode() {
        return panMode;
    }

    public boolean isPlaying() {
        return playing.get();
    }

    public boolean isSweeping() {
        return sweeping.get();
    }

    public void setFreqHz(int hz) {
        targetFreqHz = Math.max(20, Math.min(20000, hz));
        notifyUi();
    }

    public void setVolumePercent(int pct) {
        volumePercent = Math.max(1, Math.min(100, pct));
    }

    public void setPanMode(int pan) {
        panMode = pan < 0 ? -1 : (pan > 0 ? 1 : 0);
    }

    public void togglePlay() {
        if (playing.get()) {
            stopAll();
        } else {
            startPlayback(false);
        }
    }

    public void toggleAutoSweep() {
        if (sweeping.get()) {
            sweeping.set(false);
            notifyUi();
            return;
        }
        if (targetFreqHz < 1800 || targetFreqHz > 9800) {
            targetFreqHz = 2000;
        }
        if (!playing.get()) {
            startPlayback(true);
        } else {
            sweeping.set(true);
            notifyUi();
        }
    }

    private void startPlayback(boolean withSweep) {
        stopAll();
        playing.set(true);
        sweeping.set(withSweep);
        notifyUi();

        Thread t = new Thread(() -> {
            int minBuf = AudioTrack.getMinBufferSize(
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_STEREO,
                    AudioFormat.ENCODING_PCM_FLOAT
            );
            int bufBytes = Math.max(minBuf, CHUNK_FRAMES * 2 * 4 * 3);

            AudioTrack track = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                            .setSampleRate(SAMPLE_RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
                            .build())
                    .setBufferSizeInBytes(bufBytes)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();

            float[] stereoBuf = new float[CHUNK_FRAMES * 2];
            double phase = 0.0;
            double currentFreq = targetFreqHz;
            double currentAmp = 0.0;
            double sweepDoubleHz = targetFreqHz;
            long lastUiPushMs = 0L;

            try {
                track.play();
                while (playing.get()) {
                    if (sweeping.get()) {
                        // Exponential sweep 2kHz -> 10kHz over ~10 seconds
                        double octavesPerSec = (Math.log(10000.0 / 2000.0) / Math.log(2.0)) / 10.0;
                        double dt = CHUNK_FRAMES / (double) SAMPLE_RATE;
                        if (sweepDoubleHz < 1990.0 || Math.abs(sweepDoubleHz - targetFreqHz) > 250.0) {
                            sweepDoubleHz = targetFreqHz;
                        }
                        sweepDoubleHz *= Math.pow(2.0, octavesPerSec * dt);
                        if (sweepDoubleHz >= 10000.0) {
                            sweepDoubleHz = 10000.0;
                            targetFreqHz = 10000;
                            sweeping.set(false);
                            notifyUi();
                        } else {
                            targetFreqHz = (int) Math.round(sweepDoubleHz);
                            long now = SystemClock.elapsedRealtime();
                            if (now - lastUiPushMs >= 50L) {
                                lastUiPushMs = now;
                                notifyUi();
                            }
                        }
                    }

                    double normVol = volumePercent / 100.0;
                    double safeTargetAmp = Math.max(0.0005, normVol * normVol * 0.25);
                    int pMode = panMode;
                    float leftScale = (pMode <= 0) ? 1.0f : 0.0f;
                    float rightScale = (pMode >= 0) ? 1.0f : 0.0f;

                    for (int i = 0; i < CHUNK_FRAMES; i++) {
                        currentFreq += (targetFreqHz - currentFreq) * 0.004;
                        currentAmp += (safeTargetAmp - currentAmp) * 0.004;
                        phase += (2.0 * Math.PI * currentFreq) / SAMPLE_RATE;
                        if (phase > 2.0 * Math.PI) {
                            phase -= 2.0 * Math.PI;
                        }
                        float sample = (float) (Math.sin(phase) * currentAmp);
                        stereoBuf[i * 2] = sample * leftScale;
                        stereoBuf[i * 2 + 1] = sample * rightScale;
                    }

                    track.write(stereoBuf, 0, stereoBuf.length, AudioTrack.WRITE_BLOCKING);
                }

                // Short 10ms fade-out ramp to prevent stop click
                for (int i = 0; i < CHUNK_FRAMES; i++) {
                    currentAmp *= 0.985;
                    phase += (2.0 * Math.PI * currentFreq) / SAMPLE_RATE;
                    float sample = (float) (Math.sin(phase) * currentAmp);
                    stereoBuf[i * 2] = sample;
                    stereoBuf[i * 2 + 1] = sample;
                }
                track.write(stereoBuf, 0, stereoBuf.length, AudioTrack.WRITE_BLOCKING);
                track.stop();
            } catch (Exception ignored) {
            } finally {
                try {
                    track.release();
                } catch (Exception ignored) {
                }
            }
        }, "JA11-Native-SineGen");
        t.setDaemon(true);
        this.audioThread = t;
        t.start();
    }

    public void stopAll() {
        sweeping.set(false);
        if (playing.getAndSet(false)) {
            Thread t = this.audioThread;
            if (t != null) {
                try {
                    t.join(160L);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                this.audioThread = null;
            }
            notifyUi();
        }
    }

    private void notifyUi() {
        final SweepListener l = this.listener;
        if (l == null) return;
        final int f = targetFreqHz;
        final boolean p = playing.get();
        final boolean s = sweeping.get();
        mainHandler.post(() -> l.onStateUpdated(f, p, s));
    }
}
