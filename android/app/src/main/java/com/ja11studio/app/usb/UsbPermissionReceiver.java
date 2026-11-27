package com.ja11studio.app.usb;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;

/**
 * Explicit BroadcastReceiver component declared in AndroidManifest.xml so PendingIntent.FLAG_MUTABLE
 * works cleanly on Android 12, 13, 14, 15, and 16+ (targetSdkVersion 36) without implicit-intent crashes.
 */
public final class UsbPermissionReceiver extends BroadcastReceiver {
    public static final String ACTION_USB_PERMISSION = "com.ja11studio.app.USB_PERMISSION";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_USB_PERMISSION.equals(intent.getAction())) {
            return;
        }
        UsbDevice device;
        if (Build.VERSION.SDK_INT >= 33) {
            device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
        } else {
            @SuppressWarnings("deprecation")
            UsbDevice legacy = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            device = legacy;
        }
        boolean extraGranted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
        Ja11UsbController instance = Ja11UsbController.getActiveInstance();
        if (instance != null) {
            instance.onUsbPermissionBroadcast(device, extraGranted);
        }
    }
}
