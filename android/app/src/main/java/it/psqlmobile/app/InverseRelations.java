package it.psqlmobile.app;

import org.json.*;
import org.postgresql.PGResultSetMetaData;
import java.sql.*;
import java.util.*;

/** Read-only lookup of rows that reference a selected record through declared foreign keys. */
final class InverseRelations {
    private static final int PAGE_SIZE = 25, MAX_ROWS = 25, MAX_CELL = 65536, MAX_CHARS = 2_000_000;

    private InverseRelations() {}

    private static String q(String value) { return RelationCatalog.quote(value); }
    private static PreparedStatement statement(Connection c, String sql) throws SQLException {
        PreparedStatement s = c.prepareStatement(sql);
        s.setQueryTimeout(15);
        return s;
    }
    private static void bind(PreparedStatement s, int index, Object value) throws SQLException {
        if (value == null || value == JSONObject.NULL) s.setNull(index, Types.OTHER);
        else s.setObject(index, value, Types.OTHER);
    }

    /** Lists FK constraints whose referenced table and complete key match the selected target. */
    static JSONArray list(Connection c, JSONObject target, JSONObject keys) throws Exception {
        JSONObject verified = target(c, target);
        JSONObject parent = RecordService.open(c, verified, keys, false);
        JSONObject parentRow = parent.getJSONObject("row");
        List<JSONObject> constraints = catalog(c, "tn.nspname=? AND t.relname=?", verified.getString("schema"), verified.getString("table"));
        JSONArray result = new JSONArray();
        for (JSONObject fk : constraints) {
            JSONArray targetColumns = fk.getJSONArray("targetColumns");
            JSONObject relationKeys = valuesFor(parentRow, targetColumns);
            if (relationKeys == null) continue;
            result.put(new JSONObject().put("id", fk.getString("id")).put("name", fk.getString("name"))
                .put("sourceSchema", fk.getString("sourceSchema")).put("sourceTable", fk.getString("sourceTable"))
                .put("sourceColumns", fk.getJSONArray("sourceColumns")).put("targetSchema", fk.getString("targetSchema"))
                .put("targetTable", fk.getString("targetTable")).put("targetColumns", targetColumns)
                .put("targetKeys", relationKeys));
        }
        return result;
    }

    /** Reads one 25-row page after reopening the visible parent by its complete primary key. */
    static JSONObject read(Connection c, String relationId, JSONObject targetKeys, int offset) throws Exception {
        if (offset < 0 || offset > 10000 || offset % PAGE_SIZE != 0)
            throw new IllegalArgumentException("Pagina non valida.");
        JSONObject fk = RelationCatalog.find(c, relationId);
        JSONObject verified = target(c, new JSONObject().put("schema", fk.getString("targetSchema")).put("table", fk.getString("targetTable")));
        JSONArray targetColumns = fk.getJSONArray("targetColumns"), sourceColumns = fk.getJSONArray("sourceColumns");
        JSONObject parent = RecordService.open(c, verified, targetKeys, false);
        JSONObject relationKeys = valuesFor(parent.getJSONObject("row"), targetColumns);
        if (relationKeys == null) throw new IllegalArgumentException("Chiave referenziata dal record non valida.");

        List<String> predicates = new ArrayList<>();
        List<Object> values = new ArrayList<>();
        for (int i = 0; i < targetColumns.length(); i++) {
            Object value = relationKeys.get(targetColumns.getString(i));
            if (value == JSONObject.NULL) throw new IllegalArgumentException("Una chiave del record non può essere NULL.");
            predicates.add(q(sourceColumns.getString(i)) + " = ?");
            values.add(value);
        }
        String table = q(fk.getString("sourceSchema")) + "." + q(fk.getString("sourceTable"));
        List<String> order = primaryKey(c, fk.getString("sourceSchema"), fk.getString("sourceTable"));
        String ordering = order.isEmpty() ? "ctid" : String.join(",", order.stream().map(InverseRelations::q).toArray(String[]::new));
        String sql = "SELECT * FROM " + table + " WHERE " + String.join(" AND ", predicates) +
            " ORDER BY " + ordering + " LIMIT ? OFFSET ?";
        JSONArray fields = new JSONArray(), rows = new JSONArray();
        boolean hasMore = false;
        int budget = MAX_CHARS;
        try (PreparedStatement s = statement(c, sql)) {
            int parameter = 1;
            for (Object value : values) bind(s, parameter++, value);
            s.setInt(parameter++, PAGE_SIZE + 1);
            s.setInt(parameter, offset);
            try (ResultSet cursor = s.executeQuery()) {
                ResultSetMetaData meta = cursor.getMetaData();
                List<String> labels = new ArrayList<>();
                for (int i = 1; i <= meta.getColumnCount(); i++) {
                    String label = meta.getColumnLabel(i);
                    labels.add(label);
                    fields.put(label);
                }
                while (cursor.next()) {
                    if (rows.length() == PAGE_SIZE) { hasMore = true; break; }
                    JSONObject row = new JSONObject();
                    for (int i = 1; i <= meta.getColumnCount(); i++) {
                        String value = cursor.getString(i);
                        if (value != null) {
                            if (value.length() > MAX_CELL || value.length() > budget)
                                throw new IllegalArgumentException("I record collegati superano il limite di lettura.");
                            budget -= value.length();
                        }
                        row.put(labels.get(i - 1), value == null ? JSONObject.NULL : value);
                    }
                    rows.put(row);
                }
                JSONArray relations = RelationCatalog.describe(c, meta, labels);
                JSONArray recordTargets = RecordService.targets(c, meta, labels);
                return new JSONObject().put("fields", fields).put("rows", rows).put("command", "RESULT")
                    .put("rowCount", rows.length()).put("hasMore", hasMore).put("offset", offset)
                    .put("relations", relations).put("recordTargets", recordTargets).put("truncated", false);
            }
        }
    }

    private static JSONObject target(Connection c, JSONObject requested) throws Exception {
        if (requested == null || !requested.has("schema") || !requested.has("table"))
            throw new IllegalArgumentException("Record di destinazione non valido.");
        String schema = requested.getString("schema"), table = requested.getString("table");
        try (PreparedStatement s = statement(c, "SELECT c.oid::text,c.relkind FROM pg_catalog.pg_class c " +
            "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relname=?")) {
            s.setString(1, schema); s.setString(2, table);
            try (ResultSet r = s.executeQuery()) {
                if (!r.next() || !Arrays.asList("r", "p").contains(r.getString(2)))
                    throw new IllegalArgumentException("La tabella del record non è valida.");
                return new JSONObject().put("schema", schema).put("table", table).put("oid", r.getString(1));
            }
        }
    }

    private static JSONObject valuesFor(JSONObject row, JSONArray columns) throws JSONException {
        JSONObject values = new JSONObject();
        for (int i = 0; i < columns.length(); i++) {
            String column = columns.getString(i);
            if (!row.has(column) || row.isNull(column)) return null;
            values.put(column, row.get(column));
        }
        return values;
    }

    private static List<String> primaryKey(Connection c, String schema, String table) throws Exception {
        List<String> columns = new ArrayList<>();
        String sql = "SELECT a.attname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace " +
            "JOIN pg_catalog.pg_index i ON i.indrelid=c.oid JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(num,ord) ON true " +
            "JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num " +
            "WHERE n.nspname=? AND c.relname=? AND i.indisprimary AND k.ord<=i.indnkeyatts ORDER BY k.ord";
        try (PreparedStatement s = statement(c, sql)) {
            s.setString(1, schema); s.setString(2, table);
            try (ResultSet r = s.executeQuery()) { while (r.next()) columns.add(r.getString(1)); }
        }
        return columns;
    }

    private static List<JSONObject> catalog(Connection c, String condition, String... params) throws Exception {
        String sql = "SELECT c.oid::text,c.conname,sn.nspname,s.relname,tn.nspname,t.relname,sa.attname,ta.attname " +
            "FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class s ON s.oid=c.conrelid " +
            "JOIN pg_catalog.pg_namespace sn ON sn.oid=s.relnamespace " +
            "JOIN pg_catalog.pg_class t ON t.oid=c.confrelid " +
            "JOIN pg_catalog.pg_namespace tn ON tn.oid=t.relnamespace " +
            "JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) ON true " +
            "JOIN pg_catalog.pg_attribute sa ON sa.attrelid=s.oid AND sa.attnum=k.attnum " +
            "JOIN pg_catalog.pg_attribute ta ON ta.attrelid=t.oid AND ta.attnum=c.confkey[k.ord::int] " +
            "WHERE c.contype='f' AND " + condition + " ORDER BY c.oid,k.ord";
        Map<String, JSONObject> found = new LinkedHashMap<>();
        try (PreparedStatement s = statement(c, sql)) {
            for (int i = 0; i < params.length; i++) s.setString(i + 1, params[i]);
            try (ResultSet r = s.executeQuery()) {
                while (r.next()) {
                    String id = r.getString(1);
                    JSONObject item = found.get(id);
                    if (item == null) {
                        item = new JSONObject().put("id", id).put("name", r.getString(2)).put("sourceSchema", r.getString(3))
                            .put("sourceTable", r.getString(4)).put("targetSchema", r.getString(5)).put("targetTable", r.getString(6))
                            .put("sourceColumns", new JSONArray()).put("targetColumns", new JSONArray());
                        found.put(id, item);
                    }
                    item.getJSONArray("sourceColumns").put(r.getString(7));
                    item.getJSONArray("targetColumns").put(r.getString(8));
                }
            }
        }
        return new ArrayList<>(found.values());
    }
}
