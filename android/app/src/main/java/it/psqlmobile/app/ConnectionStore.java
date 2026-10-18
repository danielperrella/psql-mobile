package it.psqlmobile.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Credentials are encrypted with an app-scoped, non-exportable Android Keystore key. */
final class ConnectionStore {
    private static final String KEY_ALIAS="psql_mobile_connections_v1";
    private final SharedPreferences preferences;
    ConnectionStore(Context context) { preferences=context.getSharedPreferences("saved_connections",Context.MODE_PRIVATE); }

    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey)store.getKey(KEY_ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return generator.generateKey();
    }
    private String encrypt(JSONObject profile) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key());
        byte[] data=cipher.doFinal(profile.toString().getBytes(StandardCharsets.UTF_8));
        return new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
            .put("data",Base64.encodeToString(data,Base64.NO_WRAP)).toString();
    }
    private static void checkId(String id) {
        if (id==null||!id.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Connessione salvata non valida.");
    }
    JSONObject read(String id) throws Exception {
        checkId(id);
        String value=preferences.getString(id,null);
        if (value==null) throw new IllegalArgumentException("Connessione salvata non trovata.");
        try {
            JSONObject encrypted=new JSONObject(value);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(encrypted.getString("iv"),Base64.NO_WRAP)));
            return new JSONObject(new String(cipher.doFinal(Base64.decode(encrypted.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8));
        } catch (Exception e) { throw new IllegalStateException("Impossibile leggere questa connessione. Rimuovila e aggiungila di nuovo."); }
    }
    JSONArray list() throws Exception {
        JSONArray profiles=new JSONArray();
        for (String id:preferences.getAll().keySet()) {
            try {
                JSONObject profile=read(id);
                profiles.put(new JSONObject().put("id",id).put("name",profile.getString("name"))
                    .put("host",profile.getString("host")).put("database",profile.getString("database"))
                    .put("user",profile.getString("user")).put("readOnly",profile.optJSONObject("config")!=null
                        &&profile.optJSONObject("config").optBoolean("readOnly",false)));
            } catch (IllegalStateException e) {
                profiles.put(new JSONObject().put("id",id).put("name","Connessione non leggibile").put("unreadable",true));
            }
        }
        return profiles;
    }
    JSONObject save(JSONObject input,String name,String previousId) throws Exception {
        ConnectionOptions options=ConnectionOptions.parse(input);
        String user=options.properties.getProperty("user"); options.properties.clear();
        java.net.URI uri=new java.net.URI(options.jdbcUrl.substring(5));
        String database=java.net.URLDecoder.decode(uri.getRawPath().substring(1).replace("+","%2B"),"UTF-8");
        byte[] digest=MessageDigest.getInstance("SHA-256").digest((options.jdbcUrl+"\0"+user).getBytes(StandardCharsets.UTF_8));
        StringBuilder idBuilder=new StringBuilder(); for(byte b:digest)idBuilder.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        String id=idBuilder.toString();
        if (!preferences.contains(id)&&preferences.getAll().size()>=50) throw new IllegalStateException("Massimo 50 connessioni salvate. Rimuovine una prima di aggiungerne altre.");
        name=name.trim(); if(name.isEmpty())name=database; if(name.length()>80)name=name.substring(0,80);
        JSONObject config=new JSONObject();
        for(String field:new String[]{"connectionString","host","port","database","user","password","ssl"})
            if(input.has(field))config.put(field,input.get(field));
        config.put("readOnly",input.optBoolean("readOnly",false));
        if(config.has("connectionString"))config.put("connectionString",ConnectionOptions.normalize(config.getString("connectionString")));
        JSONObject profile=new JSONObject().put("id",id).put("name",name).put("host",uri.getHost())
            .put("database",database).put("user",user).put("config",config);
        SharedPreferences.Editor edit=preferences.edit().putString(id,encrypt(profile));
        if(previousId!=null&&!previousId.isEmpty()&&!id.equals(previousId)) { checkId(previousId); edit.remove(previousId); }
        if(!edit.commit())throw new IllegalStateException("Salvataggio non riuscito. Riprova.");
        return profile;
    }
    void remove(String id) {
        checkId(id);
        if(!preferences.edit().remove(id).commit())throw new IllegalStateException("Rimozione non riuscita. Riprova.");
    }
}
