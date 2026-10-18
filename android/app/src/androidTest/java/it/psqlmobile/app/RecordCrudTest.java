package it.psqlmobile.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class RecordCrudTest {
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
