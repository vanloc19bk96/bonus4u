COLOR BY LINE GENERATOR — v1
=================================================

A tool that generates "Color By Line" colouring pages (coloured outlines, empty
white interiors). No Node, npm, or build step required.


1. HOW TO RUN
-------------------------------------------------
1. Copy this whole folder anywhere on your computer.
2. Double-click index.html.
3. Paste the access key you received and click "Save and continue".
4. Enter a subject, pick presets, click Generate.

Chrome or Edge is recommended. Firefox and Safari may block localStorage when
you open the file directly; the tool still runs, but the key is lost when you
close the tab (an amber banner will warn you).


2. BEFORE REAL USE
-------------------------------------------------
If Generate fails with a blocked connection, see section 4 below.


3. WHERE THE KEY IS STORED, HOW TO DELETE IT
-------------------------------------------------
The key is stored as PLAIN TEXT in this browser's localStorage under
"cbl.apiKey", tied to this browser profile on this computer. Anyone who can
open this machine and this browser profile can read the key.

How to delete it:
- In the app: "Change key" -> "Clear access key".
- Or uncheck "Remember on this computer" when entering the key: it lives for
  this session only.
- Or clear site data in the browser settings.

Other data keys: cbl.settings, cbl.lastConfig, cbl.history.
The key is never written into history, the prompt preview, or console logs.


4. WHEN THE BROWSER BLOCKS THE CONNECTION (CORS)
-------------------------------------------------
Step 1 — run via localhost instead of file://:
    Open Command Prompt in this folder and run:
        py -m http.server 8000
    Then open http://localhost:8000 in Chrome.
    Every feature still works, and localStorage is stable in every browser.

Step 2 — if it is still blocked: you need a small proxy (Node or Python) that
    forwards /v1/draw/* and adds Access-Control-Allow-Origin: *. That breaks
    the "just double-click" promise, so only use it as a last resort.


5. IMPORTANT NOTES
-------------------------------------------------
- Image URLs EXPIRE after about 2 HOURS. Download immediately.
  Cards older than 2 hours show a red "URL expired" badge.
- Images run SEQUENTIALLY, not in parallel. One failure does not stop the batch.
- The Color By Line contract is always appended to the prompt, in both Guided
  and Custom modes. There is no switch to turn it off.
- "Compatibility mode" in Advanced settings switches to polling. Use it when a
  proxy cuts the connection or requests always time out.
- Output is about 1024–1920 px on the long edge. A KDP 8.5 x 11 interior at
  300 DPI needs 2550 x 3300 px, so upscale or vectorize (vtracer / Inkscape)
  before print.


6. FILE LAYOUT
-------------------------------------------------
index.html      App shell
a4e2/           Encoded runtime files
README.txt      This file

No ES modules: file:// blocks module fetch. Everything is classic script
attached to window.CBL, loaded in the order listed in index.html.
