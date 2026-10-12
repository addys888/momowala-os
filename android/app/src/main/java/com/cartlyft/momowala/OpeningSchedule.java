package com.cartlyft.momowala;
import java.util.*;
import java.text.SimpleDateFormat;

/** Business dates follow the opening reminder, including 00:00–00:29 opening times. */
public final class OpeningSchedule {
    static final long DAY=24*60*60_000L;
    public static String date(long time) {
        SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd",Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));return f.format(new Date(time));
    }
    public static long opening(String time,long now) {
        Calendar c=Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));c.setTimeInMillis(now);
        String[] hm=time.split(":");c.set(Calendar.HOUR_OF_DAY,Integer.parseInt(hm[0]));c.set(Calendar.MINUTE,Integer.parseInt(hm[1]));c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);return c.getTimeInMillis();
    }
    public static long businessOpening(String time,long now) {
        long today=opening(time,now),tomorrow=today+DAY;
        return now>=tomorrow-30*60_000L?tomorrow:today;
    }
    public static long next(String time,long now,String completed,boolean repeat) {
        long open=businessOpening(time,now),start=open-30*60_000L;
        if(date(open).equals(completed))return open+DAY-30*60_000L;
        return now<start?start:now+(repeat?5*60_000L:1000L);
    }
}
