package it.psqlmobile.app;

import org.json.JSONObject;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;

/** Converts a PostgreSQL URI to a driver URL without copying arbitrary driver options. */
public final class ConnectionOptions {
    final String jdbcUrl;
    final Properties properties;

    private ConnectionOptions(String url, Properties properties) {
        this.jdbcUrl = url;
        this.properties = properties;
    }

    private static String decode(String value) {
        // '+' is literal in PostgreSQL URIs, including passwords.
        try { return URLDecoder.decode(value.replace("+", "%2B"), "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { throw new AssertionError(e); }
    }

    public static ConnectionOptions parse(JSONObject input) {
        String host = input.optString("host"), database = input.optString("database");
        String user = input.optString("user"), password = input.optString("password");
        int port = input.optInt("port", 5432);
        String tls = input.optString("ssl", "auto"), uriTls = "verify-full";
        String channelBinding = "prefer", applicationName = "Psql Mobile Android";
        String connectionString = input.optString("connectionString").trim();
        if (!connectionString.isEmpty()) {
            try {
                URI uri = new URI(connectionString);
                if (!("postgres".equals(uri.getScheme()) || "postgresql".equals(uri.getScheme()))
                        || uri.getHost() == null || uri.getFragment() != null) {
                    throw new IllegalArgumentException();
                }
                host = uri.getHost();
                port = uri.getPort() == -1 ? 5432 : uri.getPort();
                String info = uri.getRawUserInfo();
                if (info != null) {
                    String[] credentials = info.split(":", 2);
                    user = decode(credentials[0]);
                    password = credentials.length == 2 ? decode(credentials[1]) : "";
                }
                database = decode(uri.getRawPath() == null ? "" : uri.getRawPath().replaceFirst("^/", ""));
                Map<String,String> params = new LinkedHashMap<>();
                if (uri.getRawQuery() != null) for (String part : uri.getRawQuery().split("&")) {
                    if (part.isEmpty()) continue;
                    String[] pair = part.split("=", 2);
                    String key = decode(pair[0]);
                    if (params.containsKey(key)) throw new IllegalArgumentException();
                    params.put(key, pair.length == 2 ? decode(pair[1]) : "");
                }
                for (Map.Entry<String,String> param : params.entrySet()) {
                    switch (param.getKey()) {
                        case "user": user = param.getValue(); break;
                        case "password": password = param.getValue(); break;
                        case "sslmode": uriTls = param.getValue(); break;
                        case "channel_binding": channelBinding = param.getValue(); break;
                        case "application_name": applicationName = param.getValue(); break;
                        default: throw new IllegalArgumentException("Parametro URI non supportato. Usa host, porta, database, utente, password, sslmode, channel_binding e application_name.");
                    }
                }
            } catch (IllegalArgumentException e) {
                if (e.getMessage() != null && e.getMessage().startsWith("Parametro URI")) throw e;
                throw new IllegalArgumentException("URI PostgreSQL non valida. Usa postgresql://utente:password@host:5432/database.");
            } catch (Exception e) {
                throw new IllegalArgumentException("URI PostgreSQL non valida. Codifica i caratteri speciali della password con percent-encoding.");
            }
        }
        if (host.trim().isEmpty() || user.trim().isEmpty()) throw new IllegalArgumentException("Host e utente obbligatori.");
        if (database.isEmpty()) database = user;
        if (port < 1 || port > 65535) throw new IllegalArgumentException("Porta non valida.");
        // Host never becomes part of a driver query string.
        if (!host.matches("[a-zA-Z0-9.\\-:\\[\\]_%]+")) throw new IllegalArgumentException("Host non valido.");
        if (host.indexOf(':') >= 0 && !host.startsWith("[")) host = "[" + host + "]";
        if (tls.equals("auto")) tls = uriTls;
        if (!java.util.Arrays.asList("disable", "require", "verify-ca", "verify-full", "prefer", "allow").contains(tls))
            throw new IllegalArgumentException("sslmode non supportato.");
        if (!java.util.Arrays.asList("prefer", "require", "disable").contains(channelBinding))
            throw new IllegalArgumentException("channel_binding non supportato.");
        Properties p = new Properties();
        p.setProperty("user", user);
        p.setProperty("password", password);
        p.setProperty("sslmode", tls);
        // Use Android's system CA store with certificate and hostname verification.
        if (tls.startsWith("verify")) p.setProperty("sslfactory", "org.postgresql.ssl.DefaultJavaSSLFactory");
        p.setProperty("gssEncMode", "disable"); // Android has no JGSS/Kerberos runtime.
        p.setProperty("jaasLogin", "false");
        p.setProperty("channelBinding", channelBinding);
        p.setProperty("connectTimeout", "10");
        p.setProperty("socketTimeout", "20");
        p.setProperty("cancelSignalTimeout", "5");
        p.setProperty("ApplicationName", applicationName);
        p.setProperty("preferQueryMode", "simple");
        p.setProperty("binaryTransfer", "false");
        p.setProperty("logServerErrorDetail", "false");
        String path;
        try { path = URLEncoder.encode(database, "UTF-8").replace("+", "%20"); }
        catch (java.io.UnsupportedEncodingException e) { throw new AssertionError(e); }
        return new ConnectionOptions("jdbc:postgresql://" + host + ":" + port + "/" + path, p);
    }
}
