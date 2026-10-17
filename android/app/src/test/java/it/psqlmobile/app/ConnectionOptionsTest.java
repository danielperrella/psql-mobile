package it.psqlmobile.app;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class ConnectionOptionsTest {
    @Test public void acceptsPsqlCommandWithoutLosingNeonStyleOptions() throws Exception {
        String uri = "postgresql://utente:password@db.example.com/database?sslmode=require&channel_binding=require";
        for (String value : new String[]{"psql '" + uri + "'", "psql \"" + uri + "\"", "psql " + uri, "psql ‘" + uri + "’", "'" + uri + "'"}) {
            ConnectionOptions options = ConnectionOptions.parse(new JSONObject().put("connectionString", value));
            assertEquals("jdbc:postgresql://db.example.com:5432/database", options.jdbcUrl);
            assertEquals("require", options.properties.getProperty("sslmode"));
            assertEquals("require", options.properties.getProperty("channelBinding"));
        }
    }
    @Test public void invalidCommandHasSpecificFeedbackInsteadOfPasswordBlame() throws Exception {
        for (String value : new String[]{"psql 'postgresql://user:secret@db.example.com/db", "psql --help", "postgres://user:secret%oops@db/db"}) {
            try { ConnectionOptions.parse(new JSONObject().put("connectionString", value)); fail("Invalid paste accepted"); }
            catch (IllegalArgumentException expected) {
                assertFalse(expected.getMessage().contains("secret"));
                assertFalse(expected.getMessage().contains("Codifica i caratteri speciali della password"));
                assertTrue(expected.getMessage().contains("Virgolette") || expected.getMessage().contains("Dopo psql") || expected.getMessage().contains("Sequenza %"));
            }
        }
    }
    @Test public void uriOnlyAndEncodedCredentials() throws Exception {
        ConnectionOptions options = ConnectionOptions.parse(new JSONObject().put("connectionString",
            "postgresql://my%40user:p%40ss+word%3A%2F@db.example/my%20db"));
        assertEquals("jdbc:postgresql://db.example:5432/my%20db", options.jdbcUrl);
        assertEquals("my@user", options.properties.getProperty("user"));
        assertEquals("p@ss+word:/", options.properties.getProperty("password"));
        assertEquals("verify-full", options.properties.getProperty("sslmode"));
        assertEquals("org.postgresql.ssl.DefaultJavaSSLFactory", options.properties.getProperty("sslfactory"));
    }
    @Test public void ipv6AndUriTlsAreRespected() throws Exception {
        ConnectionOptions options = ConnectionOptions.parse(new JSONObject().put("connectionString",
            "postgres://user:password@[::1]:5440/db?sslmode=require&channel_binding=require"));
        assertEquals("jdbc:postgresql://[::1]:5440/db", options.jdbcUrl);
        assertEquals("require", options.properties.getProperty("sslmode"));
        assertEquals("require", options.properties.getProperty("channelBinding"));
        assertNull(options.properties.getProperty("sslfactory"));
    }
    @Test public void explicitTlsOverridesUri() throws Exception {
        ConnectionOptions options = ConnectionOptions.parse(new JSONObject().put("connectionString",
            "postgres://user@db.example/db?sslmode=disable").put("ssl", "verify-full"));
        assertEquals("verify-full", options.properties.getProperty("sslmode"));
    }
    @Test public void queryCredentialsAndDatabaseDefault() throws Exception {
        ConnectionOptions options = ConnectionOptions.parse(new JSONObject().put("connectionString",
            "postgres://db.example/?user=alice&password=a%2Bb"));
        assertEquals("jdbc:postgresql://db.example:5432/alice", options.jdbcUrl);
        assertEquals("a+b", options.properties.getProperty("password"));
    }
    @Test public void invalidOptionsNeverEchoCredentials() throws Exception {
        for (String uri : new String[]{"https://user:secret@db.example/db", "postgres://user:secret@db/db?sslfactory=evil.Class", "postgres://user:secret@db:99999/db"}) {
            try { ConnectionOptions.parse(new JSONObject().put("connectionString", uri)); fail("Accepted invalid URI"); }
            catch (IllegalArgumentException e) { assertFalse(e.getMessage().contains("secret")); }
        }
    }
}
