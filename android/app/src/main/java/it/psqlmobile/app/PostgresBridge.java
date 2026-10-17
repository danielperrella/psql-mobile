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
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 1, 0,
        TimeUnit.SECONDS, new ArrayBlockingQueue<>(8));
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    private volatile boolean closed;

    PostgresBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        timer.scheduleWithFixedDelay(() -> {
            try { worker.execute(database::expire); } catch (RejectedExecutionException ignored) { }
        }, 60, 60, TimeUnit.SECONDS);
    }

    @JavascriptInterface public void request(String id, String path, String payload) {
        if (closed || id == null || !id.matches("[0-9]{1,12}")) return;
        if (payload == null || payload.length() > 3_000_000) { respond(id, null, "Richiesta troppo grande."); return; }
        try {
            worker.execute(() -> {
                try {
                    JSONObject data = new JSONObject(payload);
                    Object result;
                    switch (path) {
                        case "/connect": result = database.connect(data); break;
                        case "/schema": result = database.schema(data.getString("session")); break;
                        case "/query": result = database.query(data.getString("session"), data.optString("sql")); break;
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
        timer.shutdownNow();
        worker.getQueue().clear();
        worker.execute(database::close);
        worker.shutdown();
    }
}
