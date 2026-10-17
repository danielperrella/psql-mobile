package it.psqlmobile.app;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AppUpdaterTest {
    @Test public void acceptsSameSignerAndRejectsCorruptionAndDifferentSigner() throws Exception {
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        Context test=instrumentation.getContext();
        Assume.assumeTrue("Generate local updater APK fixtures first",java.util.Arrays.asList(test.getAssets().list("")).contains("update-good.apk"));
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        File apk=new File(activity.getCacheDir(),"updater-test.apk");
        try {
            AppUpdater updater=new AppUpdater(activity);
            try(InputStream input=test.getAssets().open("update-good.apk");OutputStream output=new FileOutputStream(apk)){byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);}
            JSONObject manifest=new JSONObject().put("versionCode",BuildConfig.VERSION_CODE+1).put("versionName","test")
                .put("apkUrl",AppUpdater.BASE+"psql-mobile.apk").put("size",apk.length()).put("sha256",AppUpdater.digest(apk));
            updater.verify(apk,manifest);
            try{updater.verify(apk,new JSONObject(manifest.toString()).put("sha256","0".repeat(64)));fail("Corruption accepted");}catch(SecurityException expected){}
            try(InputStream input=test.getAssets().open("update-other-signer.apk");OutputStream output=new FileOutputStream(apk)){byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);}
            manifest.put("size",apk.length()).put("sha256",AppUpdater.digest(apk));
            try{updater.verify(apk,manifest);fail("Different signer accepted");}catch(SecurityException expected){}
        }finally{apk.delete();instrumentation.runOnMainSync(activity::finish);}
    }
}
