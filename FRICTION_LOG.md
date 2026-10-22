# Friction Log — Vega OS / Fire TV development

Eleven developer-experience findings recorded while building BigPrint TV
(Vega OS, React Native 0.83, Vega SDK 0.24.12112, Vega CLI 1.4.4) on Linux
Mint 22 (Ubuntu 24.04 base), between 1 and 22 October 2026. Every entry was
written the day it happened, with the exact command and the exact error, so
each can be reproduced by someone who was not there.

## At a glance

| # | Finding | Severity | What it cost | Status |
|---|---|---|---|---|
| [1](#1-build-fails-when-the-project-path-contains-a-space) | Build fails when the project path contains a space | **High** | All builds blocked for half a day; the error names a directory you never typed | Worked around (renamed the folder) |
| [2](#2-accessibility-props-are-undocumented-as-kepler-only-imports) | Accessibility props are Kepler-only imports, undocumented | Medium | TypeScript errors while following the official accessibility guide | Worked around |
| [3](#3-post-open-debugger-reports-success-but-no-browser-opens) | `POST /open-debugger` says 200, opens nothing | Medium | React Native DevTools unreachable by the documented route | Worked around |
| [4](#4-vega-project-doctor-flags-an-officially-supported-library) | `vega project doctor` flags a supported library as unknown | Low | Minutes, but it teaches you to ignore the tool | Open |
| [5](#5-screenshots-are-unavailable-on-the-virtual-device) | No screenshots on the virtual device; `vega device info` is empty | Medium | No automated visual checks; demo captured with a screen recorder | Open |
| [6](#6-jest-setup-for-the-ported-asyncstorage-is-undocumented) | Jest setup for the ported AsyncStorage is undocumented | Low | An hour | Worked around |
| [7](#7-audioplayer-in-react-native-w3cmedia-is-documented-only-for-mse-pre-buffering) | `AudioPlayer` documented only for MSE; speech playback inferred from types | Low | Read the type definitions instead of the docs | Worked around |
| [8](#8-s3-answers-accessdenied-for-a-key-that-simply-does-not-exist) | S3 says AccessDenied for a key that does not exist | Medium | An evening diagnosing a policy that was fine | Understood |
| [9](#9-the-build-silently-rewrites-manifesttoml) | The build silently rewrites `manifest.toml` | Low | Confusing diffs | Open |
| [10](#10-a-public-lambda-function-url-configured-exactly-as-documented-answers-403-to-everyone) | A public Lambda Function URL, configured as documented, answers 403 | **High** | The TV could not reach its backend; a day lost | Worked around (API Gateway in front) |
| [11](#11-the-launcher-crops-the-app-icon-to-169-and-the-manifest-reference-does-not-say-so) | The launcher crops the icon to 16:9; the manifest reference does not say so | Medium | A visibly broken icon, found by eye three days before submission | Worked around (16:9 safe area) |

Two were real blockers (1 and 10). Three are still open and would be fixed
by a documentation line each (4, 5, 9). Entry 11 includes a proposed safe-area
spec for the icon; entry 1 includes the exact unquoted subprocess call.

**What would have saved the most time, in order:** quoting the path in
`kepler-module-manifest-builder` (#1); one sentence in the setup guide listing
the `[wants]` audio services and the Kepler-only accessibility imports (#2,
and the silent-audio gotcha noted in CONTEXT.md); a note on the Function URL
behaviour or a working example (#10); frame capture on the virtual device (#5).

Format per entry: task attempted → steps → expected vs actual → severity →
workaround → suggestion.

---

## 1. Build fails when the project path contains a space

**Severity: High — blocked all builds until the directory was renamed.**

**Task:** Build a freshly generated `helloWorld` project.

**Steps:** `vega project generate -t helloWorld` into
`/home/rukhsar/Desktop/vega os and fire tv env`, then `npm run build:debug`.

**Expected:** A build, or a clear error naming the unsupported path.

**Actual:**

```
/bin/sh: 1: /home/rukhsar/Desktop/vega: not found
error Unable to generate a manifest: Error: Command failed:
  /home/.../node_modules/@amazon-devices/kepler-module-manifest-builder/dist/src/cli.js
  build -d /home/rukhsar/Desktop/vega os and fire tv env -p ./package.json -s
```

`kepler-module-manifest-builder` is invoked through a shell without quoting the
`-d` path, so the path splits at the first space and the shell tries to execute
`/home/rukhsar/Desktop/vega`.

**Workaround:** Rename the directory to remove spaces
(`vega-os-and-fire-tv-env`). Build then succeeds unchanged.

**Suggestion:** Quote the path in the subprocess invocation, or pass arguments
as an array rather than a shell string. Failing that, have
`vega project generate` refuse to scaffold into a path containing spaces, with
an explicit message. The current failure mode gives no hint that the path is
the cause — the error names a directory the developer never typed.

---

## 2. Accessibility props are undocumented as Kepler-only imports

**Severity: Medium — produced TypeScript errors while following official guidance.**

**Task:** Apply `accessibilityDescribedBy` and `accessibilityOrientationText`
as described in the Vega accessibility documentation.

**Steps:** Imported `View` and `Pressable` from `react-native` (as the
`helloWorld` template does), then added the two props per the docs' examples.

**Expected:** Type-checks, since the docs present these as standard Vega props.

**Actual:**

```
error TS2322: Property 'accessibilityDescribedBy' does not exist on type
  'IntrinsicAttributes & PressableProps & RefAttributes<View>'.
error TS2769: Property 'accessibilityOrientationText' does not exist on type
  '... Readonly<ViewProps>'.
```

The props are declared in
`@amazon-devices/react-native-kepler/Libraries/Components/View/ViewAccessibility.d.ts`,
so they only type-check when the components are imported from
`@amazon-devices/react-native-kepler` rather than `react-native`.

**Workaround:** Import `View`, `Pressable`, `Text`, `ScrollView` from
`@amazon-devices/react-native-kepler`.

**Suggestion:** State the required import source in the accessibility docs, and
show it in the code samples — the samples currently show bare JSX with no import
line. Note that the generated `helloWorld` template imports from `react-native`,
so developers following both the template and the a11y docs hit this by default.

---

## 3. `POST /open-debugger` reports success but no browser opens

**Severity: Medium — React Native DevTools unreachable by the documented route.**

**Task:** Open React Native DevTools for a running Vega app (RN 0.83, where
`console.log` output is only visible in DevTools).

**Steps:** Metro running and the app connected (`/json/list` showed the target
`com.bigprint.tv`, `prefersFuseboxFrontend: true`). Called
`POST http://localhost:8081/open-debugger`.

**Expected:** A DevTools window.

**Actual:** HTTP 200, and Metro logged `INFO Launching DevTools...` followed by
a source-map build — but no browser process ever started. Google Chrome was
installed and set as the system default browser. The Metro process had
`DISPLAY=:0`, `XAUTHORITY`, and `DBUS_SESSION_BUS_ADDRESS` correctly inherited,
so it had everything needed to launch a window. Failure was silent.

**Workaround:** Launch the frontend directly:

```bash
google-chrome --new-window "http://localhost:8081$(curl -s \
  http://localhost:8081/json/list | python3 -c \
  "import sys,json;print(json.load(sys.stdin)[0]['devtoolsFrontendUrl'])")"
```

**Suggestion:** Surface the launcher's failure in the Metro log rather than
logging only the attempt, and print the `devtoolsFrontendUrl` as a fallback so
the developer can open it manually. Tested on Linux Mint 22 / X11.

---

## 4. `vega project doctor` flags an officially supported library

**Severity: Low — misleading, but harmless once understood.**

**Task:** Validate the project after adding
`@amazon-devices/react-native-qrcode-svg@~3.0.0`, the version the Vega docs
specify for SDK 0.24.

**Steps:** `vega project doctor`.

**Expected:** A clean result for a library installed exactly as documented.

**Actual:**

```
⚠️  Scoped deps in profile: @amazon-devices/react-native-qrcode-svg,
    @amazon-devices/eslint-plugin-kepler not a managed OS-version package
    (typo, or a package the SDK does not track)
💡 To fix: Remove unknown scoped packages or check OS version
```

The advice to "remove unknown scoped packages" is the opposite of correct here.
The subsequent build wired the library up properly, auto-adding
`/com.amazon.kepler.svg_3@ISVG_0` to `manifest.toml`.

**Workaround:** None needed — ignore the warning.

**Suggestion:** Include system-deployed autolinking libraries in the managed
package list, or soften the message when a package resolves to a real
`@amazon-devices` module that the build links successfully.

---

## 5. Screenshots are unavailable on the virtual device

**Severity: Medium for simulator-only workflows.**

**Task:** Capture a screenshot of the running app for visual verification.

**Steps:** Followed the `gwsi-tool-screenshooter` documentation.

**Expected:** A PNG.

**Actual:** The tool is documented as not supported on virtual devices. The
documented pre-check — run `vega device info` and inspect the `product` field
for `vvrp` — also could not be applied: on this virtual device, `product`,
`architecture`, and `kvdVersion` all returned empty strings. Only the
`VirtualDevice` label in `vega device list` identified the device type.

**Workaround:** Inspect the simulator window manually. This rules out automated
visual regression testing for developers without physical hardware.

**Suggestion:** Support frame capture on the virtual device — it is a QEMU
window, so the frame is available. Separately, populate `product` on virtual
devices so the documented detection step works.

---

## 6. Jest setup for the ported AsyncStorage is undocumented

**Severity: Low.**

**Task:** Run the template's Jest tests after adding
`@react-native-async-storage/async-storage` via the documented npm alias.

**Expected:** Tests pass, or the Vega page notes the extra setup.

**Actual:** Every test rendering the component failed — the library calls a
native module that does not exist under Jest. The Vega documentation page for
the library covers installation and usage but not test setup.

**Workaround:** The ported package does ship the upstream mock, so:

```js
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
```

**Suggestion:** Add a one-line "Testing" note to the Vega library page pointing
at the bundled mock. The `helloWorld` template ships a Jest config, so most
developers will hit this the first time they add the library.

---

## 7. `AudioPlayer` in `react-native-w3cmedia` is documented only for MSE pre-buffering

**Severity: Low — found while reading the package, not yet confirmed on a device.**

**Task:** Play an MP3 from an HTTPS URL and read `currentTime` to highlight the
spoken word, using `@amazon-devices/react-native-w3cmedia@2.3.2-rn-83`.

**Steps:** Read the package README and `dist/interface/AudioPlayer.d.ts` and
`dist/MediaPlayer.d.ts`.

**Expected:** A short example for the common case — set `src` to a URL, call
`play()`, listen for `ended`.

**Actual:** The README's only `AudioPlayer` example builds a `MediaSource`,
appends chunks by hand and then calls `play()`. Nothing states whether a plain
`src = "https://…/line.mp3"` is supported without MSE, whether `initialize()`
must be awaited before setting `src` (the type comment says "wait for the
promise to be fulfilled before calling any other function", the README example
does not wait), or which `AudioContentType` / `AudioUsageType` a speech prompt
should use. The HTMLMediaElement typing lists custom events
(`playbackstarted`, `audiofocuslost`) that the README never mentions.

**Workaround:** Wrote a small adapter (`src/services/audioPlayer.ts`) against
the type definitions, awaiting `initialize()` once and reusing the instance,
with a silent-highlight fallback if playback errors.

**Suggestion:** Add a ten-line "play a URL" example to the README for both
`Audio` and `AudioPlayer`, state the `initialize()` requirement next to the
constructor, and document the custom events and the audio type enums with a
sentence each on when to use them.

## 8. S3 answers "AccessDenied" for a key that simply does not exist

**Severity: Medium — cost an evening of wrong diagnosis.**

**Task:** Give each Lambda role the smallest S3 policy: `GetObject` and
`PutObject` on a few prefixes, no `ListBucket`.

**Steps:** `s3.get_object` on a key that has not been written yet (a session
code nobody has used, today's counter before the first document).

**Expected:** `NoSuchKey`, as the SDK documentation for `GetObject` describes.

**Actual:** `AccessDenied`, with a message blaming a missing
`s3:ListBucket` permission. The first-run path of both functions crashed
with a permissions error on a correct policy, which read exactly like the
genuine policy mistake that had been made minutes earlier (an older copy of
the file pasted onto the role), so the two were chased as one problem.

**Workaround:** Both functions treat a 403 from `GetObject` as "not there",
with a log line so a real policy error still shows. `AWS_SETUP.md` now has a
"check the paste" step that compares `Sid` names, because the console cannot
show which version of a file was pasted.

**Suggestion:** The behaviour is documented in an S3 troubleshooting page,
but not where a developer looks: the `GetObject` API reference and the error
message itself. The message could say "the object may not exist; without
s3:ListBucket, S3 cannot distinguish a missing key from a forbidden one".


## 9. The build silently rewrites `manifest.toml`

**Severity: Low — confusing, not blocking.**

**Task:** Build the app with `react-native build-vega` after adding
`@amazon-devices/react-native-w3cmedia`.

**Steps:** Commit `manifest.toml` with the `w3cmedia_2` module declared, build,
run `git status`.

**Expected:** Either the build fails validation because two transitive modules
are missing from the manifest, or it links them without touching my file.

**Actual:** The build appends `[[needs.module]]` entries for
`kepler_media_controls_1` and `keplermediadescriptor_1` to the committed
`manifest.toml`, so the working tree is dirty after every build and the diff
looks like an accidental edit. Nothing in the build output says it did this.

**Workaround:** Declare the two modules in the committed manifest (this
repository now does), so the rewrite is a no-op.

**Suggestion:** Print one line when autolinking adds a module to the manifest,
and point at the `kepler-compatibility.json` it took the id from. Better still,
offer a `--check` mode that fails instead of writing, for CI.

## 10. A public Lambda Function URL, configured exactly as documented, answers 403 to everyone

**Severity: High — the TV could not reach its backend at all.**

**Task:** Expose the capture function on a public URL (`AuthType NONE`) so a
phone and a TV can call it with no AWS credentials.

**Steps:** `CreateFunctionUrlConfig` with `AuthType NONE`; `AddPermission`
with action `lambda:InvokeFunctionUrl`, principal `*`, condition
`lambda:FunctionUrlAuthType = NONE` (the statement the documentation gives);
`curl` the URL from a laptop.

**Expected:** 200 from `/health`.

**Actual:** `403 AccessDeniedException` with the body "Forbidden. For
troubleshooting Function URL authorization issues, see urls-auth". The function
invokes fine through the API, `GetFunctionUrlConfig` says `NONE`, `GetPolicy`
shows the statement verbatim. The deploy user cannot call
`organizations:DescribeOrganization`, so whatever refuses the request (an
organisation-level control is the only thing left) cannot be seen from the
account that owns the function, and the error names no control.

**Workaround:** An API Gateway HTTP API in front of the function. The API
invokes the function as a service principal, so no public statement is needed
on the function, and the event format is the same (payload 2.0), so the code
did not change. `aws/deploy.py` now does this by default.

**Suggestion:** When a Function URL request is refused by something other
than the function's own policy, say so in the 403 body ("refused by an
organisation policy"), and let `GetFunctionUrlConfig` report an effective
public-access state. Hours went into re-checking a policy that was right.

---

## 11. The launcher crops the app icon to 16:9, and the manifest reference does not say so

**Severity: Medium — a visibly broken icon on the home screen, found by eye
three days before submission, not by any tool.**

**Task:** Ship an app icon.

**Steps:** Draw a 512 x 512 PNG, put it under `assets/image/`, declare
`icon = "@image/icon.png"`, build, install, open "Your apps".

**Expected:** The icon as drawn. The manifest reference
([0.24 Manifest [package] Section][m]) gives one requirement and one use:
"512x512, PNG ... used as the icon for the app within the Settings ->
Applications -> Managed Installed Applications screen."

**Actual:** Settings shows the square. The home screen does not: it renders
the same asset in a 16:9 tile and centre-crops it, so only `y 112..400` of
the 512 survives. The BigPrint mark's artwork spans `y 74..434`, so the top
of the screen frame and the whole stand were cut off. Nothing warns about
this: `vega exec vpt validate manifest.toml` reports 0 errors, the build
reports nothing, and the asset is exactly the documented size.

A second defect hid in the same region. The mark is an SVG with a rounded
rect on transparency; flattening it to RGB painted the four corners white.
In the launcher those corners are inside the cropped-away band, so the bug
was invisible there, but Settings draws the whole square, white notches and
all, on a dark list. The documentation's own advice for that screen is
"light coloured solid icons", which is the opposite of what a transparent
rounded corner becomes.

**Workaround:** Treat the centre `512 x 288` as a safe area and draw the
artwork inside it: scaled to 0.75 about the centre, the mark sits at
`y 121..391` with about 9 px to spare at each end. Make the ground full
bleed so there are no transparent corners to flatten. `tools/make_icon.py`
draws it and asserts the safe area, so the next redraw cannot regress.

The cost is real and worth stating: one asset serves a square and a 16:9
tile, so making it safe for both means it is smaller than it could be in
Settings. A separate launcher asset would avoid the compromise.

**Suggestion:** Three things, cheapest first. (1) Say in the manifest
reference that `icon` is used on the home screen as well as in Settings, and
give the safe area; one sentence and a diagram would have prevented this
entirely. (2) Have `vpt validate` warn when the icon has non-background
pixels outside the 16:9 safe band, or any transparent or near-white pixel in
the corners; both are mechanical checks. (3) Better still, accept an
optional second asset (`launcher_icon`) sized for the tile, so an icon does
not have to be a compromise between two aspect ratios.

[m]: https://developer.amazon.com/docs/vega/0.24/manifest-package
