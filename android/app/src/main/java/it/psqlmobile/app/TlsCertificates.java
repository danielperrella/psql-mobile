package it.psqlmobile.app;

import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.*;
import java.util.*;
import javax.net.ssl.*;

/** Connection-scoped material, never installed in a global/device trust store. */
final class TlsCertificates {
    static final int MAX_BYTES=512*1024;
    static byte[] decode(String data){
        if(data==null||data.length()>((MAX_BYTES+2)/3)*4)throw new IllegalArgumentException("Certificato troppo grande: massimo 512 KiB per file.");
        try{byte[] bytes=Base64.getDecoder().decode(data);if(bytes.length==0||bytes.length>MAX_BYTES)throw new IllegalArgumentException();return bytes;}
        catch(IllegalArgumentException e){throw new IllegalArgumentException("File certificato vuoto, troppo grande o non valido.");}
    }
    static Collection<X509Certificate> certificates(byte[] bytes)throws Exception{
        if(new String(bytes,StandardCharsets.US_ASCII).contains("PRIVATE KEY"))throw new IllegalArgumentException("Nel campo CA importa solo il certificato pubblico, senza chiave privata.");
        Collection<? extends java.security.cert.Certificate> parsed=CertificateFactory.getInstance("X.509").generateCertificates(new ByteArrayInputStream(bytes));
        if(parsed.isEmpty()||parsed.size()>16)throw new IllegalArgumentException("Importa da 1 a 16 certificati X.509 in formato PEM o DER.");
        List<X509Certificate> result=new ArrayList<>();for(java.security.cert.Certificate cert:parsed){X509Certificate x=(X509Certificate)cert;x.checkValidity();result.add(x);}return result;
    }
    static JSONObject describe(X509Certificate cert)throws Exception{
        StringBuilder fingerprint=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(cert.getEncoded())){if(fingerprint.length()>0)fingerprint.append(':');fingerprint.append(String.format(Locale.ROOT,"%02X",b&255));}
        return new JSONObject().put("subject",cert.getSubjectX500Principal().getName()).put("issuer",cert.getIssuerX500Principal().getName())
            .put("expires",cert.getNotAfter().getTime()).put("fingerprint",fingerprint.toString());
    }
    static KeyStore client(byte[] bytes,String password)throws Exception{
        char[] chars=password.toCharArray();
        try{
            KeyStore store=KeyStore.getInstance("PKCS12");store.load(new ByteArrayInputStream(bytes),chars);
            int keys=0;for(Enumeration<String> aliases=store.aliases();aliases.hasMoreElements();){String alias=aliases.nextElement();if(!store.isKeyEntry(alias))continue;
                if(!(store.getKey(alias,chars) instanceof PrivateKey))throw new GeneralSecurityException();
                java.security.cert.Certificate[] chain=store.getCertificateChain(alias);if(chain==null||chain.length==0||chain.length>16)throw new GeneralSecurityException();
                for(java.security.cert.Certificate cert:chain)((X509Certificate)cert).checkValidity();keys++;
            }
            if(keys!=1)throw new IllegalArgumentException("Il file PKCS#12 deve contenere un solo certificato client con la relativa chiave privata.");
            return store;
        }catch(IllegalArgumentException e){throw e;}
        catch(Exception e){throw new IllegalArgumentException("Password PKCS#12 errata, certificato scaduto o file client non valido.");}
        finally{Arrays.fill(chars,'\0');}
    }
    static JSONObject inspect(String kind,String data,String password){
        byte[] bytes=decode(data);
        try{
            if(kind.equals("ca")){Collection<X509Certificate> certs=certificates(bytes);return describe(certs.iterator().next()).put("count",certs.size());}
            if(!kind.equals("client"))throw new IllegalArgumentException("Tipo di certificato non valido.");
            KeyStore store=client(bytes,password);for(Enumeration<String> aliases=store.aliases();aliases.hasMoreElements();){String alias=aliases.nextElement();if(store.isKeyEntry(alias))return describe((X509Certificate)store.getCertificate(alias)).put("count",1);}
            throw new IllegalArgumentException("Chiave privata client non trovata.");
        }catch(IllegalArgumentException e){throw e;}
        catch(CertificateExpiredException|CertificateNotYetValidException e){throw new IllegalArgumentException("Il certificato è scaduto o non è ancora valido.");}
        catch(Exception e){throw new IllegalArgumentException("Certificato X.509 non valido. Usa un file .crt, .cer o .pem.");}
        finally{Arrays.fill(bytes,(byte)0);}
    }
    static SSLSocketFactory factory(Properties properties)throws Exception{
        TrustManagerFactory trusts=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        String ca=properties.getProperty("psql.ca","");
        if(ca.isEmpty())trusts.init((KeyStore)null);
        else{byte[] bytes=decode(ca);try{KeyStore store=KeyStore.getInstance(KeyStore.getDefaultType());store.load(null,null);int n=0;for(X509Certificate cert:certificates(bytes))store.setCertificateEntry("ca-"+n++,cert);trusts.init(store);}finally{Arrays.fill(bytes,(byte)0);}}
        KeyManager[] managers=null;String client=properties.getProperty("psql.client","");
        if(!client.isEmpty()){byte[] bytes=decode(client);char[] password=properties.getProperty("psql.clientPassword","").toCharArray();
            try{KeyManagerFactory keys=KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());keys.init(client(bytes,new String(password)),password);managers=keys.getKeyManagers();}
            finally{Arrays.fill(bytes,(byte)0);Arrays.fill(password,'\0');}}
        SSLContext context=SSLContext.getInstance("TLS");context.init(managers,trusts.getTrustManagers(),new SecureRandom());return context.getSocketFactory();
    }
}
