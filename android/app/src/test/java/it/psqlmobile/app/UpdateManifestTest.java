package it.psqlmobile.app;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class UpdateManifestTest {
    private JSONObject manifest() throws Exception {
        return new JSONObject().put("versionCode",5).put("versionName","1.3.1").put("sha256","a".repeat(64))
            .put("size",3000000).put("apkUrl",AppUpdater.BASE+"psql-mobile.apk");
    }
    @Test public void acceptsOnlyBoundedOfficialReleaseMetadata() throws Exception {
        AppUpdater.validate(manifest());
        for(JSONObject invalid:new JSONObject[]{manifest().put("apkUrl","https://example.com/update.apk"),
            manifest().put("size",41_000_000),manifest().put("sha256","wrong"),manifest().put("versionCode",0)}) {
            try{AppUpdater.validate(invalid);fail("Invalid manifest");}catch(IllegalArgumentException expected){}
        }
    }
}
