package it.psqlmobile.app;

import org.json.*;
import org.postgresql.PGResultSetMetaData;
import org.postgresql.core.BaseConnection;
import org.postgresql.core.TransactionState;
import java.sql.*;
import java.util.*;

/** Single-record writes: catalog identifiers, bound values, primary keys and optimistic locking. */
final class RecordService {
    private static String q(String value){return RelationCatalog.quote(value);}
    private static String table(JSONObject definition)throws Exception{return q(definition.getString("schema"))+"."+q(definition.getString("table"));}
    private static PreparedStatement statement(Connection c,String sql)throws Exception{PreparedStatement s=c.prepareStatement(sql);s.setQueryTimeout(15);return s;}
    private static void bind(PreparedStatement s,int index,Object value)throws Exception{
        if(value==JSONObject.NULL)s.setNull(index,Types.OTHER);
        else{if(!(value instanceof String)||((String)value).length()>65536)throw new IllegalArgumentException("Valore troppo lungo o non valido.");s.setObject(index,value,Types.OTHER);}
    }
    private static JSONObject tableInfo(Connection c,String schema,String name)throws Exception{
        try(PreparedStatement s=statement(c,"SELECT c.oid::text,c.relkind,(has_table_privilege(c.oid,'INSERT') OR has_any_column_privilege(c.oid,'INSERT')),(has_table_privilege(c.oid,'UPDATE') OR has_any_column_privilege(c.oid,'UPDATE')),has_table_privilege(c.oid,'DELETE') FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relname=?")){
            s.setString(1,schema);s.setString(2,name);
            try(ResultSet r=s.executeQuery()){
                if(!r.next()||!Arrays.asList("r","p").contains(r.getString(2)))throw new IllegalArgumentException("La modifica è disponibile per le tabelle del database, non per viste o espressioni.");
                return new JSONObject().put("schema",schema).put("table",name).put("oid",r.getString(1)).put("canInsert",r.getBoolean(3)&&!c.isReadOnly()).put("canUpdate",r.getBoolean(4)&&!c.isReadOnly()).put("canDelete",r.getBoolean(5)&&!c.isReadOnly());
            }
        }
    }
    private static JSONArray primaryKey(Connection c,String oid)throws Exception{
        JSONArray keys=new JSONArray();
        try(PreparedStatement s=statement(c,"SELECT a.attname FROM pg_catalog.pg_index i JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(num,ord) ON true JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE i.indisprimary AND k.ord<=i.indnkeyatts AND i.indrelid=?::oid ORDER BY k.ord")){
            s.setString(1,oid);try(ResultSet r=s.executeQuery()){while(r.next())keys.put(r.getString(1));}
        }return keys;
    }
    static JSONArray targets(Connection c,ResultSetMetaData meta,List<String> labels)throws Exception{
        JSONArray targets=new JSONArray();if(!(meta instanceof PGResultSetMetaData))return targets;
        PGResultSetMetaData pg=(PGResultSetMetaData)meta;
        Map<List<String>,JSONArray> tables=new LinkedHashMap<>();
        for(int i=1;i<=labels.size();i++){
            String schema=pg.getBaseSchemaName(i),name=pg.getBaseTableName(i),column=pg.getBaseColumnName(i);
            if(schema.isEmpty()||name.isEmpty()||column.isEmpty())continue;
            tables.computeIfAbsent(Arrays.asList(schema,name),ignored->new JSONArray()).put(new JSONObject().put("column",column).put("field",labels.get(i-1)));
        }
        for(Map.Entry<List<String>,JSONArray> entry:tables.entrySet()){
            JSONObject target;
            try{target=tableInfo(c,entry.getKey().get(0),entry.getKey().get(1));}catch(IllegalArgumentException ignored){continue;}
            JSONArray pk=primaryKey(c,target.getString("oid")),keys=new JSONArray(),fields=entry.getValue();
            for(int i=0;i<pk.length();i++){
                JSONObject match=null;int count=0;
                for(int j=0;j<fields.length();j++)if(fields.getJSONObject(j).getString("column").equals(pk.getString(i))){match=fields.getJSONObject(j);count++;}
                if(count!=1)break;keys.put(match);
            }
            target.put("fields",fields).put("keys",keys).put("keyComplete",pk.length()>0&&keys.length()==pk.length());targets.put(target);
        }return targets;
    }
    static JSONObject describe(Connection c,JSONObject target)throws Exception{
        JSONObject d=tableInfo(c,target.getString("schema"),target.getString("table"));
        JSONArray columns=new JSONArray();
        try(PreparedStatement s=statement(c,"SELECT a.attname,format_type(a.atttypid,a.atttypmod),NOT (a.attnotnull OR b.required),(a.atthasdef OR b.hasdefault),a.attidentity,a.attgenerated,b.typcategory,b.oid::text,has_column_privilege(a.attrelid,a.attnum,'INSERT'),has_column_privilege(a.attrelid,a.attnum,'UPDATE'),format_type(b.oid,-1) FROM pg_catalog.pg_attribute a JOIN LATERAL (WITH RECURSIVE bases AS (SELECT oid,typbasetype,typcategory,typnotnull,typdefault FROM pg_catalog.pg_type WHERE oid=a.atttypid UNION ALL SELECT t.oid,t.typbasetype,t.typcategory,t.typnotnull,t.typdefault FROM pg_catalog.pg_type t JOIN bases ON t.oid=bases.typbasetype) SELECT oid,typcategory,(SELECT bool_or(typnotnull) FROM bases) AS required,(SELECT bool_or(typdefault IS NOT NULL) FROM bases) AS hasdefault FROM bases WHERE typbasetype=0) b ON true WHERE a.attrelid=?::oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum")){
            s.setString(1,d.getString("oid"));try(ResultSet r=s.executeQuery()){while(r.next()){
                boolean generated=!r.getString(6).isEmpty()||r.getString(5).equals("a");
                JSONObject column=new JSONObject().put("name",r.getString(1)).put("type",r.getString(2)).put("nullable",r.getBoolean(3))
                    .put("hasDefault",r.getBoolean(4)||!r.getString(5).isEmpty()).put("generated",generated).put("category",r.getString(7))
                    .put("canInsert",r.getBoolean(9)&&!generated&&!c.isReadOnly()).put("canUpdate",r.getBoolean(10)&&!generated&&!c.isReadOnly()).put("baseType",r.getString(11)).put("identity",!r.getString(5).isEmpty());
                if(r.getString(7).equals("E")){
                    JSONArray choices=new JSONArray();try(PreparedStatement e=statement(c,"SELECT enumlabel FROM pg_catalog.pg_enum WHERE enumtypid=?::oid ORDER BY enumsortorder")){
                        e.setString(1,r.getString(8));try(ResultSet enums=e.executeQuery()){while(enums.next())choices.put(enums.getString(1));}
                    }column.put("choices",choices);
                }columns.put(column);
            }}
        }
        return d.put("columns",columns).put("primaryKey",primaryKey(c,d.getString("oid"))).put("relations",RelationCatalog.forTable(c,d.getString("schema"),d.getString("table")));
    }
    private static String where(JSONObject d,JSONObject keys,List<Object> values)throws Exception{
        JSONArray pk=d.getJSONArray("primaryKey");
        if(pk.length()==0||keys.length()!=pk.length())throw new IllegalArgumentException("Serve la chiave primaria completa per modificare o eliminare il record.");
        List<String> conditions=new ArrayList<>();
        for(int i=0;i<pk.length();i++){String key=pk.getString(i);Object value=keys.opt(key);if(value==null||value==JSONObject.NULL)throw new IllegalArgumentException("Chiave primaria incompleta.");conditions.add(q(key)+" = ?");values.add(value);}
        return String.join(" AND ",conditions);
    }
    private static String returning(JSONObject d)throws Exception{
        List<String> columns=new ArrayList<>();JSONArray list=d.getJSONArray("columns");for(int i=0;i<list.length();i++)columns.add(q(list.getJSONObject(i).getString("name")));
        return String.join(",",columns)+",tableoid::text,xmin::text";
    }
    private static JSONObject capture(Connection c,JSONObject d,ResultSet cursor)throws Exception{
        if(!cursor.next())throw new IllegalStateException("Record non trovato o non accessibile con i permessi della connessione.");
        JSONArray columns=d.getJSONArray("columns"),fields=new JSONArray();List<String> labels=new ArrayList<>();JSONObject row=new JSONObject();int total=0;
        for(int i=0;i<columns.length();i++){
            String name=columns.getJSONObject(i).getString("name"),value=cursor.getString(i+1);
            if(value!=null){total+=value.length();if(value.length()>65536||total>2_000_000)throw new IllegalArgumentException("Questo record è troppo grande per il modulo. Modificalo con SQL.");}
            labels.add(name);fields.put(name);row.put(name,value==null?JSONObject.NULL:value);
        }
        JSONObject keys=new JSONObject();JSONArray pk=d.getJSONArray("primaryKey");for(int i=0;i<pk.length();i++)keys.put(pk.getString(i),row.get(pk.getString(i)));
        String version=cursor.getString(columns.length()+1)+":"+cursor.getString(columns.length()+2);
        JSONObject result=new JSONObject().put("fields",fields).put("rows",new JSONArray().put(row)).put("command","RECORD").put("rowCount",1)
            .put("relations",RelationCatalog.describe(c,cursor.getMetaData(),labels)).put("recordTargets",targets(c,cursor.getMetaData(),labels));
        if(cursor.next())throw new IllegalStateException("Il record non è identificato in modo univoco.");
        return new JSONObject().put("definition",d).put("row",row).put("keys",keys).put("version",version).put("result",result);
    }
    static JSONObject open(Connection c,JSONObject target,JSONObject keys,boolean lock)throws Exception{
        JSONObject d=describe(c,target);List<Object> values=new ArrayList<>();String condition=where(d,keys,values);
        try(PreparedStatement s=statement(c,"SELECT "+returning(d)+" FROM "+table(d)+" WHERE "+condition+(lock?" FOR UPDATE":""))){
            s.setMaxRows(2);for(int i=0;i<values.size();i++)bind(s,i+1,values.get(i));try(ResultSet r=s.executeQuery()){return capture(c,d,r);}
        }
    }
    private static void begin(Connection c)throws Exception{
        if(!c.getAutoCommit()||((BaseConnection)c).getTransactionState()!=TransactionState.IDLE)
            throw new IllegalStateException("Chiudi la transazione SQL aperta con COMMIT o ROLLBACK prima di usare il modulo.");
        c.setAutoCommit(false);
    }
    static JSONObject write(Connection c,JSONObject data,boolean delete)throws Exception{
        begin(c);
        try{
            boolean create=!delete&&data.getString("mode").equals("create");
            if(!delete&&!create&&!data.getString("mode").equals("update"))throw new IllegalArgumentException("Operazione non valida.");
            JSONObject d=describe(c,data.getJSONObject("target"));JSONObject original=null;
            if(!create){original=open(c,d,data.getJSONObject("keys"),false);if(!original.getString("version").equals(data.getString("version")))throw new IllegalStateException("Il record è cambiato. Ricaricalo prima di salvare o eliminare.");}
            List<Object> values=new ArrayList<>();String sql;
            if(delete){sql="DELETE FROM "+table(d)+" WHERE "+where(d,data.getJSONObject("keys"),values);}
            else{
                JSONObject input=data.getJSONObject("values");Map<String,JSONObject> allowed=new HashMap<>();JSONArray columns=d.getJSONArray("columns");
                for(int i=0;i<columns.length();i++){JSONObject column=columns.getJSONObject(i);allowed.put(column.getString("name"),column);}
                List<String> names=new ArrayList<>(),assignments=new ArrayList<>();
                for(Iterator<String> it=input.keys();it.hasNext();){
                    String name=it.next();JSONObject column=allowed.get(name),change=input.getJSONObject(name);
                    if(column==null||!column.getBoolean(create?"canInsert":"canUpdate"))throw new IllegalArgumentException("Campo non modificabile: "+name);
                    String mode=change.getString("mode"),expression;
                    if(mode.equals("default")){if(create)continue;expression="DEFAULT";}
                    else if(mode.equals("null")){if(!column.getBoolean("nullable"))throw new IllegalArgumentException("Il campo "+name+" è obbligatorio.");expression="?";values.add(JSONObject.NULL);}
                    else if(mode.equals("value")){expression="?";values.add(change.get("value"));}
                    else throw new IllegalArgumentException("Valore del campo non valido.");
                    names.add(q(name));assignments.add(create?expression:q(name)+" = "+expression);
                }
                if(create)sql="INSERT INTO "+table(d)+(names.isEmpty()?" DEFAULT VALUES":" ("+String.join(",",names)+") VALUES ("+String.join(",",assignments)+")");
                else{if(names.isEmpty()){c.commit();return original;}sql="UPDATE "+table(d)+" SET "+String.join(",",assignments)+" WHERE "+where(d,data.getJSONObject("keys"),values);}
            }
            if(!create){
                String[] version=original.getString("version").split(":",2);
                sql+=" AND tableoid::text = ? AND xmin::text = ?";
                values.add(version[0]);values.add(version[1]);
            }
            sql+=" RETURNING "+returning(d);
            JSONObject saved;try(PreparedStatement s=statement(c,sql)){for(int i=0;i<values.size();i++)bind(s,i+1,values.get(i));try(ResultSet r=s.executeQuery()){saved=capture(c,d,r);}}
            c.commit();return delete?new JSONObject().put("deleted",true):saved;
        }catch(Exception error){c.rollback();throw error;}finally{c.setAutoCommit(true);}
    }
    static JSONObject lookup(Connection c,String relationId,String search,int offset)throws Exception{
        if(search.length()>500||offset<0||offset>10000)throw new IllegalArgumentException("Ricerca troppo lunga o pagina non valida.");
        JSONObject relation=RelationCatalog.find(c,relationId);
        JSONObject d=describe(c,new JSONObject().put("schema",relation.getString("targetSchema")).put("table",relation.getString("targetTable")));
        JSONArray columns=d.getJSONArray("columns"),targetColumns=relation.getJSONArray("targetColumns");List<String> text=new ArrayList<>(),order=new ArrayList<>();
        for(int i=0;i<columns.length();i++)text.add(q(columns.getJSONObject(i).getString("name"))+"::text");
        for(int i=0;i<targetColumns.length();i++)order.add(q(targetColumns.getString(i)));
        JSONArray items=new JSONArray();boolean more=false;
        String sql="SELECT "+String.join(",",text)+" FROM "+table(d)+" WHERE strpos(lower(concat_ws(' ',"+String.join(",",text)+")),lower(?))>0 ORDER BY "+String.join(",",order)+" LIMIT 26 OFFSET ?";
        try(PreparedStatement s=statement(c,sql)){s.setString(1,search.trim());s.setInt(2,offset);try(ResultSet r=s.executeQuery()){
            while(r.next()){
                if(items.length()==25){more=true;break;}
                Map<String,String> row=new LinkedHashMap<>();for(int i=0;i<columns.length();i++){String value=r.getString(i+1);row.put(columns.getJSONObject(i).getString("name"),value);}
                JSONArray keys=new JSONArray();List<String> details=new ArrayList<>();for(int i=0;i<targetColumns.length();i++){String key=targetColumns.getString(i),value=row.get(key);if(value==null||value.length()>65536)throw new IllegalArgumentException("Chiave del record non supportata.");keys.put(value);details.add(key+": "+value);}
                String label=null;for(String priority:new String[]{"nome","name","ragione_sociale","title","titolo","label","email"}){for(String name:row.keySet())if(name.equalsIgnoreCase(priority)&&row.get(name)!=null&&!row.get(name).isEmpty()){label=row.get(name);break;}if(label!=null)break;}
                if(label==null)label=details.get(0);if(label.length()>200)label=label.substring(0,200)+"…";
                items.put(new JSONObject().put("label",label).put("detail",String.join(" · ",details)).put("values",keys));
            }
        }}return new JSONObject().put("items",items).put("hasMore",more);
    }
}
