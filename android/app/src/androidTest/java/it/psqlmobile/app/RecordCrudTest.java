package it.psqlmobile.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class RecordCrudTest {
    @Test public void postgresTypesDomainsEnumsAndExactNumbersRemainEditable()throws Exception{
        String uri=InstrumentationRegistry.getArguments().getString("postgresUri");assertNotNull(uri);
        try(PgDatabase db=new PgDatabase()){
            String session=db.connect(new JSONObject().put("connectionString",uri)).getString("session");java.sql.Connection c=db.connection(session);
            db.query(session,"CREATE TYPE pg_temp.priority AS ENUM ('Bassa','Alta'); CREATE DOMAIN pg_temp.priority_domain AS pg_temp.priority NOT NULL DEFAULT 'Bassa'; CREATE DOMAIN pg_temp.date_domain AS date; CREATE DOMAIN pg_temp.nested_date AS pg_temp.date_domain;"+
                "CREATE TEMP TABLE types_probe(id integer PRIMARY KEY,big bigint,amount numeric(30,6),enabled boolean,priority pg_temp.priority_domain,birthday pg_temp.nested_date,code uuid,payload jsonb,tags text[],blob_value bytea,ip inet,duration interval,span int4range,bits bit varying(8),doc xml,location point); INSERT INTO types_probe(id) VALUES(1)");
            JSONObject source=db.query(session,"SELECT * FROM types_probe").getJSONArray("results").getJSONObject(0).getJSONArray("recordTargets").getJSONObject(0);
            JSONObject table=target(source.getString("schema"),source.getString("table"));JSONObject opened=RecordService.open(c,table,new JSONObject().put("id","1"),false);
            JSONArray columns=opened.getJSONObject("definition").getJSONArray("columns");JSONObject priority=null,birthday=null;
            for(int i=0;i<columns.length();i++){JSONObject column=columns.getJSONObject(i);if(column.getString("name").equals("priority"))priority=column;if(column.getString("name").equals("birthday"))birthday=column;}
            assertNotNull(priority);assertEquals("E",priority.getString("category"));assertFalse(priority.getBoolean("nullable"));assertTrue(priority.getBoolean("hasDefault"));assertEquals("Alta",priority.getJSONArray("choices").getString(1));
            assertNotNull(birthday);assertEquals("date",birthday.getString("baseType"));
            JSONObject values=new JSONObject().put("big",value("9007199254740993123")).put("amount",value("9007199254740993123.123456")).put("enabled",value("false")).put("priority",value("Alta"))
                .put("birthday",value("2024-02-29")).put("code",value("550e8400-e29b-41d4-a716-446655440000")).put("payload",value("{\"id\":9007199254740993123}"))
                .put("tags",value("{\"a,b\",\"x\\\"y\",NULL}")).put("blob_value",value("\\x48656c6c6f")).put("ip",value("2001:db8::1/64")).put("duration",value("2 days 03:30:00"))
                .put("span",value("[1,10)")).put("bits",value("0101")).put("doc",value("<record>ok</record>")).put("location",value("(1.25,-2.5)"));
            JSONObject saved=RecordService.write(c,request("update",table,opened,values),false),row=saved.getJSONObject("row");
            assertEquals("9007199254740993123",row.getString("big"));assertEquals("9007199254740993123.123456",row.getString("amount"));assertEquals("f",row.getString("enabled"));assertEquals("Alta",row.getString("priority"));
            assertTrue(row.getString("payload").contains("9007199254740993123"));assertEquals("\\x48656c6c6f",row.getString("blob_value"));assertEquals("0101",row.getString("bits"));
            try{RecordService.write(c,request("update",table,saved,new JSONObject().put("priority",value("Missing"))),false);fail("Invalid enum accepted");}catch(java.sql.SQLException expected){}
            assertEquals(saved.getString("version"),RecordService.open(c,table,saved.getJSONObject("keys"),false).getString("version"));
            JSONObject reset=RecordService.write(c,request("update",table,saved,new JSONObject().put("priority",new JSONObject().put("mode","default"))),false);
            assertEquals("Bassa",reset.getJSONObject("row").getString("priority"));
        }
    }
    @Test public void datesTimesAndOffsetsRoundTripWithoutLosingMicroseconds()throws Exception{
        String uri=InstrumentationRegistry.getArguments().getString("postgresUri");assertNotNull(uri);
        try(PgDatabase db=new PgDatabase()){
            String session=db.connect(new JSONObject().put("connectionString",uri)).getString("session");
            java.sql.Connection c=db.connection(session);
            db.query(session,"SET TIME ZONE 'UTC'; CREATE TEMP TABLE temporal_probe(id integer PRIMARY KEY,day date,local_time time(6),local_stamp timestamp(6),zoned_stamp timestamptz(6),zoned_time timetz(6)); INSERT INTO temporal_probe(id) VALUES(1)");
            JSONObject source=db.query(session,"SELECT * FROM temporal_probe").getJSONArray("results").getJSONObject(0).getJSONArray("recordTargets").getJSONObject(0);
            JSONObject table=target(source.getString("schema"),source.getString("table"));
            JSONObject opened=RecordService.open(c,table,new JSONObject().put("id","1"),false);
            JSONObject values=new JSONObject().put("day",value("2024-02-29")).put("local_time",value("09:30:45.123456"))
                .put("local_stamp",value("2026-10-25T02:30:45.654321")).put("zoned_stamp",value("2026-10-25T02:30:45.123456+05:30"))
                .put("zoned_time",value("09:30:45.654321-04:00"));
            JSONObject saved=RecordService.write(c,request("update",table,opened,values),false),row=saved.getJSONObject("row");
            assertEquals("2024-02-29",row.getString("day"));assertEquals("09:30:45.123456",row.getString("local_time"));
            assertEquals("2026-10-25 02:30:45.654321",row.getString("local_stamp"));
            assertEquals("2026-10-24 21:00:45.123456+00",row.getString("zoned_stamp"));
            assertEquals("09:30:45.654321-04",row.getString("zoned_time"));
            JSONObject unchanged=RecordService.write(c,request("update",table,saved,new JSONObject()),false);
            assertEquals(row.toString(),unchanged.getJSONObject("row").toString());
            JSONObject cleared=RecordService.write(c,request("update",table,unchanged,new JSONObject().put("day",new JSONObject().put("mode","null"))),false);
            assertTrue(cleared.getJSONObject("row").isNull("day"));
        }
    }
    private JSONObject value(String text)throws Exception{return new JSONObject().put("mode","value").put("value",text);}
    private JSONObject target(String schema,String name)throws Exception{return new JSONObject().put("schema",schema).put("table",name);}
    private JSONObject request(String mode,JSONObject target,JSONObject loaded,JSONObject values)throws Exception{
        return new JSONObject().put("mode",mode).put("target",target).put("keys",loaded==null?new JSONObject():loaded.getJSONObject("keys"))
            .put("version",loaded==null?"":loaded.getString("version")).put("values",values);
    }
    @Test public void createsEditsSearchesAndDeletesExactlyOneRecordWithDefaultsAndConflicts()throws Exception{
        String uri=InstrumentationRegistry.getArguments().getString("postgresUri");assertNotNull(uri);
        try(PgDatabase db=new PgDatabase()){
            String session=db.connect(new JSONObject().put("connectionString",uri)).getString("session");
            java.sql.Connection c=db.connection(session);
            db.query(session,"CREATE TEMP TABLE crud_customers(tenant text,id bigint,nome text,PRIMARY KEY(tenant,id));"+
                "CREATE TEMP TABLE \"Crud orders\"(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant text NOT NULL,customer_id bigint NOT NULL,note text,enabled boolean NOT NULL DEFAULT true,amount numeric(30,3),derived text GENERATED ALWAYS AS (tenant || '-record') STORED,FOREIGN KEY(tenant,customer_id) REFERENCES crud_customers(tenant,id));"+
                "INSERT INTO crud_customers VALUES('acme',9007199254740993123,'Cliente città'),('other',2,'Altro cliente');"+
                "INSERT INTO crud_customers SELECT 'acme',n,'Cliente '||n FROM generate_series(1,35) n");
            JSONObject source=db.query(session,"SELECT id AS alias_id FROM \"Crud orders\"").getJSONArray("results").getJSONObject(0).getJSONArray("recordTargets").getJSONObject(0);
            JSONObject table=target(source.getString("schema"),source.getString("table"));
            JSONObject definition=RecordService.describe(c,table);assertEquals(7,definition.getJSONArray("columns").length());
            assertFalse(db.query(session,"SELECT tenant,customer_id FROM \"Crud orders\"").getJSONArray("results").getJSONObject(0).getJSONArray("recordTargets").getJSONObject(0).getBoolean("keyComplete"));
            assertFalse(db.query(session,"SELECT id AS first_id,id AS second_id FROM \"Crud orders\"").getJSONArray("results").getJSONObject(0).getJSONArray("recordTargets").getJSONObject(0).getBoolean("keyComplete"));
            JSONObject relation=definition.getJSONArray("relations").getJSONObject(0);
            JSONObject lookup=RecordService.lookup(c,relation.getString("id"),"città",0);
            assertEquals(1,lookup.getJSONArray("items").length());
            JSONArray selected=lookup.getJSONArray("items").getJSONObject(0).getJSONArray("values");assertEquals("9007199254740993123",selected.getString(1));
            assertTrue(RecordService.lookup(c,relation.getString("id"),"Cliente",0).getBoolean("hasMore"));
            assertTrue(RecordService.lookup(c,relation.getString("id"),"Cliente",25).getJSONArray("items").length()>0);
            assertEquals(0,RecordService.lookup(c,relation.getString("id"),"%' OR true--",0).getJSONArray("items").length());
            JSONObject values=new JSONObject().put("tenant",value(selected.getString(0))).put("customer_id",value(selected.getString(1))).put("note",value("x' ; DELETE FROM crud_customers; --")).put("amount",value("9007199254740993123.123"));
            JSONObject created=RecordService.write(c,request("create",table,null,values),false);
            assertEquals("t",created.getJSONObject("row").getString("enabled"));assertEquals("acme-record",created.getJSONObject("row").getString("derived"));assertEquals("9007199254740993123.123",created.getJSONObject("row").getString("amount"));
            JSONObject opened=RecordService.open(c,table,created.getJSONObject("keys"),false);
            JSONObject updated=RecordService.write(c,request("update",table,opened,new JSONObject().put("note",new JSONObject().put("mode","null")).put("enabled",value("false"))),false);
            assertTrue(updated.getJSONObject("row").isNull("note"));assertEquals("f",updated.getJSONObject("row").getString("enabled"));
            try{RecordService.write(c,request("update",table,opened,new JSONObject().put("note",value("stale"))),false);fail("Overwrote stale record");}catch(IllegalStateException expected){assertTrue(expected.getMessage().contains("cambiato"));}
            try{RecordService.write(c,request("update",table,updated,new JSONObject().put("derived",value("manual"))),false);fail("Generated field changed");}catch(IllegalArgumentException expected){}
            try{RecordService.write(c,request("update",table,updated,new JSONObject().put("customer_id",value("999999"))),false);fail("Foreign key accepted");}catch(java.sql.SQLException expected){assertEquals("23503",expected.getSQLState());}
            assertEquals(updated.getString("version"),RecordService.open(c,table,updated.getJSONObject("keys"),false).getString("version"));
            JSONObject reset=RecordService.write(c,request("update",table,updated,new JSONObject().put("enabled",new JSONObject().put("mode","default"))),false);assertEquals("t",reset.getJSONObject("row").getString("enabled"));
            db.query(session,"BEGIN");try{RecordService.write(c,request("delete",table,reset,new JSONObject()),true);fail("Committed user transaction");}catch(IllegalStateException expected){}finally{db.query(session,"ROLLBACK");}
            assertTrue(RecordService.write(c,request("delete",table,reset,new JSONObject()),true).getBoolean("deleted"));
            assertEquals("0",db.query(session,"SELECT count(*) AS n FROM \"Crud orders\"").getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0).getString("n"));
            try{RecordService.open(c,table,new JSONObject(),false);fail("Incomplete key");}catch(IllegalArgumentException expected){}
            JSONObject composite=target(source.getString("schema"),"crud_customers");
            JSONObject pair=RecordService.open(c,composite,new JSONObject().put("tenant","other").put("id","2"),false);
            assertTrue(RecordService.write(c,request("delete",composite,pair,new JSONObject()),true).getBoolean("deleted"));
        }
    }
}
