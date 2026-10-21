#!/usr/bin/env bash
set -euo pipefail
mkdir -p native-evidence
APK=$(find native-build -name app-debug.apk -print -quit)
test -n "$APK"
adb install "$APK"
adb shell svc wifi disable
adb shell svc data disable
adb logcat -c
adb shell am start -W -n com.speedinno.brickbreaker/.MainActivity
sleep 8
APP_PID=$(adb shell pidof com.speedinno.brickbreaker | tr -d '\r')
test -n "$APP_PID"
adb forward tcp:9222 "localabstract:webview_devtools_remote_$APP_PID"
node tests/native/android-smoke.mjs
adb exec-out screencap -p > native-evidence/Android-native-playing.png
adb shell am force-stop com.speedinno.brickbreaker
adb shell am start -W -n com.speedinno.brickbreaker/.MainActivity
sleep 5
adb exec-out screencap -p > native-evidence/Android-native-relaunch.png
adb logcat -d > native-evidence/android-logcat.txt
if grep -q 'FATAL EXCEPTION' native-evidence/android-logcat.txt; then
  echo 'Unexpected native crash in emulator log'
  exit 1
fi
