package it.psqlmobile.app;

import org.json.JSONObject;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.URISyntaxException;
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
        catch (IllegalArgumentException e) { throw new IllegalArgumentException("Sequenza % non valida nella URI. Un % letterale si scrive %25."); }
    }

    static String normalize(String value) {
        String uri = value.trim();
        boolean command = uri.matches("(?is)^psql(?:\\.exe)?(?:\\s.*|$)");
        if (command) uri = uri.replaceFirst("(?i)^psql(?:\\.exe)?(?:\\s+|$)", "").trim();
        if (uri.isEmpty()) throw new IllegalArgumentException("Incolla una URI PostgreSQL oppure psql seguito dalla URI tra virgolette.");
        char first = uri.charAt(0), last = uri.charAt(uri.length() - 1);
        char closing = first == '\'' ? '\'' : first == '"' ? '"' : first == '‘' ? '’' : first == '“' ? '”' : 0;
        if (closing != 0) {
            if (uri.length() < 2 || last != closing) throw new IllegalArgumentException("Virgolette esterne non chiuse. Esempio generico: psql 'postgresql://utente:password@db.example.com/database'.");
            uri = uri.substring(1, uri.length() - 1).trim();
        }
        if (!(uri.startsWith("postgresql://") || uri.startsWith("postgres://")))
            throw new IllegalArgumentException(command ? "Dopo psql incolla una sola URI, senza altre opzioni del terminale." : "La URI deve iniziare con postgresql:// o postgres://. Puoi incollare anche psql seguito dalla URI tra virgolette.");
        if (uri.matches("(?s).*\\s.*")) throw new IllegalArgumentException("Spazio o a capo non codificato nella URI. Per uno spazio nelle credenziali usa %20.");
        if (uri.matches("(?s).*%(?![0-9a-fA-F]{2}).*")) throw new IllegalArgumentException("Sequenza % non valida nella URI. Un % letterale si scrive %25.");
        if (uri.indexOf('#') >= 0) throw new IllegalArgumentException("Il carattere # nelle credenziali deve essere scritto %23. Esempio generico: pass%23word.");
        return uri;
    }

    public static ConnectionOptions parse(JSONObject input) {
        String host = input.optString("host"), database = input.optString("database");
        String user = input.optString("user"), password = input.optString("password");
        int port = input.optInt("port", 5432);
        String tls = input.optString("ssl", "auto"), uriTls = "verify-full";
        String channelBinding = "prefer", applicationName = "Psql Mobile Android";
        String connectionString = input.optString("connectionString").trim();
        if (!connectionString.isEmpty()) connectionString = normalize(connectionString);
        if (!connectionString.isEmpty()) {
            try {
                URI uri = new URI(connectionString);
                if (!("postgres".equals(uri.getScheme()) || "postgresql".equals(uri.getScheme()))
                        || uri.getHost() == null || uri.getFragment() != null) {
                    throw new IllegalArgumentException("Controlla host e separatori della URI. Un @ nelle credenziali si scrive %40. Esempio generico: postgresql://utente:pass%40word@db.example.com/database.");
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
                    if (params.containsKey(key)) throw new IllegalArgumentException("Un parametro della URI è ripetuto: usa una sola occorrenza per parametro.");
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
            } catch (URISyntaxException e) {
                throw new IllegalArgumentException("Carattere non ammesso alla posizione " + (e.getIndex() + 1) + " della URI. Nelle credenziali usa, per esempio, %40 per @, %2F per / e %3F per ?.");
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
