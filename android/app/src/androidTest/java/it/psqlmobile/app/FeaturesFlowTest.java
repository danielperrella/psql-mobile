package it.psqlmobile.app;

import android.app.Instrumentation;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class FeaturesFlowTest {
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private WebView web(View view){if(view instanceof WebView)return (WebView)view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){WebView child=web(((ViewGroup)view).getChildAt(i));if(child!=null)return child;}return null;}
    private String js(WebView view,String code)throws Exception{CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();instrumentation.runOnMainSync(()->view.evaluateJavascript(code,value->{result.set(value);latch.countDown();}));assertTrue(latch.await(5,TimeUnit.SECONDS));return result.get();}
    private void until(WebView view,String expression)throws Exception{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);while(!"true".equals(js(view,expression))&&System.nanoTime()<end)Thread.sleep(100);assertEquals(expression,"true",js(view,expression));}
    private MainActivity start()throws Exception{MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));until(web(activity.getWindow().getDecorView()),"Boolean(document.querySelector('#demo'))");return activity;}
    private void demo(WebView view)throws Exception{js(view,"document.querySelector('#demo').click()");until(view,"document.querySelectorAll('#results .record').length===20");}
    private void customers(WebView view)throws Exception{js(view,"document.querySelector('[data-view=schema]').click();[...document.querySelectorAll('.schema-table')].find(e=>e.dataset.table==='public.clienti').querySelector('.prepare-query').click();document.querySelector('#run').click()");until(view,"document.querySelectorAll('#results .record').length===6");}

    @Test public void visualFiltersAndFavoritesPersistAcrossActivityReopen()throws Exception{
        instrumentation.getTargetContext().getSharedPreferences("saved_favorites",0).edit().remove("demo").commit();
        MainActivity activity=start();
        try{WebView view=web(activity.getWindow().getDecorView());demo(view);
            js(view,"document.querySelector('[data-view=schema]').click();[...document.querySelectorAll('.schema-table')].find(e=>e.dataset.table==='public.clienti').querySelectorAll('.prepare-query')[1].click();document.querySelector('.tb-secondary').click()");
            js(view,"(()=>{const column=document.querySelector('.tb-condition-column');column.value='nome';column.dispatchEvent(new Event('change'));const op=document.querySelector('.tb-condition-operator');op.value='contains';op.dispatchEvent(new Event('change'));const value=document.querySelector('.tb-condition-value');value.value='Sofia';value.dispatchEvent(new Event('input'));document.querySelector('.tb-apply').click()})()");
            until(view,"document.querySelectorAll('#results .record').length===1&&document.querySelector('#results').textContent.includes('Sofia Conti')");
            js(view,"document.querySelector('#results .record-open-hint').click()");until(view,"Boolean(document.querySelector('.favorite-record'))");
            js(view,"document.querySelector('.favorite-record').click()");until(view,"document.querySelector('.favorite-record').textContent.includes('Rimuovi')");
            assertEquals(1,new FavoritesStore(instrumentation.getTargetContext()).list("demo").length());
        }finally{instrumentation.runOnMainSync(activity::finish);}
        MainActivity reopened=start();
        try{WebView view=web(reopened.getWindow().getDecorView());demo(view);js(view,"document.querySelector('[data-view=schema]').click()");until(view,"Boolean(document.querySelector('.favorite-item__open'))");
            js(view,"document.querySelector('.favorite-item__open').click()");until(view,"document.querySelector('#relatedDialog').open&&document.querySelector('.related-content').textContent.includes('Sofia Conti')");
            assertEquals("true",js(view,"document.documentElement.scrollWidth<=document.documentElement.clientWidth"));
        }finally{instrumentation.runOnMainSync(reopened::finish);}
    }

    @Test public void duplicatesKeepOriginalAndReadOnlyHidesAllMutationActions()throws Exception{
        MainActivity activity=start();try{WebView view=web(activity.getWindow().getDecorView());demo(view);customers(view);
            js(view,"document.querySelector('#results .record-open-hint').click();document.querySelector('.duplicate-record').click()");until(view,"document.querySelector('#recordEditor').open&&document.querySelector('.editor-kind').textContent==='Duplica record'");
            assertEquals("\"Elena Rossi\"",js(view,"document.querySelector('[aria-label=nome]').value"));
            assertEquals("true",js(view,"document.querySelector('.editor-fields').textContent.includes('Automatico')"));
            js(view,"document.querySelector('[aria-label=nome]').value='Cliente duplicato test';document.querySelector('.editor-save').click()");until(view,"!document.querySelector('#recordEditor').open&&document.querySelector('.related-content').textContent.includes('Cliente duplicato test')");
            assertEquals("true",js(view,"document.querySelector('.related-content').textContent.includes('207')"));
            js(view,"document.querySelector('.related-back').click()");assertEquals("true",js(view,"document.querySelector('.related-content').textContent.includes('Elena Rossi')&&!document.querySelector('.related-content').textContent.includes('Cliente duplicato test')"));
            js(view,"document.querySelector('.related-close').click();document.querySelector('[data-view=query]').click();document.querySelector('#demoReadOnly').click();document.querySelector('[data-view=results]').click()");
            assertEquals("0",js(view,"document.querySelectorAll('#results .record-actions button,#results .create-record').length"));
            js(view,"document.querySelector('#results .record-open-hint').click()");assertEquals("0",js(view,"document.querySelectorAll('#relatedDialog .edit-record,#relatedDialog .delete-record,#relatedDialog .duplicate-record').length"));
            assertEquals("false",js(view,"document.querySelector('#readOnlyStatus').hidden"));
        }finally{instrumentation.runOnMainSync(activity::finish);}
    }

    @Test public void inverseNavigationReturnsToFilteredParentWithoutAnAccordion()throws Exception{
        MainActivity activity=start();try{WebView view=web(activity.getWindow().getDecorView());demo(view);customers(view);
            js(view,"(()=>{const search=document.querySelector('#resultSearch');search.value='Sofia';search.dispatchEvent(new Event('input'));document.querySelector('#results .record-open-hint').click()})()");until(view,"Boolean(document.querySelector('.inverse-relation-choice'))");
            js(view,"document.querySelector('.inverse-relation-choice').click()");until(view,"document.querySelectorAll('.inverse-record-row').length===4");
            js(view,"document.querySelector('.inverse-record-row').click()");assertEquals("\"ordini\"",js(view,"document.querySelector('#relatedTitle').textContent"));
            js(view,"document.querySelector('.related-back').click()");assertEquals("\"clienti\"",js(view,"document.querySelector('#relatedTitle').textContent"));assertEquals("4",js(view,"document.querySelectorAll('.inverse-record-row').length"));
            js(view,"document.querySelector('.related-close').click()");assertEquals("\"Sofia\"",js(view,"document.querySelector('#resultSearch').value"));assertEquals("1",js(view,"document.querySelectorAll('#results .record').length"));
            assertEquals("0",js(view,"document.querySelectorAll('#results details,#results summary').length"));
        }finally{instrumentation.runOnMainSync(activity::finish);}
    }
}
