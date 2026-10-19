package it.psqlmobile.app;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
public class TlsCertificatesTest {
    @Test public void rejectsMalformedOversizedOrEmptyMaterial(){
        for(String data:new String[]{"", "not base64!",new String(new char[710000]).replace('\0','A')}){
            try{TlsCertificates.decode(data);fail("Malformed material accepted");}catch(IllegalArgumentException expected){assertFalse(expected.getMessage().contains(data.length()>100?data.substring(0,100):"not base64!"));}
        }
    }
    @Test public void doesNotAcceptUriPathsOrArbitrarySslFactories()throws Exception{
        for(String option:new String[]{"sslrootcert=/secret/file","sslkey=/secret/key","sslfactory=evil.Class"}){
            try{ConnectionOptions.parse(new JSONObject().put("connectionString","postgres://user@localhost/db?"+option));fail("Arbitrary path/factory accepted");}catch(IllegalArgumentException expected){assertFalse(expected.getMessage().contains("/secret/"));}
        }
    }
}
