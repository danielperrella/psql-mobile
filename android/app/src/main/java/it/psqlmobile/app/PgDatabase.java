package it.psqlmobile.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.sql.*;
import java.util.*;

/** Runs on one worker thread. No HTTP server or gateway is involved. */
public final class PgDatabase implements AutoCloseable {
    private static final int MAX_ROWS = 1000, MAX_CELL = 65536, MAX_RESULT_CHARS = 2_000_000;
    private static final long IDLE_MS = 30 * 60 * 1000L;
    private static class Session {
        final Connection connection;
        long lastUsed = System.nanoTime();
        Session(Connection connection) { this.connection = connection; }
    }
    private final Map<String,Session> sessions = new HashMap<>();

    public JSONObject connect(JSONObject input) throws Exception {
        expire();
        if (sessions.size() >= 2) throw new IllegalStateException("Disconnetti la sessione precedente.");
        ConnectionOptions options = ConnectionOptions.parse(input);
        Connection connection = null;
        try {
            // Explicit loading also works on Android, which doesn't guarantee JDBC service discovery.
            Class.forName("org.postgresql.Driver");
            connection = DriverManager.getConnection(options.jdbcUrl, options.properties);
            try (Statement statement = connection.createStatement()) {
                statement.execute("SET statement_timeout = '15s'");
            }
            String id = UUID.randomUUID().toString();
            sessions.put(id, new Session(connection));
            return new JSONObject().put("session", id);
        } catch (SQLException e) {
            if (connection != null) try { connection.close(); } catch (SQLException ignored) { }
            throw new SQLException("Connessione fallita. Verifica dati, raggiungibilità del database e impostazioni TLS.", e.getSQLState());
        } finally { options.properties.clear(); }
    }

    private Connection connection(String id) throws SQLException {
        expire();
        Session session = sessions.get(id);
        if (session == null || session.connection.isClosed()) {
            sessions.remove(id);
            throw new SQLException("Sessione scaduta: riconnettiti.", "08003");
        }
        session.lastUsed = System.nanoTime();
        return session.connection;
    }

    public JSONArray schema(String id) throws Exception {
        JSONArray columns = new JSONArray();
        try (Statement statement = connection(id).createStatement()) {
            statement.setQueryTimeout(15);
            statement.setMaxRows(10000);
            try (ResultSet result = statement.executeQuery("SELECT table_schema,table_name,column_name,data_type FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name,ordinal_position")) {
                while (result.next()) columns.put(new JSONObject()
                    .put("table_schema", result.getString(1)).put("table_name", result.getString(2))
                    .put("column_name", result.getString(3)).put("data_type", result.getString(4)));
            }
        }
        return columns;
    }

    public JSONObject query(String id, String sql) throws Exception {
        if (sql == null || sql.trim().isEmpty()) throw new IllegalArgumentException("Query vuota.");
        if (sql.length() > 65536) throw new IllegalArgumentException("Query troppo lunga (massimo 64 KB).");
        return execute(connection(id), sql, null);
    }

    public JSONObject related(String id, String relationId, JSONArray values) throws Exception {
        Connection connection=connection(id);
        JSONObject relation=RelationCatalog.find(connection,relationId);
        JSONArray columns=relation.getJSONArray("targetColumns");
        if (values.length()!=columns.length()) throw new IllegalArgumentException("Chiave della relazione incompleta.");
        List<String> predicates=new ArrayList<>();
        for (int i=0;i<columns.length();i++) {
            if (values.isNull(i)||!(values.get(i) instanceof String)||values.getString(i).length()>MAX_CELL)
                throw new IllegalArgumentException("Valore della relazione non valido.");
            predicates.add(RelationCatalog.quote(columns.getString(i))+" = ?");
        }
        String sql="SELECT * FROM "+RelationCatalog.quote(relation.getString("targetSchema"))+"."
            +RelationCatalog.quote(relation.getString("targetTable"))+" WHERE "+String.join(" AND ",predicates)+" LIMIT 2";
        JSONObject result=execute(connection,sql,values);
        if (result.getJSONArray("results").getJSONObject(0).getJSONArray("rows").length()>1)
            throw new IllegalStateException("Relazione ambigua: sono stati trovati più record.");
        return result.put("targetSchema",relation.getString("targetSchema")).put("targetTable",relation.getString("targetTable"));
    }

    private JSONObject execute(Connection connection, String sql, JSONArray values) throws Exception {
        long started = System.nanoTime();
        JSONArray results = new JSONArray();
        int budget = MAX_RESULT_CHARS;
        try (Statement statement = values==null?connection.createStatement():connection.prepareStatement(sql)) {
            statement.setQueryTimeout(15);
            statement.setMaxRows(MAX_ROWS + 1);
            if (values!=null) for (int i=0;i<values.length();i++)
                ((PreparedStatement)statement).setObject(i+1,values.getString(i),Types.OTHER);
            boolean hasRows = values==null?statement.execute(sql):((PreparedStatement)statement).execute();
            do {
                JSONObject result = new JSONObject();
                JSONArray fields = new JSONArray(), rows = new JSONArray();
                boolean truncated = false;
                if (hasRows) {
                    try (ResultSet cursor = statement.getResultSet()) {
                        ResultSetMetaData meta = cursor.getMetaData();
                        List<String> labels = new ArrayList<>();
                        Set<String> used = new HashSet<>();
                        for (int i = 1; i <= meta.getColumnCount(); i++) {
                            String base = meta.getColumnLabel(i), label = base;
                            int suffix = 2;
                            while (!used.add(label)) label = base + " (" + suffix++ + ")";
                            labels.add(label); fields.put(label);
                        }
                        try { result.put("relations",RelationCatalog.describe(connection,meta,labels)); }
                        catch (SQLException e) {
                            result.put("relations",new JSONArray()).put("relationWarning","Relazioni non disponibili per questo risultato.");
                        }
                        while (cursor.next()) {
                            if (rows.length() >= MAX_ROWS || budget <= 0) { truncated = true; break; }
                            JSONObject row = new JSONObject();
                            for (int i = 1; i <= labels.size(); i++) {
                                // Text retains numeric/decimal precision, JSON, bytea and timestamp semantics.
                                String value = cursor.getString(i);
                                if (value != null) {
                                    int limit = Math.min(MAX_CELL, Math.max(0, budget));
                                    if (value.length() > limit) { value = value.substring(0, limit) + "…"; truncated = true; }
                                    budget -= value.length();
                                }
                                row.put(labels.get(i - 1), value == null ? JSONObject.NULL : value);
                            }
                            rows.put(row);
                        }
                    }
                    result.put("command", "RESULT").put("rowCount", rows.length());
                } else {
                    int count = statement.getUpdateCount();
                    if (count == -1) break;
                    result.put("command", "COMMAND").put("rowCount", count);
                }
                results.put(result.put("fields", fields).put("rows", rows).put("truncated", truncated));
                if (results.length() >= 100) throw new IllegalArgumentException("Massimo 100 risultati per esecuzione: suddividi lo script.");
                hasRows = statement.getMoreResults(Statement.CLOSE_CURRENT_RESULT);
            } while (hasRows || statement.getUpdateCount() != -1);
        }
        return new JSONObject().put("results", results).put("ms", (System.nanoTime() - started) / 1_000_000);
    }

    public void disconnect(String id) {
        Session session = sessions.remove(id);
        if (session != null) try { session.connection.close(); } catch (SQLException ignored) { }
    }

    public void expire() {
        long now = System.nanoTime();
        for (String id : new ArrayList<>(sessions.keySet())) {
            if ((now - sessions.get(id).lastUsed) / 1_000_000 > IDLE_MS) disconnect(id);
        }
    }

    @Override public void close() {
        for (String id : new ArrayList<>(sessions.keySet())) disconnect(id);
    }
}
