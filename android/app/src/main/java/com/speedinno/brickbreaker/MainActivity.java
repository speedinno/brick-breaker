package com.speedinno.brickbreaker;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override protected void load() {
        super.load();
        // Navigation remains restricted to the bundled app; no remote frames.
        bridge.getWebView().addJavascriptInterface(new GameStorage(this), "BrickBreakerStorage");
    }
}
