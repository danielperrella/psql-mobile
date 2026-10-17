package it.psqlmobile.app;

import android.app.Instrumentation;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AppFlowTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    private WebView webView(View view) {
        if (view instanceof WebView) return (WebView)view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup)view).getChildCount(); i++) {
            WebView found = webView(((ViewGroup)view).getChildAt(i));
            if (found != null) return found;
        }
        return null;
    }

    private String evaluate(WebView view, String js) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> answer = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> view.evaluateJavascript(js, value -> { answer.set(value); latch.countDown(); }));
        assertTrue("WebView callback", latch.await(5, TimeUnit.SECONDS));
        return answer.get();
    }

    @Test public void savedConnectionSurvivesPackageUpdate() throws Exception {
        org.junit.Assume.assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("verifySavedUpdate")));
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            WebView view=webView(activity.getWindow().getDecorView());
            String saved="[...document.querySelectorAll('.saved-open')].find(e=>e.querySelector('strong').textContent==='Android test fixture')";
            long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
            while(!"true".equals(evaluate(view,"Boolean("+saved+")"))&&System.nanoTime()<end)Thread.sleep(100);
            assertEquals("true",evaluate(view,"Boolean("+saved+")"));
            evaluate(view,saved+".click()");
            end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
            while(!"true".equals(evaluate(view,"document.querySelector('#status').classList.contains('connected')"))&&System.nanoTime()<end)Thread.sleep(100);
            assertEquals("true",evaluate(view,"document.querySelector('#status').classList.contains('connected')"));
        }finally{instrumentation.runOnMainSync(activity::finish);}
    }

    @Test public void uriOnlyFormConnectsThroughTheRealAndroidBridge() throws Exception {
        String uri = InstrumentationRegistry.getArguments().getString("postgresUri");
        assertNotNull(uri);
        MainActivity activity = (MainActivity)instrumentation.startActivitySync(
            new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            WebView view = webView(activity.getWindow().getDecorView());
            assertNotNull(view);
            long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (!"true".equals(evaluate(view, "Boolean(document.querySelector('#connectForm'))")) && System.nanoTime() < end) Thread.sleep(100);
            assertEquals("true", evaluate(view, "Boolean(document.querySelector('#connectForm'))"));
            assertEquals("false", evaluate(view, "Boolean(document.querySelector('[name=gateway],[name=token]'))"));
            assertEquals("true", evaluate(view, "Boolean(window.PsqlNative && window.__psqlNativeReply)"));
            assertEquals("\"TEXTAREA\"", evaluate(view, "document.querySelector('[name=connectionString]').tagName"));
            assertEquals("true", evaluate(view, "document.querySelector('#connectionStringHint').textContent.includes('postgresql://utente:password@db.example.com')"));
            evaluate(view, "(()=>{const f=document.querySelector('[name=connectionString]');f.value='postgres://utente:pass%oops@db.example.com/db';f.dispatchEvent(new Event('input'));return true})()");
            assertEquals("\"true\"", evaluate(view, "document.querySelector('[name=connectionString]').getAttribute('aria-invalid')"));
            assertEquals("true", evaluate(view, "document.querySelector('#connectionStringValidation').textContent.includes('%25')"));
            String command = "psql '" + uri + "'";
            String script = "(()=>{const f=document.querySelector('#connectForm');f.elements.name.value='Android test fixture';f.elements.connectionString.value="
                + JSONObject.quote(command) + ";f.elements.connectionString.dispatchEvent(new Event('input'));return true})()";
            evaluate(view, script);
            assertEquals("Format feedback: " + evaluate(view, "document.querySelector('#connectionStringValidation').textContent"),
                "\"false\"", evaluate(view, "document.querySelector('[name=connectionString]').getAttribute('aria-invalid')"));
            evaluate(view, "document.querySelector('#connectForm').dispatchEvent(new Event('submit',{cancelable:true}))");
            end = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (!"true".equals(evaluate(view, "document.querySelector('#status').classList.contains('connected')")) && System.nanoTime() < end) Thread.sleep(100);
            assertEquals("Connection form error: " + evaluate(view, "document.querySelector('#connectError').textContent"),
                "true", evaluate(view, "document.querySelector('#status').classList.contains('connected')"));
            assertEquals("false", evaluate(view, "document.querySelector('#run').disabled"));
            evaluate(view, "document.querySelector('[data-view=query]').click();document.querySelector('#run').click()");
            end = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (!"1".equals(evaluate(view, "document.querySelectorAll('.record').length")) && System.nanoTime() < end) Thread.sleep(100);
            assertEquals("1", evaluate(view, "document.querySelectorAll('.record').length"));
            assertEquals("true", evaluate(view, "document.documentElement.scrollWidth<=document.documentElement.clientWidth"));
        } finally { instrumentation.runOnMainSync(activity::finish); }
        MainActivity reopened=(MainActivity)instrumentation.startActivitySync(
            new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            WebView view=webView(reopened.getWindow().getDecorView());
            long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);
            String saved="[...document.querySelectorAll('.saved-open')].find(e=>e.querySelector('strong').textContent==='Android test fixture')";
            while(!"true".equals(evaluate(view,"Boolean("+saved+")"))&&System.nanoTime()<end)Thread.sleep(100);
            assertEquals("true",evaluate(view,"Boolean("+saved+")"));
            assertEquals("false",evaluate(view,"document.querySelector('#connectionHome').hidden"));
            evaluate(view,saved+".click()");
            end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
            while(!"true".equals(evaluate(view,"document.querySelector('#status').classList.contains('connected')"))&&System.nanoTime()<end)Thread.sleep(100);
            assertEquals("true",evaluate(view,"document.querySelector('#status').classList.contains('connected')"));
            assertEquals("true",evaluate(view,"document.querySelector('#connectionHome').hidden"));
        } finally { instrumentation.runOnMainSync(reopened::finish); }
    }

    @Test public void mobileRecordsPaginateFilterAndWrapWithoutHorizontalScroll() throws Exception {
        MainActivity activity = (MainActivity)instrumentation.startActivitySync(
            new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            WebView view = webView(activity.getWindow().getDecorView());
            long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (!"true".equals(evaluate(view, "Boolean(document.querySelector('#demo'))")) && System.nanoTime() < end) Thread.sleep(100);
            evaluate(view, "document.querySelector('#demo').click()");
            assertEquals("20", evaluate(view, "document.querySelectorAll('.record').length"));
            assertEquals("false", evaluate(view, "document.querySelector('#resultsPanel').hidden"));
            assertEquals("true", evaluate(view, "document.querySelector('#queryPanel').hidden"));
            evaluate(view, "document.querySelector('.record summary').click()");
            assertEquals("9", evaluate(view, "document.querySelectorAll('.record[open] .record-field').length"));
            assertEquals("true", evaluate(view, "[...document.querySelectorAll('.record[open] dt,.record[open] pre')].every(e=>e.scrollWidth<=e.clientWidth+1)"));
            assertEquals("true", evaluate(view, "document.documentElement.scrollWidth<=document.documentElement.clientWidth"));
            evaluate(view, "document.querySelector('#nextPage').click()");
            assertEquals("4", evaluate(view, "document.querySelectorAll('.record').length"));
            assertEquals("true", evaluate(view, "document.querySelector('#nextPage').disabled"));
            evaluate(view, "document.querySelector('.record summary').click();document.querySelector('#results .relation-link').click()");
            assertEquals("true",evaluate(view,"document.querySelector('#relatedDialog').open"));
            assertEquals("\"clienti\"",evaluate(view,"document.querySelector('#relatedTitle').textContent"));
            assertEquals("true",evaluate(view,"document.querySelector('#relatedDialog').scrollWidth<=document.querySelector('#relatedDialog').clientWidth+1"));
            evaluate(view,"document.querySelector('#relatedDialog .relation-link').click()");
            assertEquals("\"aziende\"",evaluate(view,"document.querySelector('#relatedTitle').textContent"));
            evaluate(view,"document.querySelector('.related-back').click()");
            assertEquals("\"clienti\"",evaluate(view,"document.querySelector('#relatedTitle').textContent"));
            evaluate(view,"document.querySelector('.related-close').click()");
            assertEquals("\"21–24 di 24\"",evaluate(view,"document.querySelector('#pageRange').textContent"));

            evaluate(view, "(()=>{const s=document.querySelector('#resultSearch');s.value='Elena';s.dispatchEvent(new Event('input'))})()");
            assertEquals("4", evaluate(view, "document.querySelectorAll('.record').length"));
            evaluate(view, "document.querySelector('[data-view=schema]').click();document.querySelector('.schema-table summary').click()");
            assertEquals("true", evaluate(view, "document.documentElement.scrollWidth<=document.documentElement.clientWidth"));
            assertEquals("true", evaluate(view, "[...document.querySelectorAll('.column span')].every(e=>e.scrollWidth<=e.clientWidth+1)"));
            evaluate(view, "document.querySelector('.prepare-query').click()");
            assertEquals("false", evaluate(view, "document.querySelector('#queryPanel').hidden"));
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }
}
