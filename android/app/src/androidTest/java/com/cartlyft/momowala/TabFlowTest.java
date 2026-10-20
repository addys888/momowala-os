package com.cartlyft.momowala;

import android.app.*;
import android.os.*;
import android.content.*;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;

/** Runs real partner components in Android WebView with a denied-by-default network. */
public class TabFlowTest extends Instrumentation {
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public void onStart() {
        Bundle result=new Bundle();
        try {
            android.media.MediaPlayer tone=new android.media.MediaPlayer();
            try {
                tone.setDataSource(getTargetContext(),AlertSound.uri(getTargetContext()));
                tone.prepare();
                if(tone.getDuration()<16000 || tone.getDuration()>18000)throw new Exception("Downloaded alert tone missing or undecodable");
            } finally { tone.release(); }
            ActivityMonitor monitor=addMonitor(FlowTestActivity.class.getName(),null,false);
            runOnMainSync(()->getTargetContext().startActivity(new Intent(getTargetContext(),FlowTestActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
            FlowTestActivity activity=(FlowTestActivity)monitor.waitForActivityWithTimeout(10000);
            if(activity==null)throw new Exception("Test activity did not launch");
            runOnMainSync(()->{
                activity.web.setWebViewClient(new WebViewClient(){
                    @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                        String path=request.getUrl().getPath();
                        try {
                            if(!"qa.cartlyft.invalid".equals(request.getUrl().getHost()))throw new IOException("Network blocked");
                            if("/".equals(path))path="/index.html";
                            String mime=path.endsWith(".js")?"application/javascript":path.endsWith(".css")?"text/css":path.endsWith(".png")?"image/png":"text/html";
                            return new WebResourceResponse(mime,"UTF-8",getContext().getAssets().open("flows"+path));
                        }catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",null,new ByteArrayInputStream(new byte[0]));}
                    }
                });
                activity.web.loadUrl("https://qa.cartlyft.invalid/");
            });
            long deadline=SystemClock.elapsedRealtime()+120000;
            JSONObject status=null;
            while(SystemClock.elapsedRealtime()<deadline){
                Thread.sleep(300);
                String raw=evaluate(activity,"JSON.stringify(window.flow||{})");
                if(raw==null||raw.equals("null"))continue;
                status=new JSONObject(new JSONTokener(raw).nextValue().toString());
                String checkpoint=status.optString("checkpoint","");
                if(!checkpoint.isEmpty()&&!checkpoint.equals("null")){
                    String filename=checkpoint.replaceAll("[^a-z0-9-]","")+".png";
                    runOnMainSync(()->{
                        try {
                            android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(activity.web.getWidth(),activity.web.getHeight(),android.graphics.Bitmap.Config.ARGB_8888);
                            activity.web.draw(new android.graphics.Canvas(bitmap));
                            try(FileOutputStream out=new FileOutputStream(new File(getTargetContext().getFilesDir(),filename))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}
                            bitmap.recycle();
                        }catch(Exception e){throw new RuntimeException(e);}
                    });
                    evaluate(activity,"window.flow.checkpoint=null");
                }
                if(status.optBoolean("done"))break;
            }
            if(status==null||!status.optBoolean("done"))throw new Exception("UI flow timed out: "+status);
            result.putString("stream",status.toString(2)+"\n");
            boolean passed=!status.toString().contains("FAIL")&&status.getJSONArray("errors").length()==0;
            runOnMainSync(activity::finish);
            finish(passed?Activity.RESULT_OK:Activity.RESULT_CANCELED,result);
        }catch(Throwable e){result.putString("stream","FAIL: "+e+"\n");finish(Activity.RESULT_CANCELED,result);}
    }
    String evaluate(FlowTestActivity activity,String script)throws Exception{
        CountDownLatch latch=new CountDownLatch(1);String[] result={null};
        runOnMainSync(()->activity.web.evaluateJavascript(script,value->{result[0]=value;latch.countDown();}));
        if(!latch.await(5,TimeUnit.SECONDS))throw new Exception("JavaScript timeout");
        return result[0];
    }
}
