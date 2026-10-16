# Friction Log — Vega OS / Fire TV development

Recorded while building BigPrint TV (Vega OS, React Native 0.83, Vega SDK 0.24.12112,
Vega CLI 1.4.4) on Linux Mint 22 (Ubuntu 24.04 base).

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
