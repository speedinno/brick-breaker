package com.speedinno.brickbreaker;

import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            // Swipe reveals transient system navigation; focus restoration returns to play.
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            bars.hide(WindowInsetsCompat.Type.systemBars());
        }
    }

    @Override protected void load() {
        super.load();
        // Navigation remains restricted to the bundled app; no remote frames.
        bridge.getWebView().addJavascriptInterface(new GameStorage(this), "BrickBreakerStorage");
    }
}
