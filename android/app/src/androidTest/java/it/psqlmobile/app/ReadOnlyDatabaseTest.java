package it.psqlmobile.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Run only against the disposable PostgreSQL fixture. */
@RunWith(AndroidJUnit4.class)
public class ReadOnlyDatabaseTest {
    @Test public void readOnlySessionUsesServerTransactionModeAndHidesRecordMutations() throws Exception {
        String uri=InstrumentationRegistry.getArguments().getString("postgresUri"); assertNotNull(uri);
        String table="readonly_probe_"+java.util.UUID.randomUUID().toString().replace("-","");
        try(PgDatabase db=new PgDatabase()) {
            String writer=db.connect(new JSONObject().put("connectionString",uri)).getString("session");
            String reader=null;
            try {
                db.query(writer,"CREATE TABLE "+table+"(id integer PRIMARY KEY, label text); INSERT INTO "+table+" VALUES (1,'fixture')");
                JSONObject connected=db.connect(new JSONObject().put("connectionString",uri).put("readOnly",true));
                reader=connected.getString("session"); assertTrue(connected.getBoolean("readOnly")); assertTrue(db.isReadOnly(reader));
                JSONObject status=db.query(reader,"SHOW transaction_read_only").getJSONArray("results").getJSONObject(0);
                assertEquals("on",status.getJSONArray("rows").getJSONObject(0).getString("transaction_read_only"));
                JSONObject selected=db.query(reader,"SELECT * FROM "+table).getJSONArray("results").getJSONObject(0);
                assertEquals("fixture",selected.getJSONArray("rows").getJSONObject(0).getString("label"));
                JSONObject target=selected.getJSONArray("recordTargets").getJSONObject(0);
                assertFalse(target.getBoolean("canInsert")); assertFalse(target.getBoolean("canUpdate")); assertFalse(target.getBoolean("canDelete"));
                try { db.requireWritable(reader); fail("CRUD guard allowed read-only session"); }
                catch(java.sql.SQLException expected){assertEquals("25006",expected.getSQLState());}
                rejects(db,reader,"UPDATE "+table+" SET label='changed'");
                rejects(db,reader,"WITH changed AS (DELETE FROM "+table+" RETURNING *) SELECT * FROM changed");
                rejects(db,reader,"CREATE TABLE "+table+"_ddl(id integer)");
                rejects(db,reader,"COMMIT; INSERT INTO "+table+" VALUES (2,'escape')");
                rejects(db,reader,"SELECT set_config('default_transaction_read_only','off',false)");
                db.query(writer,"CREATE FUNCTION "+table+"_effect() RETURNS integer LANGUAGE sql AS $$ UPDATE "+table+" SET label='function write' WHERE id=1 RETURNING id $$");
                try{db.query(reader,"SELECT "+table+"_effect()");fail("A function wrote through the read-only transaction");}
                catch(java.sql.SQLException expected){assertEquals("25006",expected.getSQLState());}
                assertEquals("on",db.query(reader,"SHOW transaction_read_only").getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0).getString("transaction_read_only"));
                assertEquals("fixture",db.query(writer,"SELECT label FROM "+table+" WHERE id=1").getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0).getString("label"));
            } finally {
                if(reader!=null)db.disconnect(reader);
                db.query(writer,"DROP FUNCTION IF EXISTS "+table+"_effect()");
                db.query(writer,"DROP TABLE IF EXISTS "+table);
            }
        }
    }

    private static void rejects(PgDatabase db,String session,String sql)throws Exception {
        try { db.query(session,sql); fail("Accepted SQL in read-only session: "+sql); }
        catch(IllegalArgumentException expected){assertTrue(expected.getMessage().contains("sola lettura"));}
    }
}
