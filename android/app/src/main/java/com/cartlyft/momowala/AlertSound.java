package com.cartlyft.momowala;
import android.content.Context;
import android.net.Uri;
import android.media.AudioAttributes;
final class AlertSound {
    static final long[] VIBRATION={0,650,200,650,200,900,600};
    static Uri uri(Context c) { return Uri.parse("android.resource://"+c.getPackageName()+"/raw/cartlyft_attention"); }
    static AudioAttributes attributes() { return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build(); }
}
