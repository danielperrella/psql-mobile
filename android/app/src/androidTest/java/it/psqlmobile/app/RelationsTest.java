package it.psqlmobile.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class RelationsTest {
    private JSONObject first(PgDatabase db,String session,String sql) throws Exception {
        return db.query(session,sql).getJSONArray("results").getJSONObject(0);
    }
    @Test public void followsRealKeysAliasesCompositeKeysAndTextValuesSafely() throws Exception {
        String uri=InstrumentationRegistry.getArguments().getString("postgresUri");assertNotNull(uri);
        try(PgDatabase db=new PgDatabase()) {
            String session=db.connect(new JSONObject().put("connectionString",uri)).getString("session");
            db.query(session,"CREATE TEMP TABLE relation_companies(id integer PRIMARY KEY,nome text);"+
                "CREATE TEMP TABLE \"Parent probe\"(\"Key\" text PRIMARY KEY,nome text,company_id integer REFERENCES relation_companies(id));"+
                "CREATE TEMP TABLE relation_pairs(a text,b integer,nome text,PRIMARY KEY(a,b));"+
                "CREATE TEMP TABLE relation_orders(id integer,customer_id text REFERENCES \"Parent probe\"(\"Key\"),a text,b integer,plain_id integer,FOREIGN KEY(a,b) REFERENCES relation_pairs(a,b));"+
                "INSERT INTO relation_companies VALUES(7,'Azienda collegata');"+
                "INSERT INTO \"Parent probe\" VALUES('x'' OR true--','Cliente corretto',7),('altro','Altro cliente',7);"+
                "INSERT INTO relation_pairs VALUES('tenant',9,'Chiave composta');"+
                "INSERT INTO relation_orders VALUES(1,'x'' OR true--','tenant',9,7),(2,NULL,NULL,NULL,8)");
            JSONObject result=first(db,session,"SELECT customer_id AS \"Cliente\",customer_id AS \"Replica\",plain_id AS id FROM relation_orders WHERE id=1");
            JSONArray relations=result.getJSONArray("relations");assertEquals(2,relations.length());
            JSONObject relation=relations.getJSONObject(0);
            assertEquals("Cliente",relation.getJSONArray("fields").getString(0));
            assertEquals("Parent probe",relation.getString("targetTable"));
            JSONObject related=db.related(session,relation.getString("id"),new JSONArray().put("x' OR true--"))
                .getJSONArray("results").getJSONObject(0);
            assertEquals(1,related.getJSONArray("rows").length());
            assertEquals("Cliente corretto",related.getJSONArray("rows").getJSONObject(0).getString("nome"));
            JSONObject nested=related.getJSONArray("relations").getJSONObject(0);
            assertEquals("Azienda collegata",db.related(session,nested.getString("id"),new JSONArray().put("7"))
                .getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0).getString("nome"));
            assertEquals(0,first(db,session,"SELECT customer_id || '' AS customer_id,plain_id FROM relation_orders").getJSONArray("relations").length());
            assertEquals(0,first(db,session,"SELECT a FROM relation_orders").getJSONArray("relations").length());
            JSONObject composite=first(db,session,"SELECT b AS secondo,a AS primo FROM relation_orders WHERE id=1").getJSONArray("relations").getJSONObject(0);
            assertEquals("primo",composite.getJSONArray("fields").getString(0));
            assertEquals("secondo",composite.getJSONArray("fields").getString(1));
            assertEquals("Chiave composta",db.related(session,composite.getString("id"),new JSONArray().put("tenant").put("9"))
                .getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0).getString("nome"));
            assertEquals(0,first(db,session,"SELECT x.a,x.b,y.a AS other_a,y.b AS other_b FROM relation_orders x CROSS JOIN relation_orders y").getJSONArray("relations").length());
            assertEquals(0,db.related(session,relation.getString("id"),new JSONArray().put("inesistente")).getJSONArray("results").getJSONObject(0).getJSONArray("rows").length());
            try{db.related(session,relation.getString("id"),new JSONArray().put(JSONObject.NULL));fail("Null lookup");}catch(IllegalArgumentException expected){}
            try{db.related(session,"1;DROP TABLE relation_orders",new JSONArray().put("1"));fail("Invalid constraint");}catch(IllegalArgumentException expected){}
            db.query(session,"DROP TABLE relation_orders");
            try{db.related(session,relation.getString("id"),new JSONArray().put("1"));fail("Stale constraint");}catch(IllegalArgumentException expected){}
        }
    }
}
