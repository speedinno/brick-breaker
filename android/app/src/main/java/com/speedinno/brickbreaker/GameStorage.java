package com.speedinno.brickbreaker;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.Map;

/** Private, game-only storage. commit() completes the disk write before return. */
public final class GameStorage {
    private final SharedPreferences preferences;
    GameStorage(Context context) {
        preferences = context.getSharedPreferences("brick-breaker-saves", Context.MODE_PRIVATE);
    }
    private boolean valid(String key) {
        return key != null && key.startsWith("brick-breaker-") && key.length() <= 200;
    }
    @JavascriptInterface public synchronized String snapshot() {
        JSONObject values = new JSONObject(), result = new JSONObject();
        try {
            for (Map.Entry<String, ?> entry : preferences.getAll().entrySet()) {
                if (valid(entry.getKey()) && entry.getValue() instanceof String)
                    values.put(entry.getKey(), entry.getValue());
            }
            result.put("initialized", preferences.getBoolean("initialized", false));
            result.put("values", values);
        } catch (Exception ignored) { return "{}"; }
        return result.toString();
    }
    @JavascriptInterface public synchronized boolean initialize(String seed) {
        if (preferences.getBoolean("initialized", false)) return true;
        if (seed == null || seed.length() > 5_000_000) return false;
        try {
            JSONObject values = new JSONObject(seed);
            SharedPreferences.Editor editor = preferences.edit();
            Iterator<String> keys = values.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (!valid(key) || !(values.get(key) instanceof String)) return false;
                editor.putString(key, values.getString(key));
            }
            return editor.putBoolean("initialized", true).commit();
        } catch (Exception ignored) { return false; }
    }
    @JavascriptInterface public synchronized boolean write(String key, String value) {
        if (!valid(key) || value == null || value.length() > 1_000_000) return false;
        return preferences.edit().putString(key, value).commit();
    }
    @JavascriptInterface public synchronized boolean remove(String key) {
        return valid(key) && preferences.edit().remove(key).commit();
    }
}
