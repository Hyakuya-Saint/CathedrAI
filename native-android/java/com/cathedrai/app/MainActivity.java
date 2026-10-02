package com.cathedrai.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Diag.init(getApplicationContext());       // crash capture + logs, before anything else
        registerPlugin(CathedraPlugin.class);     // local plugin: picker, import, download, engine, diagnostics
        super.onCreate(savedInstanceState);
    }
}
