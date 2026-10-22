"""Acknowledge Android's first-use fullscreen tutorial in the disposable emulator.

Use its real accessible button bounds, not a setting that disables system UI.
Never tap the app when the OS tutorial is absent.
"""
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

subprocess.run(['adb', 'shell', 'uiautomator', 'dump', '/sdcard/immersive-notice.xml'], check=True)
result = subprocess.run(['adb', 'shell', 'cat', '/sdcard/immersive-notice.xml'], check=True, capture_output=True, text=True)
root = ET.fromstring(result.stdout)
button = next((node for node in root.iter('node') if node.get('text') == 'Got it' and node.get('package') == 'com.android.systemui'), None)
evidence = {'systemTutorialShown': button is not None, 'acknowledged': False}
if button is not None:
    bounds = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', button.get('bounds', ''))
    if not bounds:
        raise RuntimeError('Fullscreen tutorial button has no tappable bounds')
    x1, y1, x2, y2 = map(int, bounds.groups())
    subprocess.run(['adb', 'shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2)], check=True)
    evidence['acknowledged'] = True
Path('native-evidence/android-fullscreen-tutorial.json').write_text(json.dumps(evidence, indent=2))
