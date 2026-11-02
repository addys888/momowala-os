package com.cartlyft.momowala;
import android.content.Context;
import android.net.Uri;
import android.media.AudioAttributes;
final class AlertSound {
    static final long[] VIBRATION={0,180,160,180,4480};
    static Uri uri(Context c) { return Uri.parse("android.resource://"+c.getPackageName()+"/raw/cartlyft_gentle_beep"); }
    static AudioAttributes attributes() { return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build(); }
}
