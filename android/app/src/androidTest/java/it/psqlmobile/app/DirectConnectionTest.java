package it.psqlmobile.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Run against the disposable SCRAM-authenticated PostgreSQL fixture, never a user's DB. */
@RunWith(AndroidJUnit4.class)
public class DirectConnectionTest {
    @Test public void connectsWithoutGatewayAndExecutesRealSql() throws Exception {
        String uri = InstrumentationRegistry.getArguments().getString("postgresUri");
        assertNotNull("Pass -Pandroid.testInstrumentationRunnerArguments.postgresUri=...", uri);
        try (PgDatabase db = new PgDatabase()) {
            String id = db.connect(new JSONObject().put("connectionString", uri)).getString("session");
            db.query(id, "CREATE TEMP TABLE psql_mobile_probe(id integer, label text); INSERT INTO psql_mobile_probe VALUES (1,'prova')");
            boolean found = false;
            JSONArray schema = db.schema(id);
            for (int i = 0; i < schema.length(); i++) if (schema.getJSONObject(i).getString("table_name").equals("psql_mobile_probe")) found = true;
            assertTrue("Live schema must include the real table", found);
            JSONObject result = db.query(id, "SELECT 42::bigint AS answer, NULL::text AS empty, 'città'::text AS unicode");
            JSONObject row = result.getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0);
            assertEquals("42", row.getString("answer"));
            assertTrue(row.isNull("empty"));
            assertEquals("città", row.getString("unicode"));
            JSONArray batch = db.query(id, "SELECT 1 AS a; SELECT 2 AS b").getJSONArray("results");
            assertEquals(2, batch.length());
            JSONObject limited = db.query(id, "SELECT generate_series(1,1100) AS n").getJSONArray("results").getJSONObject(0);
            assertEquals(1000, limited.getJSONArray("rows").length());
            assertTrue(limited.getBoolean("truncated"));
            JSONObject duplicates = db.query(id, "SELECT 1 AS x, 2 AS x").getJSONArray("results").getJSONObject(0);
            assertEquals("x (2)", duplicates.getJSONArray("fields").getString(1));
            try { db.query(id, "SELECT missing_column"); fail("Expected SQL error"); }
            catch (java.sql.SQLException expected) { assertEquals("42703", expected.getSQLState()); }
            assertEquals(1, db.query(id, "SELECT true AS alive").getJSONArray("results").length());
            db.disconnect(id);
            try { db.query(id, "SELECT 1"); fail("Session still active"); }
            catch (java.sql.SQLException expected) { assertEquals("08003", expected.getSQLState()); }
        }
    }

    @Test public void tlsAndCertificateValidation() throws Exception {
        String uri = InstrumentationRegistry.getArguments().getString("postgresTlsUri");
        org.junit.Assume.assumeNotNull(uri);
        try (PgDatabase db = new PgDatabase()) {
            String id = db.connect(new JSONObject().put("connectionString", uri)).getString("session");
            JSONObject row = db.query(id, "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()")
                .getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0);
            assertEquals("t", row.getString("ssl"));
            db.disconnect(id);
            // The fixture has an untrusted self-signed certificate: verified TLS must reject it.
            try { db.connect(new JSONObject().put("connectionString", uri).put("ssl", "verify-full")); fail("Accepted untrusted certificate"); }
            catch (java.sql.SQLException expected) {
                assertFalse(expected.getMessage().contains("psql-test-only"));
            }
        }
    }
}
