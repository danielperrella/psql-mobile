package it.psqlmobile.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Encrypted metadata-only favorites, partitioned by saved connection or demo context. */
final class FavoritesStore {
    private static final String KEY_ALIAS="psql_mobile_favorites_v1";
    private static final int MAX_ITEMS=500, MAX_KEYS=16, MAX_ENTRY_BYTES=64*1024, MAX_CONTEXT_BYTES=2*1024*1024;
    private final SharedPreferences preferences;

    FavoritesStore(Context context) { preferences=context.getSharedPreferences("saved_favorites",Context.MODE_PRIVATE); }

    private static void checkContext(String context) {
        if(context==null||!(context.equals("demo")||context.matches("[a-f0-9]{64}")))
            throw new IllegalArgumentException("Contesto preferiti non valido.");
    }
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if(store.containsAlias(KEY_ALIAS))return (SecretKey)store.getKey(KEY_ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return generator.generateKey();
    }
    private String encrypt(JSONArray favorites) throws Exception {
        byte[] plain=favorites.toString().getBytes(StandardCharsets.UTF_8);
        if(plain.length>MAX_CONTEXT_BYTES)throw new IllegalStateException("Spazio preferiti esaurito per questa connessione.");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key());
        byte[] data=cipher.doFinal(plain);
        return new JSONObject().put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP))
            .put("data",Base64.encodeToString(data,Base64.NO_WRAP)).toString();
    }
    private JSONArray decrypt(String encrypted) throws Exception {
        JSONObject value=new JSONObject(encrypted); Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(value.getString("iv"),Base64.NO_WRAP)));
        return new JSONArray(new String(cipher.doFinal(Base64.decode(value.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8));
    }
    private JSONArray readInternal(String context) throws Exception {
        String value=preferences.getString(context,null); if(value==null)return new JSONArray();
        try { return decrypt(value); }
        catch(Exception error) { throw new IllegalStateException("Impossibile leggere i preferiti di questa connessione."); }
    }
    synchronized JSONArray list(String context) throws Exception {
        checkContext(context); JSONArray stored=readInternal(context), normalized=new JSONArray();
        if(stored.length()>MAX_ITEMS)throw new IllegalStateException("Archivio preferiti non valido.");
        for(int i=0;i<stored.length();i++)normalized.put(validate(stored.getJSONObject(i)));
        return normalized;
    }
    private static String text(JSONObject value,String key) {
        String text=value.optString(key,null);
        if(text==null||text.trim().isEmpty()||text.length()>512||text.indexOf('\0')>=0)
            throw new IllegalArgumentException("Metadati preferito non validi.");
        return text;
    }
    private static JSONObject validate(JSONObject input) {
        if(input==null)throw new IllegalArgumentException("Preferito non valido.");
        try {
            String kind=input.getString("kind"); JSONObject out=new JSONObject().put("kind",kind)
                .put("schema",text(input,"schema")).put("table",text(input,"table"));
            if(kind.equals("table")) {
                if(input.has("keys"))throw new IllegalArgumentException("Preferito tabella non valido.");
            } else if(kind.equals("record")) {
                JSONArray keys=input.getJSONArray("keys");
                if(keys.length()==0||keys.length()>MAX_KEYS)throw new IllegalArgumentException("Chiave primaria non valida.");
                JSONArray clean=new JSONArray(); java.util.HashSet<String> seen=new java.util.HashSet<>();
                for(int i=0;i<keys.length();i++) {
                    JSONObject key=keys.getJSONObject(i); String column=text(key,"column");
                    String value=key.getString("value");
                    if(!seen.add(column)||value.length()>4096||value.indexOf('\0')>=0)
                        throw new IllegalArgumentException("Chiave primaria non valida.");
                    clean.put(new JSONObject().put("column",column).put("value",value));
                }
                java.util.List<JSONObject> sorted=new java.util.ArrayList<>();
                for(int i=0;i<clean.length();i++)sorted.add(clean.getJSONObject(i));
                sorted.sort(java.util.Comparator.comparing(key -> key.optString("column")));
                clean=new JSONArray(); for(JSONObject key:sorted)clean.put(key);
                out.put("keys",clean);
            } else throw new IllegalArgumentException("Tipo di preferito non valido.");
            if(out.toString().getBytes(StandardCharsets.UTF_8).length>MAX_ENTRY_BYTES)
                throw new IllegalArgumentException("Preferito troppo grande.");
            return out;
        } catch(org.json.JSONException error) { throw new IllegalArgumentException("Preferito non valido."); }
    }
    /** Identity matches src/favorites.js: a JSON tuple including the complete ordered PK. */
    private static String identity(JSONObject favorite) throws Exception {
        JSONArray tuple=new JSONArray().put(favorite.getString("kind")).put(favorite.getString("schema")).put(favorite.getString("table"));
        if(favorite.getString("kind").equals("record")) {
            JSONArray keys=favorite.getJSONArray("keys"), pairs=new JSONArray();
            for(int i=0;i<keys.length();i++) { JSONObject key=keys.getJSONObject(i); pairs.put(new JSONArray().put(key.getString("column")).put(key.getString("value"))); }
            tuple.put(pairs);
        }
        return tuple.toString();
    }
    synchronized JSONObject save(String context,JSONObject input) throws Exception {
        checkContext(context); JSONObject favorite=validate(input); JSONArray favorites=readInternal(context);
        String id=identity(favorite); int found=-1;
        for(int i=0;i<favorites.length();i++)if(identity(validate(favorites.getJSONObject(i))).equals(id)){found=i;break;}
        if(found<0&&favorites.length()>=MAX_ITEMS)throw new IllegalStateException("Hai raggiunto il limite di 500 preferiti per questa connessione.");
        if(found>=0)favorites.put(found,favorite);else favorites.put(favorite);
        if(!preferences.edit().putString(context,encrypt(favorites)).commit())throw new IllegalStateException("Salvataggio preferito non riuscito.");
        return favorite;
    }
    synchronized void remove(String context,String id) throws Exception {
        checkContext(context);
        if(id==null||id.isEmpty()||id.length()>MAX_ENTRY_BYTES)throw new IllegalArgumentException("Identificativo preferito non valido.");
        JSONArray favorites=readInternal(context), remaining=new JSONArray();
        for(int i=0;i<favorites.length();i++) {
            JSONObject favorite=validate(favorites.getJSONObject(i));
            if(!identity(favorite).equals(id))remaining.put(favorite);
        }
        if(!preferences.edit().putString(context,encrypt(remaining)).commit())throw new IllegalStateException("Rimozione preferito non riuscita.");
    }
}
