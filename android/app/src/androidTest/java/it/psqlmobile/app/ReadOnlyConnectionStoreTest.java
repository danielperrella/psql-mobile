package it.psqlmobile.app;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ReadOnlyConnectionStoreTest {
    @Test public void readOnlyChoiceSurvivesEncryptedProfileSaveAndList() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        ConnectionStore store=new ConnectionStore(context);
        JSONObject profile=store.save(new JSONObject().put("connectionString","postgresql://readonly_user:fixture-secret@db.example.com/catalog"+
            "?sslmode=require").put("readOnly",true),"Catalogo consultazione","");
        String id=profile.getString("id");
        try {
            JSONObject saved=store.read(id);
            assertTrue(saved.getJSONObject("config").getBoolean("readOnly"));
            JSONArray list=store.list(); boolean found=false;
            for(int i=0;i<list.length();i++)if(list.getJSONObject(i).getString("id").equals(id)){
                found=true; assertTrue(list.getJSONObject(i).getBoolean("readOnly"));
            }
            assertTrue(found);
            String atRest=context.getSharedPreferences("saved_connections",Context.MODE_PRIVATE).getString(id,"");
            assertFalse(atRest.contains("fixture-secret"));
        } finally { store.remove(id); }
    }
}
