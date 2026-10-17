package it.psqlmobile.app;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ConnectionStoreTest {
    @Test public void credentialsSurviveStoreRecreationAndAreEncryptedAtRest() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        ConnectionStore store=new ConnectionStore(context);
        String uri="postgresql://store_test:private-test-secret@db.example.com/saved_probe?sslmode=require&channel_binding=require";
        JSONObject profile=store.save(new JSONObject().put("connectionString","psql '"+uri+"'").put("ssl","auto"),"Database prova","");
        String id=profile.getString("id");
        try{
            String stored=context.getSharedPreferences("saved_connections",Context.MODE_PRIVATE).getString(id,"");
            assertFalse(stored.contains("private-test-secret"));assertFalse(stored.contains("postgresql://"));assertFalse(stored.contains("Database prova"));
            ConnectionStore recreated=new ConnectionStore(context);
            assertEquals(uri,recreated.read(id).getJSONObject("config").getString("connectionString"));
            assertFalse(recreated.list().toString().contains("private-test-secret"));
            JSONObject updated=recreated.save(new JSONObject().put("connectionString",uri.replace("private-test-secret","new-secret")),"Rinominata",id);
            assertEquals(id,updated.getString("id"));assertEquals("Rinominata",recreated.read(id).getString("name"));
            assertTrue(recreated.read(id).getJSONObject("config").getString("connectionString").contains("new-secret"));
        }finally{store.remove(id);}
        try{store.read(id);fail("Removed profile");}catch(IllegalArgumentException expected){}
    }
}
