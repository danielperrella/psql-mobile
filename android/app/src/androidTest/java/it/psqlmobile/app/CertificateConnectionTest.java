package it.psqlmobile.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** All keys/certificates are generated for a disposable local PostgreSQL server. */
@RunWith(AndroidJUnit4.class)
public class CertificateConnectionTest {
    private String asset(String name)throws Exception{
        try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("tls/"+name);java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);return Base64.getEncoder().encodeToString(out.toByteArray());
        }
    }
    private JSONObject material(boolean client)throws Exception{
        JSONObject tls=new JSONObject().put("ca",new JSONObject().put("name","ca.crt").put("data",asset("ca.crt")));
        if(client)tls.put("client",new JSONObject().put("name","client.p12").put("data",asset("client.p12"))).put("password","fixture-only");return tls;
    }
    private String uri(){String uri=InstrumentationRegistry.getArguments().getString("certificateUri");org.junit.Assume.assumeNotNull(uri);return uri;}
    private JSONObject config(boolean client)throws Exception{return new JSONObject().put("connectionString",uri()).put("ssl","verify-full").put("tlsCertificates",material(client));}
    private void connects(JSONObject config)throws Exception{try(PgDatabase db=new PgDatabase()){
        String session=db.connect(config).getString("session");JSONObject row=db.query(session,"SELECT ssl, client_dn FROM pg_stat_ssl WHERE pid=pg_backend_pid()")
            .getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0);
        assertEquals("t",row.getString("ssl"));assertTrue(row.getString("client_dn").contains("tls_probe"));
    }}
    private void rejects(JSONObject config)throws Exception{try(PgDatabase db=new PgDatabase()){
        try{db.connect(config);fail("Untrusted/missing identity accepted");}catch(java.sql.SQLException expected){assertFalse(expected.getMessage().contains("fixture-only"));}
    }}
    @Test public void privateCaAlsoSupportsPasswordAuthenticationWithoutClientCertificate()throws Exception{
        JSONObject input=config(false);input.put("connectionString",uri().replace("tls_probe@","androidtest:psql-test-only@"));
        try(PgDatabase db=new PgDatabase()){String session=db.connect(input).getString("session");assertEquals("t",db.query(session,"SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()").getJSONArray("results").getJSONObject(0).getJSONArray("rows").getJSONObject(0).getString("ssl"));}
    }
    @Test public void privateCaAndPkcs12AuthenticateWithMutualTls()throws Exception{connects(config(true));}
    @Test public void caAndClientIdentityAreRequiredAndScopedPerConnection()throws Exception{
        JSONObject valid=config(true);connects(valid);
        JSONObject wrong=config(true);wrong.getJSONObject("tlsCertificates").getJSONObject("ca").put("data",asset("wrong-ca.crt"));rejects(wrong);
        JSONObject systemOnly=config(true);systemOnly.getJSONObject("tlsCertificates").remove("ca");rejects(systemOnly);
        rejects(config(false));connects(valid);
    }
    @Test public void hostnameVerificationIsStillEnforced()throws Exception{
        JSONObject input=config(true);input.put("connectionString",uri().replace("127.0.0.1","localhost"));
        input.put("ssl","verify-ca");connects(input);input.put("ssl","verify-full");rejects(input);
    }
    @Test public void validatesPasswordsFormatsAndTlsModeWithoutLeakingSecrets()throws Exception{
        JSONObject input=config(true);input.getJSONObject("tlsCertificates").put("password","wrong-secret");
        try{ConnectionOptions.parse(input);fail("Wrong PKCS12 password accepted");}catch(IllegalArgumentException e){assertTrue(e.getMessage().contains("PKCS#12"));assertFalse(e.getMessage().contains("wrong-secret"));}
        input=config(true);input.put("ssl","require");try{ConnectionOptions.parse(input);fail("Certificate without verification accepted");}catch(IllegalArgumentException expected){assertTrue(expected.getMessage().contains("TLS"));}
        try{TlsCertificates.inspect("client",asset("client.crt"),"");fail("Public certificate accepted as client key");}catch(IllegalArgumentException expected){assertTrue(expected.getMessage().contains("PKCS#12"));}
        try{TlsCertificates.inspect("ca",Base64.getEncoder().encodeToString("-----BEGIN PRIVATE KEY-----".getBytes(StandardCharsets.US_ASCII)),"");fail();}catch(IllegalArgumentException expected){assertTrue(expected.getMessage().contains("chiave privata"));}
    }
    @Test public void savedCertificatesAndPasswordAreEncryptedAndSurviveStoreReopen()throws Exception{
        JSONObject input=config(true);ConnectionStore store=new ConnectionStore(InstrumentationRegistry.getInstrumentation().getTargetContext());
        JSONObject saved=store.save(input,"TLS fixture","");String id=saved.getString("id");
        try{
            String disk=InstrumentationRegistry.getInstrumentation().getTargetContext().getSharedPreferences("saved_connections",0).getString(id,"");
            assertFalse(disk.contains("fixture-only"));assertFalse(disk.contains(asset("client.p12").substring(0,100)));
            JSONObject config=new ConnectionStore(InstrumentationRegistry.getInstrumentation().getTargetContext()).read(id).getJSONObject("config");
            assertEquals("fixture-only",config.getJSONObject("tlsCertificates").getString("password"));assertEquals(asset("client.p12"),config.getJSONObject("tlsCertificates").getJSONObject("client").getString("data"));assertEquals(asset("ca.crt"),config.getJSONObject("tlsCertificates").getJSONObject("ca").getString("data"));connects(config);
            JSONArray profiles=store.list();for(int i=0;i<profiles.length();i++)assertFalse(profiles.getJSONObject(i).has("tlsCertificates"));
            config.remove("tlsCertificates");store.save(config,"TLS fixture",id);assertFalse(store.read(id).getJSONObject("config").has("tlsCertificates"));
        }finally{store.remove(id);}
    }
}
