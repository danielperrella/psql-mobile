package it.psqlmobile.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.*;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "appassets.androidplatform.net";
    private static final String START = "https://" + ORIGIN + "/assets/index.html";
    private WebView webView;
    private PostgresBridge bridge;
    private AppUpdater updater;
    private String exportId, exportText;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.addView(webView, new android.widget.FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        webView.setBackgroundColor(0xff10171e);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSaveFormData(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                if (response != null) return response;
                // The WebView never loads remote content or makes HTTP database requests.
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (START.equals(uri.toString())) return false;
                // External documents belong to the browser, which has no native database bridge.
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                    && !ORIGIN.equals(uri.getHost())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true;
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) { handler.cancel(); }
        });
        webView.setWebChromeClient(new WebChromeClient());
        updater = new AppUpdater(this);
        bridge = new PostgresBridge(this, webView, updater);
        webView.addJavascriptInterface(bridge, "PsqlNative");
        webView.loadUrl(START);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::handleBack);
    }

    private void handleBack() {
        webView.evaluateJavascript("(()=>{const ds=document.querySelectorAll('dialog[open]');const d=ds[ds.length-1];if(d){if(d.dispatchEvent(new Event('cancel',{cancelable:true})))d.close();return true}return false})()",
            result -> { if (!"true".equals(result)) finish(); });
    }

    @Override public void onBackPressed() { handleBack(); }

    @Override protected void onResume() { super.onResume(); if(updater!=null)updater.resume(); }
    void updateInstallError() {
        webView.evaluateJavascript("window.dispatchEvent(new Event('psql-update-install-error'))",null);
    }

    void saveCsv(String id, String text) {
        runOnUiThread(() -> {
            if (exportId != null) { bridge.respond(id, null, "Salvataggio già in corso."); return; }
            exportId = id; exportText = text;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType("text/csv").putExtra(Intent.EXTRA_TITLE, "psql-risultati.csv");
            try { startActivityForResult(intent, 10); }
            catch (Exception e) { exportId = null; exportText = null; bridge.respond(id, null, "Nessuna app disponibile per salvare il file."); }
        });
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 10 || exportId == null) return;
        String id = exportId, text = exportText;
        exportId = null; exportText = null;
        if (result != RESULT_OK || data == null || data.getData() == null) { bridge.respond(id, null, "Salvataggio annullato."); return; }
        new Thread(() -> {
            try (OutputStream output = getContentResolver().openOutputStream(data.getData(), "wt")) {
                if (output == null) throw new java.io.IOException();
                output.write(text.getBytes(StandardCharsets.UTF_8));
                bridge.respond(id, new org.json.JSONObject().put("ok", true), null);
            } catch (Exception e) { bridge.respond(id, null, "Impossibile salvare il CSV."); }
        }, "csv-export").start();
    }

    @Override protected void onDestroy() {
        exportText = null;
        if (bridge != null) bridge.close();
        if (webView != null) { webView.removeJavascriptInterface("PsqlNative"); webView.destroy(); }
        super.onDestroy();
    }
}
