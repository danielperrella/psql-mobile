package it.psqlmobile.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.UUID;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class InverseRelationsTest {
    @Test public void listsCompositeForeignKeysAndReadsBoundPagedRows() throws Exception {
        String uri = InstrumentationRegistry.getArguments().getString("postgresUri");
        assertNotNull(uri);
        try (PgDatabase db = new PgDatabase()) {
            String session = db.connect(new JSONObject().put("connectionString", uri)).getString("session");
            db.query(session, "CREATE TEMP TABLE inverse_parent(tenant text,id integer,label text,PRIMARY KEY(tenant,id));" +
                "CREATE TEMP TABLE inverse_orders(order_id integer PRIMARY KEY,tenant text,customer_id integer,note text," +
                "FOREIGN KEY(tenant,customer_id) REFERENCES inverse_parent(tenant,id));" +
                "CREATE TEMP TABLE inverse_unique_parent(id integer PRIMARY KEY,code text UNIQUE,label text);" +
                "CREATE TEMP TABLE inverse_unique_children(id integer PRIMARY KEY,parent_code text REFERENCES inverse_unique_parent(code));" +
                "CREATE TEMP TABLE inverse_hidden_parent(id integer PRIMARY KEY,code text UNIQUE,label text);" +
                "CREATE TEMP TABLE inverse_hidden_children(id integer PRIMARY KEY,parent_code text REFERENCES inverse_hidden_parent(code));" +
                "INSERT INTO inverse_parent VALUES('t',5,'Cliente');" +
                "INSERT INTO inverse_unique_parent VALUES(88,'U-1','Cliente univoco');" +
                "INSERT INTO inverse_unique_children VALUES(1,'U-1');" +
                "INSERT INTO inverse_hidden_parent VALUES(99,'H-1','Hidden');" +
                "INSERT INTO inverse_hidden_children VALUES(1,'H-1');" +
                "INSERT INTO inverse_orders SELECT n,'t',5,'Ordine '||n FROM generate_series(1,26) n;" +
                "INSERT INTO inverse_orders VALUES(27,NULL,NULL,'Senza cliente');" +
                "ALTER TABLE inverse_orders ENABLE ROW LEVEL SECURITY;" +
                "ALTER TABLE inverse_orders FORCE ROW LEVEL SECURITY;" +
                "CREATE POLICY inverse_orders_visible ON inverse_orders USING (true);" +
                "ALTER TABLE inverse_hidden_parent ENABLE ROW LEVEL SECURITY;" +
                "ALTER TABLE inverse_hidden_parent FORCE ROW LEVEL SECURITY;" +
                "CREATE POLICY inverse_hidden_visible ON inverse_hidden_parent USING (label <> 'Hidden')");
            JSONObject target = new JSONObject().put("schema", "pg_temp_3").put("table", "inverse_parent");
            // Resolve the temporary schema name from PostgreSQL instead of assuming a session suffix.
            JSONObject schema = db.query(session, "SELECT n.nspname AS schema FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relnamespace=pg_my_temp_schema() AND c.relname='inverse_parent'")
                .getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0);
            target.put("schema", schema.getString("schema"));
            JSONObject keys = new JSONObject().put("tenant", "t").put("id", "5");
            JSONArray relations = InverseRelations.list(db.connection(session), target, keys);
            assertEquals(1, relations.length());
            JSONObject relation = relations.getJSONObject(0);
            assertEquals("inverse_orders", relation.getString("sourceTable"));
            assertEquals("tenant", relation.getJSONArray("targetColumns").getString(0));
            assertEquals("id", relation.getJSONArray("targetColumns").getString(1));
            assertEquals("t", relation.getJSONObject("targetKeys").getString("tenant"));
            assertEquals("5", relation.getJSONObject("targetKeys").getString("id"));

            JSONObject first = InverseRelations.read(db.connection(session), relation.getString("id"), keys, 0);
            assertEquals(25, first.getJSONArray("rows").length());
            assertTrue(first.getBoolean("hasMore"));
            assertEquals("Ordine 1", first.getJSONArray("rows").getJSONObject(0).getString("note"));
            JSONObject second = InverseRelations.read(db.connection(session), relation.getString("id"), keys, 25);
            assertEquals(1, second.getJSONArray("rows").length());
            assertFalse(second.getBoolean("hasMore"));
            assertEquals("Ordine 26", second.getJSONArray("rows").getJSONObject(0).getString("note"));

            try { InverseRelations.list(db.connection(session), target, new JSONObject().put("tenant", "t")); fail("Accepted incomplete key"); }
            catch (IllegalArgumentException expected) { }
            try { InverseRelations.read(db.connection(session), "1;DROP TABLE inverse_orders", keys, 0); fail("Accepted invented relation ID"); }
            catch (IllegalArgumentException expected) { }
            try { InverseRelations.read(db.connection(session), relation.getString("id"), keys, 1); fail("Accepted unaligned offset"); }
            catch (IllegalArgumentException expected) { }

            JSONObject uniqueTarget = new JSONObject().put("schema", schema.getString("schema")).put("table", "inverse_unique_parent");
            JSONArray uniqueRelations = InverseRelations.list(db.connection(session), uniqueTarget, new JSONObject().put("id", "88"));
            assertEquals(1, uniqueRelations.length());
            JSONObject unique = uniqueRelations.getJSONObject(0);
            assertEquals("code", unique.getJSONArray("targetColumns").getString(0));
            assertEquals("U-1", unique.getJSONObject("targetKeys").getString("code"));
            JSONObject uniquePage = InverseRelations.read(db.connection(session), unique.getString("id"), new JSONObject().put("id", "88"), 0);
            assertEquals("U-1", uniquePage.getJSONArray("rows").getJSONObject(0).getString("parent_code"));

            JSONObject hiddenTarget = new JSONObject().put("schema", schema.getString("schema")).put("table", "inverse_hidden_parent");
            String hiddenRelationId = db.query(session, "SELECT c.oid::text AS id FROM pg_constraint c JOIN pg_class t ON t.oid=c.confrelid WHERE c.contype='f' AND t.relname='inverse_hidden_parent'")
                .getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0).getString("id");
            String superuser = db.query(session, "SELECT CASE WHEN r.rolsuper THEN 1 ELSE 0 END AS super FROM pg_roles r WHERE r.rolname=current_user")
                .getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0).getString("super");
            if ("1".equals(superuser)) {
                String fixtureRole = "inverse_test_" + UUID.randomUUID().toString().replace("-", "");
                db.query(session, "CREATE ROLE " + fixtureRole + " NOSUPERUSER NOBYPASSRLS");
                try {
                    String quotedSchema = "\"" + schema.getString("schema").replace("\"", "\"\"") + "\"";
                    db.query(session, "GRANT USAGE ON SCHEMA " + quotedSchema + " TO " + fixtureRole);
                    db.query(session, "GRANT SELECT ON TABLE " + quotedSchema + ".\"inverse_parent\", " + quotedSchema + ".\"inverse_orders\", " +
                        quotedSchema + ".\"inverse_unique_parent\", " + quotedSchema + ".\"inverse_unique_children\", " +
                        quotedSchema + ".\"inverse_hidden_parent\", " + quotedSchema + ".\"inverse_hidden_children\" TO " + fixtureRole);
                    db.query(session, "SET ROLE " + fixtureRole);
                    assertHiddenParentIsDenied(db, session, hiddenTarget, hiddenRelationId);
                } finally {
                    try { db.query(session, "RESET ROLE"); } catch (Exception ignored) { }
                    try { db.query(session, "DROP OWNED BY " + fixtureRole); } catch (Exception ignored) { }
                    db.query(session, "DROP ROLE IF EXISTS " + fixtureRole);
                }
            } else {
                assertHiddenParentIsDenied(db, session, hiddenTarget, hiddenRelationId);
            }
        }
    }

    private static void assertHiddenParentIsDenied(PgDatabase db, String session, JSONObject target, String relationId) throws Exception {
        try { InverseRelations.list(db.connection(session), target, new JSONObject().put("id", "99")); fail("Listed a parent hidden by RLS"); }
        catch (IllegalStateException expected) { }
        try { InverseRelations.read(db.connection(session), relationId, new JSONObject().put("id", "99"), 0); fail("Read children of a parent hidden by RLS"); }
        catch (IllegalStateException expected) { }
    }
}
