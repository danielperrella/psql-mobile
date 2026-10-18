package it.psqlmobile.app;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class FavoritesStoreTest {
    @Test public void favoritesAreEncryptedPartitionedAndUseCompletePrimaryKeys() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        String profile="d".repeat(64), value="900719925474099312345";
        FavoritesStore store=new FavoritesStore(context);
        JSONObject favorite=new JSONObject().put("kind","record").put("schema","private_schema").put("table","private_table")
            .put("keys",new JSONArray().put(new JSONObject().put("column","tenant_id").put("value",value))
                .put(new JSONObject().put("column","row_id").put("value","00000000000000000042")));
        try {
            store.save(profile,favorite);
            JSONObject reordered=new JSONObject().put("kind","record").put("schema","private_schema").put("table","private_table")
                .put("keys",new JSONArray().put(new JSONObject().put("column","row_id").put("value","00000000000000000042"))
                    .put(new JSONObject().put("column","tenant_id").put("value",value)));
            store.save(profile,reordered);
            store.save("demo",new JSONObject().put("kind","table").put("schema","public").put("table","ordini"));
            FavoritesStore recreated=new FavoritesStore(context);
            assertEquals(1,recreated.list(profile).length());
            assertEquals(reordered.toString(),recreated.list(profile).getJSONObject(0).toString());
            assertEquals(1,recreated.list("demo").length());
            String stored=context.getSharedPreferences("saved_favorites",Context.MODE_PRIVATE).getString(profile,"");
            assertFalse(stored.contains("private_schema"));assertFalse(stored.contains(value));
            String id="[\"record\",\"private_schema\",\"private_table\",[[\"row_id\",\"00000000000000000042\"],[\"tenant_id\",\""+value+"\"]]]";
            recreated.remove(profile,id);
            assertEquals(0,recreated.list(profile).length());
            assertEquals(1,recreated.list("demo").length());
        } finally {
            store.remove(profile,"[\"record\",\"private_schema\",\"private_table\",[[\"row_id\",\"00000000000000000042\"],[\"tenant_id\",\""+value+"\"]]]");
            store.remove("demo","[\"table\",\"public\",\"ordini\"]");
        }
    }
}
