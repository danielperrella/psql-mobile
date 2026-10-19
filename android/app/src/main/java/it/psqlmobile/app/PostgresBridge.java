package it.psqlmobile.app;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.sql.SQLException;
import java.util.concurrent.*;

/** Only bundled app content can access this bridge; callbacks never evaluate database text. */
public final class PostgresBridge implements AutoCloseable {
    private final MainActivity activity;
    private final WebView webView;
    private final PgDatabase database = new PgDatabase();
    private final ConnectionStore connections;
    private final FavoritesStore favorites;
    private final AppUpdater updater;
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0,
        TimeUnit.SECONDS, new ArrayBlockingQueue<>(8));
    private final ThreadPoolExecutor updateWorker = new ThreadPoolExecutor(1, 1, 0,
        TimeUnit.SECONDS, new ArrayBlockingQueue<>(2));
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    private volatile boolean closed;

    PostgresBridge(MainActivity activity, WebView webView, AppUpdater updater) {
        this.activity = activity;
        this.webView = webView;
        this.connections = new ConnectionStore(activity);
        this.favorites = new FavoritesStore(activity);
        this.updater = updater;
        timer.scheduleWithFixedDelay(() -> {
            try { worker.execute(database::expire); } catch (RejectedExecutionException ignored) { }
        }, 60, 60, TimeUnit.SECONDS);
    }

    @JavascriptInterface public void request(String id, String path, String payload) {
        if (closed || id == null || !id.matches("[0-9]{1,12}")) return;
        if (payload == null || payload.length() > 3_000_000) { respond(id, null, "Richiesta troppo grande."); return; }
        try {
            (path.startsWith("/updates/")?updateWorker:worker).execute(() -> {
                String activeSession=null;
                try {
                    JSONObject data = new JSONObject(payload);
                    activeSession=data.optString("session",null);
                    Object result;
                    switch (path) {
                        case "/updates/check": result=updater.check(); break;
                        case "/updates/install": result=updater.downloadAndInstall(); break;
                        case "/certificates/import": activity.importCertificate(id,data.getString("kind")); return;
                        case "/certificates/inspect": result=TlsCertificates.inspect(data.getString("kind"),data.getString("data"),data.optString("password")); break;
                        case "/connect": {
                            JSONObject profile=data.has("profileId")?connections.read(data.getString("profileId")):null;
                            JSONObject config=profile==null?data:profile.getJSONObject("config");
                            JSONObject connected=database.connect(config);
                            if(profile==null&&data.optBoolean("saveConnection",true)) {
                                try { profile=connections.save(config,data.optString("name"),data.optString("replaceProfileId")); }
                                catch(Exception e) { connected.put("saveError","Connessione attiva, ma il salvataggio sul dispositivo non è riuscito."); }
                            }
                            if(profile!=null)connected.put("profileId",profile.getString("id")).put("name",profile.getString("name"));
                            result=connected; break;
                        }
                        case "/favorites/list": result=favorites.list(data.getString("context")); break;
                        case "/favorites/save": result=favorites.save(data.getString("context"),data.getJSONObject("favorite")); break;
                        case "/favorites/remove": favorites.remove(data.getString("context"),data.getString("id")); result=new JSONObject().put("ok",true); break;
                        case "/inverse/list": result=InverseRelations.list(database.connection(data.getString("session")),data.getJSONObject("target"),data.getJSONObject("keys")); break;
                        case "/inverse/read": result=InverseRelations.read(database.connection(data.getString("session")),data.getString("relationId"),data.getJSONObject("keys"),data.optInt("offset")); break;
                        case "/connections/list": result=connections.list(); break;
                        case "/connections/read": result=connections.read(data.getString("profileId")); break;
                        case "/connections/remove": connections.remove(data.getString("profileId")); result=new JSONObject().put("ok",true); break;
                        case "/schema": result = database.schema(data.getString("session")); break;
                        case "/query": result = database.query(data.getString("session"), data.optString("sql")); break;
                        case "/related": result = database.related(data.getString("session"), data.getString("relationId"), data.getJSONArray("values")); break;
                        case "/records/describe": result=RecordService.describe(database.connection(data.getString("session")),data.getJSONObject("target")); break;
                        case "/records/open": result=RecordService.open(database.connection(data.getString("session")),data.getJSONObject("target"),data.getJSONObject("keys"),false); break;
                        case "/records/save": database.requireWritable(data.getString("session")); result=RecordService.write(database.connection(data.getString("session")),data,false); break;
                        case "/records/delete": database.requireWritable(data.getString("session")); result=RecordService.write(database.connection(data.getString("session")),data,true); break;
                        case "/records/lookup": result=RecordService.lookup(database.connection(data.getString("session")),data.getString("relationId"),data.optString("search"),data.optInt("offset")); break;
                        case "/disconnect": database.disconnect(data.optString("session")); result = new JSONObject().put("ok", true); break;
                        case "/export": activity.saveCsv(id, data.getString("text")); return;
                        default: throw new IllegalArgumentException("Operazione non supportata.");
                    }
                    respond(id, result, null);
                } catch (SQLException e) {
                    // Driver connection errors are sanitized by PgDatabase. Never log credentials or SQL.
                    respond(id, null, e.getMessage() + (e.getSQLState() == null ? "" : " [" + e.getSQLState() + "]"));
                } catch (IllegalArgumentException | IllegalStateException e) {
                    respond(id, null, e.getMessage());
                } catch (Exception | LinkageError e) {
                    respond(id, null, "Operazione non riuscita. Verifica la connessione e riconnettiti.");
                } finally {
                    if(activeSession!=null&&!path.startsWith("/updates/"))try{if(database.isReadOnly(activeSession))database.connection(activeSession).rollback();}catch(Exception ignored){}
                }
            });
        } catch (RejectedExecutionException e) { respond(id, null, "Operazione già in corso. Riprova tra poco."); }
    }

    void respond(String id, Object data, String error) {
        if (closed) return;
        try {
            JSONObject envelope = new JSONObject().put("id", id);
            if (error == null) envelope.put("data", data == null ? JSONObject.NULL : data);
            else envelope.put("error", error);
            // JSON is an escaped string argument. Data cannot become executable source.
            String script = "window.__psqlNativeReply(" + JSONObject.quote(envelope.toString()) + ")";
            activity.runOnUiThread(() -> { if (!closed) webView.evaluateJavascript(script, null); });
        } catch (Exception ignored) { }
    }

    @Override public void close() {
        closed = true;
        updateWorker.shutdownNow();
        timer.shutdownNow();
        worker.getQueue().clear();
        worker.execute(database::close);
        worker.shutdown();
    }
}
