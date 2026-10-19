package it.psqlmobile.app;

import android.app.*;
import android.content.*;
import android.view.*;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CertificateFormTest {
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private WebView web(View v){if(v instanceof WebView)return (WebView)v;if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){WebView found=web(((ViewGroup)v).getChildAt(i));if(found!=null)return found;}return null;}
    private String js(WebView view,String expression)throws Exception{CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();instrumentation.runOnMainSync(()->view.evaluateJavascript(expression,value->{result.set(value);latch.countDown();}));assertTrue(latch.await(5,TimeUnit.SECONDS));return result.get();}
    private void until(WebView view,String expression)throws Exception{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);while(!"true".equals(js(view,expression))&&System.nanoTime()<end)Thread.sleep(100);assertEquals(expression,"true",js(view,expression));}
    private void pick(WebView view,String file,String button)throws Exception{
        Context context=instrumentation.getTargetContext();File directory=new File(context.getCacheDir(),"updates");directory.mkdirs();File target=new File(directory,file);
        try(InputStream source=instrumentation.getContext().getAssets().open("tls/"+file);OutputStream output=new FileOutputStream(target)){byte[] buffer=new byte[8192];int n;while((n=source.read(buffer))!=-1)output.write(buffer,0,n);}
        Intent result=new Intent().setData(FileProvider.getUriForFile(context,context.getPackageName()+".files",target));
        IntentFilter filter=new IntentFilter(Intent.ACTION_OPEN_DOCUMENT);filter.addCategory(Intent.CATEGORY_OPENABLE);filter.addDataType("*/*");
        Instrumentation.ActivityMonitor monitor=instrumentation.addMonitor(filter,new Instrumentation.ActivityResult(Activity.RESULT_OK,result),true);
        try{js(view,"[...document.querySelectorAll('#connectionCertificates button')].find(b=>b.textContent==="+JSONObject.quote(button)+").click()");until(view,"document.querySelector('#connectionCertificates').textContent.includes("+JSONObject.quote(file)+")");assertEquals(1,monitor.getHits());}
        finally{instrumentation.removeMonitor(monitor);target.delete();}
    }
    @Test public void importsVerifiesSavesAndReopensConnectionCertificates()throws Exception{
        String uri=InstrumentationRegistry.getArguments().getString("certificateUri");org.junit.Assume.assumeNotNull(uri);
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));String profileId=null;
        try{WebView view=web(activity.getWindow().getDecorView());until(view,"Boolean(document.querySelector('#addConnection'))");js(view,"document.querySelector('#addConnection').click()");
            pick(view,"ca.crt","Importa CA / server");assertEquals("\"verify-full\"",js(view,"document.querySelector('[name=ssl]').value"));
            pick(view,"client.p12","Importa client PKCS#12");
            js(view,"(()=>{const p=document.querySelector('[name=clientCertificatePassword]');p.value='bad';p.dispatchEvent(new Event('input'));document.querySelector('.certificate-check').click()})()");until(view,"document.querySelector('.certificate-status').textContent.includes('errata')");
            js(view,"(()=>{const p=document.querySelector('[name=clientCertificatePassword]');p.value='fixture-only';p.dispatchEvent(new Event('input'));document.querySelector('.certificate-check').click()})()");until(view,"document.querySelector('.certificate-status').textContent.includes('valido')");
            assertEquals("true",js(view,"document.querySelector('.certificate-client').textContent.includes('SHA-256')"));
            js(view,"(()=>{document.querySelector('[name=connectionString]').value="+JSONObject.quote(uri)+";document.querySelector('[name=name]').value='Certificate form fixture';document.querySelector('#connectSubmit').click()})()");
            until(view,"document.querySelector('#status').classList.contains('connected')");
            ConnectionStore store=new ConnectionStore(instrumentation.getTargetContext());JSONArray profiles=store.list();for(int i=0;i<profiles.length();i++)if(profiles.getJSONObject(i).getString("name").equals("Certificate form fixture"))profileId=profiles.getJSONObject(i).getString("id");assertNotNull(profileId);
            js(view,"document.querySelector('#connectionButton').click()");until(view,"Boolean([...document.querySelectorAll('.saved-connection')].find(e=>e.textContent.includes('Certificate form fixture')))");
            js(view,"[...document.querySelectorAll('.saved-connection')].find(e=>e.textContent.includes('Certificate form fixture')).querySelector('.saved-actions .secondary').click()");
            until(view,"document.querySelector('.certificate-client').textContent.includes('SHA-256')");
            assertEquals("\"fixture-only\"",js(view,"document.querySelector('[name=clientCertificatePassword]').value"));
            assertEquals("true",js(view,"document.querySelector('#dialog').scrollWidth<=document.querySelector('#dialog').clientWidth+1"));
        }finally{if(profileId!=null)new ConnectionStore(instrumentation.getTargetContext()).remove(profileId);instrumentation.runOnMainSync(activity::finish);}
    }
}
