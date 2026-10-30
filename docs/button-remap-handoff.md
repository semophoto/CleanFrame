# Remote button remap — hand-off briefing

Status as of 2026-10-26. The CleanFrame home screen is installed and running, and the
**Home remap has already been applied to the TV** (25 Oct 15:03). This document covers
the remaining **shortcut-button remap** work and how to resume it.

## Goal

Remap this remote so the hardware buttons open the owner's chosen targets:

| Button | Target | How it will be reached |
| --- | --- | --- |
| Home | CleanFrame (`2WypXqAbpb.CleanFrame`) | native Home-app reassignment (the hard part) |
| Hold Home | Samsung Home (`com.samsung.tv.csfs`) | separate long-press key if the TV exposes one; else fallback below |
| Netflix | Nuvio TV (`NuvioTV001.NuvioTV`) | the button launches that app directly |
| YouTube | TizenTube (`xvvl3S1TT1.TizenTubeStandalone`) | the button launches that app directly |
| Prime Video | HDMI 2 | button launches CleanFrame with app-control `source=hdmi2` |
| Shahid (شاهد) | HDMI 1 | button launches CleanFrame with app-control `source=hdmi1` |

Mapping is also saved at `.local/button-mapping.json`.

## What is already done

- CleanFrame is installed with its own identity `2WypXqAbpb.CleanFrame` (package
  `2WypXqAbpb`), signed with the owner's "Clean" certificate profile.
- **HDMI deep-link is built and preview-tested** (`app/device.js` `requestedSource()`,
  `app/main.js` `applyRequestedSource()`): CleanFrame reads an app-control extra
  `source=hdmiN` (or `?source=hdmiN` in the browser) at launch and when it returns to
  the foreground, and shows that input full screen.
- **Home remap APPLIED on 25 Oct 15:03** (`.local/native-home/apply-output.txt`):
  - Home operation (`http://tizen.org/appcontrol/operation/main`) → `2WypXqAbpb.CleanFrame`
  - `db/appfw/home_appid` = `2WypXqAbpb.CleanFrame`
  - `db/first_screen/type` = `2WypXqAbpb.CleanFrame` (synced by the TV)
  - `db/menu/smart_hub/ontvsetting/auto_start` = 1
  - `db/appfw/startup_appid` / `booting_appid_backup` left at `org.tizen.tv-viewer`
  - Original values saved once to `.local/native-home/snapshot-original.json`
    (Home=csfs, home_appid=csfs, first_screen=csfs, auto_start=0).
- **Helper built** for this TV: `scripts/native-home/Control.cs` adapted (Target =
  `2WypXqAbpb.CleanFrame`, firmware guard `T-PTMFUABC-0090-1301.0` in
  `build-1301/Control.cs`), compiled to `.local/native-home/out/CleanFrameHomeControl.dll`.
- **System binaries retrieved** to `.local/native-home/dll/` (via probe37 base64):
  `csfs.dll` (532 KB, Samsung Home) and `hotkey.dll` (12.8 KB, the shortcut-key service).

## Key findings about this TV (research done 24–25 Oct)

- Model `QA77S85FAEXSA`, firmware `T-PTMFUABC-0090-1301.0`, Tizen 9.0, armv7 / 32-bit.
  (Exact device identifiers, incl. DUID, are in the private `.local/setup-record.json`.)
- Arbitrary shell over sdb is blocked (`intershell_support:disabled`,
  `sdbd_rootperm:disabled`). Everything runs through the UID-901 package-name
  command-execution transport (`.local/native-home/inspect-run.mjs`), which reaches
  and executes on this firmware. The TV has .NET 6 (`6.0.0`, `6.0.9`).
- **Shortcut buttons**: `com.samsung.tv.hotkey-service` (a .NET 8 in-house service app,
  v1.0.19) owns the three app buttons. Its manifest app-context routes
  `XF86App1/2/3` **and** `XF86App1Long/2Long/3Long` to it, with args
  `press:XF86AppN` / `longpress:XF86AppN`. The fourth remote app button is not among
  these keys (not yet identified).
  - The service loads `res/allowlist.txt` (141 bytes — content not yet read), reads
    vconf `memory/appfw/current_partial_appid` and `db/appfw/last_android_appid`, and
    calls `GetFullscreenApplicationId`, `TryToLaunchApplication`,
    `GetDownloadableApp`, `TryToSaveFullscreenApp` (per full #Strings/#Blob/MemberRef
    analysis of the retrieved `hotkey.dll`).
  - The key names (`XF86AppN`) are **not** embedded in the service assembly, so the
    button → app assignment lives outside it: candidate stores are the allowlist,
    the service's own appdata (`/home/owner/apps_rw/com.samsung.tv.hotkey-service/`),
    and vconf. The vconf string storage already shows an unassigned 8-slot value
    `H1_NA_NA_H2_NA_NA_H3_NA_NA_H4_NA_NA_H5_NA_NA_H6_NA_NA_H7_NA_NA_H8_NA_NA_`
    (likely the per-button assignment table; key name not yet identified).
- **Home key**: `com.samsung.tv.csfs` (Samsung Home) declares app-context for
  `XF86Display` (`entry_point:source_key`), `XF86KeyQuickSetting`, `XF86AndroidMenu`,
  `XF86LaunchApps`, and its binary (retrieved) grabs `XF86Home`/`XF86Exit` at runtime,
  reads `memory/appfw/current_fullscreen_appid` and
  `memory/appfw/previous_fullscreen_appid`, and references the
  `http://tizen.org/appcontrol/operation/main` operation — the same one we retargeted.
  Hold-Home behavior is expected to remain csfs-native; verify physically.
- vconftool on this firmware has **no working `-r` recursive get**; enumerate keys by
  scanning `/dev/shm/shm_vconf_key_list` and `/dev/shm/shm_vconf_str_storage`.

## Hard blocker for whoever resumes

Claude Code's safety classifier **blocks the assistant from running or authoring the
UID-901 transport** (correctly — it is a device sandbox escape). Every transport run has
to be executed by the owner on their own machine. Read-only scripts and apply plans are
prepared here; the owner runs them and pastes/keeps the output.

## Remaining steps (in order)

1. **Run probe 41** (read-only; identifies the button mapping):
   ```
   node .local\native-home\inspect-run.mjs .local\native-home\probe41.sh probe41
   ```
   It reads: allowlist.txt content; the hotkey service's appdata; hotkey-ish vconf
   key names **and their current values** (dynamic `vconftool get`); keymap/buxton
   files; which other apps claim `XF86App*` keys; whether the service's `res/` is
   writable by UID 901; and re-prints the current Home/vconf values for sanity.
   Output lands in `.local/native-home/probe41-output.txt`.
2. **Decide the mapping mechanism** from probe 41:
   - (a) vconf assignment (the `H1..H8` value or a key found by probe 41) — preferred;
   - (b) edit `res/allowlist.txt` (only if probe 41 shows the res dir is writable and
     the allowlist gates our target app IDs);
   - (c) install a tiny owner-signed helper service app that claims the two HDMI
     buttons' keys in its manifest app-context and launches CleanFrame with
     `source=hdmiN` (needed if the native mapping can't carry the HDMI extra);
   - (d) last resort: CleanFrame captures the keys itself while in the foreground
     (only works from CleanFrame).
   For the two HDMI buttons the target must be *CleanFrame with an extra*, so the
   chosen mechanism must be able to pass `source=hdmiN` (or fall back to (c)/(d)).
3. **Prepare the exact apply + restore** (one vconf set and/or one allowlist file
   write, with exact original values), show the owner, get explicit approval,
   apply once, read back.
4. **Physical verification**: each of the four shortcut buttons opens its target;
   Home from two apps opens CleanFrame; Hold Home still reaches Samsung Home;
   power-on still lands in CleanFrame; Art Mode unaffected.

## Recovery rule

Original Home/startup values are captured in `.local/native-home/snapshot-original.json`
(keep a copy outside the repo). Restore with the same helper before ever uninstalling
CleanFrame, changing its app identity, or updating the firmware:

```
node .local\native-home\inspect-run.mjs .local\native-home\restore-home.sh restore
```

(same command shape as the apply run; restore snapshot = `snapshot-original.json`).
For the shortcut buttons, keep the probe-41 original value of whatever key/file we
change, and restore it before any of the events above. A firmware update needs a
fresh compatibility check and may disable the helper, including its restore path.
