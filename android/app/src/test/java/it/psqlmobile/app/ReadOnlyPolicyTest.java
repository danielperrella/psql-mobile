package it.psqlmobile.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class ReadOnlyPolicyTest {
    @Test public void permitsReadStatementsAndScriptsWithCommentsAndQuotedText() {
        ReadOnlyPolicy.requireReadOnlySql("-- read only\nSELECT 'delete; set_config(1)' AS note; /* nested /* comment */ */ VALUES (1); SHOW search_path; EXPLAIN SELECT 1");
        ReadOnlyPolicy.requireReadOnlySql("WITH x AS (SELECT 1 AS n) SELECT n FROM x");
        ReadOnlyPolicy.requireReadOnlySql("SELECT E'escaped \\\\' AS text; SELECT $body$COMMIT; DELETE FROM t$body$ AS text /* nested /* DELETE */ comment */");
    }

    @Test public void rejectsWritesDdlAndWriteCtes() {
        rejects("INSERT INTO t VALUES (1)");
        rejects("WITH removed AS (DELETE FROM t RETURNING *) SELECT * FROM removed");
        rejects("SELECT 1 INTO new_table");
        rejects("CREATE TEMP TABLE local_data(id int)");
        rejects("EXPLAIN ANALYZE SELECT 1");
    }

    @Test public void rejectsTransactionAndSessionSettingEscapeAttempts() {
        rejects("SELECT '\\'; COMMIT; INSERT INTO t VALUES (1)");
        rejects("COMMIT; INSERT INTO t VALUES (1)");
        rejects("SELECT 1; SET default_transaction_read_only = off; INSERT INTO t VALUES (1)");
        rejects("SELECT set_config('default_transaction_read_only','off',false)");
        rejects("SELECT \"set_config\"('default_transaction_read_only','off',false)");
        rejects("SELECT pg_notify('channel','message')");
        rejects("SELECT dblink_exec('host=db','DELETE FROM t')");
    }

    private static void rejects(String sql) {
        try { ReadOnlyPolicy.requireReadOnlySql(sql); fail("Allowed unsafe SQL: " + sql); }
        catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("sola lettura")); }
    }
}
