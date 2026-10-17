package it.psqlmobile.app;

import org.json.*;
import org.postgresql.PGResultSetMetaData;
import java.sql.*;
import java.util.*;

/** Resolves declared foreign keys from column provenance, never from an ID's spelling. */
final class RelationCatalog {
    private static final String CATALOG =
        "SELECT c.oid::text,c.conname,sn.nspname,s.relname,tn.nspname,t.relname,sa.attname,ta.attname " +
        "FROM pg_catalog.pg_constraint c " +
        "JOIN pg_catalog.pg_class s ON s.oid=c.conrelid " +
        "JOIN pg_catalog.pg_namespace sn ON sn.oid=s.relnamespace " +
        "JOIN pg_catalog.pg_class t ON t.oid=c.confrelid " +
        "JOIN pg_catalog.pg_namespace tn ON tn.oid=t.relnamespace " +
        "JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ord) ON true " +
        "JOIN pg_catalog.pg_attribute sa ON sa.attrelid=s.oid AND sa.attnum=k.attnum " +
        "JOIN pg_catalog.pg_attribute ta ON ta.attrelid=t.oid AND ta.attnum=c.confkey[k.ord::int] " +
        "WHERE c.contype='f' AND ";

    private static List<JSONObject> constraints(Connection connection, String condition, String... values) throws Exception {
        Map<String,JSONObject> keys = new LinkedHashMap<>();
        try (PreparedStatement statement = connection.prepareStatement(CATALOG + condition + " ORDER BY c.oid,k.ord")) {
            statement.setQueryTimeout(15);
            for (int i=0; i<values.length; i++) statement.setString(i+1,values[i]);
            try (ResultSet cursor=statement.executeQuery()) {
                while (cursor.next()) {
                    String id=cursor.getString(1);
                    JSONObject key=keys.get(id);
                    if (key==null) {
                        key=new JSONObject().put("id",id).put("name",cursor.getString(2))
                            .put("sourceSchema",cursor.getString(3)).put("sourceTable",cursor.getString(4))
                            .put("targetSchema",cursor.getString(5)).put("targetTable",cursor.getString(6))
                            .put("sourceColumns",new JSONArray()).put("targetColumns",new JSONArray());
                        keys.put(id,key);
                    }
                    key.getJSONArray("sourceColumns").put(cursor.getString(7));
                    key.getJSONArray("targetColumns").put(cursor.getString(8));
                }
            }
        }
        return new ArrayList<>(keys.values());
    }

    static JSONArray describe(Connection connection, ResultSetMetaData metadata, List<String> labels) throws Exception {
        JSONArray relations=new JSONArray();
        if (!(metadata instanceof PGResultSetMetaData)) return relations;
        PGResultSetMetaData pg=(PGResultSetMetaData)metadata;
        Map<List<String>,Map<String,List<String>>> tables=new LinkedHashMap<>();
        for (int i=1;i<=labels.size();i++) {
            String schema=pg.getBaseSchemaName(i), table=pg.getBaseTableName(i), column=pg.getBaseColumnName(i);
            if (schema.isEmpty()||table.isEmpty()||column.isEmpty()) continue;
            tables.computeIfAbsent(Arrays.asList(schema,table),ignored->new LinkedHashMap<>())
                .computeIfAbsent(column,ignored->new ArrayList<>()).add(labels.get(i-1));
        }
        for (Map.Entry<List<String>,Map<String,List<String>>> table:tables.entrySet()) {
            for (JSONObject key:constraints(connection,"sn.nspname=? AND s.relname=?",table.getKey().get(0),table.getKey().get(1))) {
                JSONArray columns=key.getJSONArray("sourceColumns");
                if (columns.length()==1) {
                    for (String field:table.getValue().getOrDefault(columns.getString(0),Collections.emptyList()))
                        relations.put(new JSONObject(key.toString()).put("fields",new JSONArray().put(field)));
                } else {
                    // A self-join can expose the same base column several times. Do not mix its composite keys.
                    JSONArray fields=new JSONArray();
                    for (int i=0;i<columns.length();i++) {
                        List<String> matches=table.getValue().getOrDefault(columns.getString(i),Collections.emptyList());
                        if (matches.size()!=1) break;
                        fields.put(matches.get(0));
                    }
                    if (fields.length()==columns.length()) relations.put(key.put("fields",fields));
                }
            }
        }
        return relations;
    }

    static JSONObject find(Connection connection,String id) throws Exception {
        if (!id.matches("[0-9]{1,10}")) throw new IllegalArgumentException("Relazione non valida. Riesegui la query.");
        List<JSONObject> keys=constraints(connection,"c.oid=?::oid",id);
        if (keys.isEmpty()) throw new IllegalArgumentException("La relazione non esiste più. Riesegui la query.");
        return keys.get(0);
    }

    static String quote(String identifier) { return "\""+identifier.replace("\"","\"\"")+"\""; }
}
