# CleanFrame on QA77S85FAEXSA — project briefing

Status 2026-10-24. Fork of `nthnclrk/CleanFrame` adapted to the owner's Samsung S85F OLED.
This is the whole-project hand-off; the parked remote-button work has its own doc,
[button-remap-handoff.md](button-remap-handoff.md).

## Goal

Adapt the CleanFrame launcher to the owner's TV: his apps, a weather + prayer-times
panel, a rain radar, quick HDMI access, and (parked) a remote-button remap.

## Environment

- **TV**: `QA77S85FAEXSA` (model code 25_PTM_QD, 2025), firmware `T-PTMFUABC-0090-1301.0`,
  Tizen 9.0, armv7 / 32-bit, at 192.168.2.177. Developer Mode on, Host PC IP 192.168.2.7.
- **PC**: Windows 11, LAN 192.168.2.7. Tizen Studio CLI 6.1 at `C:\Users\Ghost\tizen-studio`
  (sdb 4.2.25, tizen CLI 2.5.25) + Samsung TV Extensions 10.0 + Certificate Extension.
- **App identity**: package `2WypXqAbpb`, application `2WypXqAbpb.CleanFrame` (the owner's
  own, replacing the upstream maintainer's).
- **Signing**: Samsung "Clean" profile; certs in `C:\Users\Ghost\SamsungCertificate\Clean`
  (author + distributor, distributor bound to the TV's DUID, both valid to 2027-10-24).
  Back this folder up — in-place updates need the same author cert.
- **Private, git-ignored** (`.local/`): `device.json` (TV IP), `setup-record.json`
  (model/firmware/DUID), `button-mapping.json`, `native-home/` tooling, `serve.js` preview.

## What is built and installed

Installed and running on the TV (verified by applist + launch):

- **Home apps**: Nuvio TV, TizenTube, Art Mode. New installs default to these.
- **Widgets** (`app/widgets.js`): weather (Open-Meteo, cached) and the five daily prayers
  (Umm al-Qura, computed offline), next prayer highlighted, under the clock. Display-only,
  never takes remote focus.
- **Location**: automatic — TV location service, then IP lookup (ipapi.co / ipwho.is),
  then Taif. IP results map to the nearest listed Saudi city. Manual city choice in Settings.
- **Settings → Clock and widgets**: 12/24-hour time (clock + prayers), location, rain radar.
- **Rain radar**: shown only when rain is within ~45 km (sampled via Open-Meteo), RainViewer
  radar over Esri's dark base map, no API key needed. Toggle in settings.
- **HDMI**: connected ports appear as dock tiles once; selecting one shows that input full
  screen via `tizen.tvwindow`, Back returns home. CleanFrame also deep-links to an input via
  app-control `source=hdmiN` (for the parked button remap).
- **Settings → Layout → Dock position**: Standard or Lower.
- Samsung's 2025 promo app hidden from All apps; long focused names kept clear of the widgets.

## Build / sign / install / update

From the repo root on the PC (PowerShell), with the "Clean" profile active:

```
# Build + sign  (NoDefaultCurrentDirectoryInExePath must be unset for Samsung's scripts)
Copy-Item app dist\build -Recurse
C:\Users\Ghost\tizen-studio\tools\ide\bin\tizen.bat package -t wgt -s Clean -o dist -- dist\build
# → dist\CleanFrame.wgt

# Install / update on the TV (same app id = in-place update, settings kept)
$s="C:\Users\Ghost\tizen-studio\tools\sdb.exe"; $d="192.168.2.177:26101"
& $s connect $d
& $s -s $d push dist\CleanFrame.wgt /home/owner/share/tmp/sdk_tools/CleanFrame.wgt
& $s -s $d shell 0 vd_appinstall 2WypXqAbpb.CleanFrame /home/owner/share/tmp/sdk_tools/CleanFrame.wgt
& $s -s $d shell 0 execute 2WypXqAbpb.CleanFrame
```

Expect `install completed` and the app in `sdb -s $d shell 0 applist`.

## Preview (no TV)

No Python on this PC, so the repo's `scripts/preview.py` is replaced locally by
`.local/serve.js`. Launch config is `../.claude/launch.json` (name `cleanframe`, port 4795),
serving `http://127.0.0.1:4795/home/`. `?source=hdmiN` tests the HDMI deep-link.

## Source control

- Branch `s85f-home-widgets` off the owner's fork `semophoto/CleanFrame`, `upstream` =
  `nthnclrk/CleanFrame`. Commits so far: S85F apps + widgets; location + 12/24h; rain radar;
  own app identity; HDMI dock + overlap/focus fix; lower dock + HDMI names; HDMI deep-link;
  this briefing set.
- **Not pushed** — needs the owner to sign in to GitHub on the PC, then `git push -u origin
  s85f-home-widgets`. Nothing from `.local/` or `dist/` is committed. Do not merge to main
  without the owner's say-so.

## Tests

`scripts/check.py` and `scripts/check-browser.mjs` were updated for the new apps, widgets,
location, radar, HDMI tiles, deep-link and dock position. They **need Python 3** (and the
browser suite needs `npm ci` + Playwright Chromium) to run, which isn't installed here.
Source/`node --check` and manual preview verification have been done throughout.

## Parked: remote button remap

See [button-remap-handoff.md](button-remap-handoff.md). Short version: the only way to
read/change the Home/startup settings is the UID-901 command transport (works on this
firmware), but Claude Code's safety classifier blocks the assistant from running it, so the
owner must run the read-only inspection and paste the result before an apply is prepared.

## Open items

1. Owner: GitHub sign-in → push `s85f-home-widgets`.
2. Owner: set city to Taif in Settings (automatic detection lands on the ISP's city).
3. Optional: install Python 3 to run the automated test suites.
4. When wanted: resume the button remap per its hand-off doc.
5. Confirm on the TV: HDMI sound/latency, whether HDMI tiles can show device names,
   and whether the firmware exposes a distinct long-press Home key.

## Cautions

Keep `.local/` and the SamsungCertificate folder private and backed up. Treat the native
Home/startup change as separate and higher-risk: capture and back up the original values,
test restore, and restore before ever uninstalling CleanFrame or changing its identity.
