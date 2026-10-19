package it.psqlmobile.app;

import javax.net.ssl.*;

/** pgJDBC's CN fallback uses javax.naming, which does not exist on Android. */
public final class AndroidHostnameVerifier implements HostnameVerifier {
    public AndroidHostnameVerifier(){}
    @Override public boolean verify(String host,SSLSession session){
        return HttpsURLConnection.getDefaultHostnameVerifier().verify(host,session);
    }
}
