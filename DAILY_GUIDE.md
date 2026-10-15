# BigPrint TV — Daily Start Guide

You need **2 terminal windows**. Terminal A runs Metro (it stays busy).
Terminal B is where you type everything else.

The `vega` command is already loaded in your terminals automatically.
If you ever see `vega: command not found`, run: `source ~/vega/env`

---

## Starting up (do this each time you sit down)

### Terminal B — steps 1 to 5

**1. Go to the project folder**
```bash
cd ~/Desktop/vega-os-and-fire-tv-env
```

**2. Start the TV simulator** (a window will open — that's your fake Fire TV)
```bash
vega virtual-device start
```

**3. Check the TV is connected** (should say `VirtualDevice : tv - x86_64 ...`)
```bash
vega device list
```

**4. Connect the TV to your code** (lets live-reload work)
```bash
vega device start-port-forwarding --port 8081 --forward false
```

**5. Put the app on the TV and open it**
```bash
vega run-app $(find build -name '*_x86_64.vpkg' -path '*Debug*' | head -1) com.bigprint.tv.main
```

### Terminal A — step 6

**6. Start Metro** (this terminal stays busy — leave it open)
```bash
cd ~/Desktop/vega-os-and-fire-tv-env && npm start
```

**7. Open the debugger** — just press the `j` key in Terminal A.
This is where your `console.log` messages appear.

Now edit any file in `src/` and save — the TV updates instantly.

---

## Shutting down (when you finish for the day)

**In Terminal A:** press `Ctrl + C` to stop Metro.

**In Terminal B:**
```bash
vega virtual-device stop
```

---

## Only when you need them

**Rebuild the app** — required after you change `manifest.toml` or `package.json`
```bash
npm run build:debug
```
Then repeat step 5 to put the new version on the TV.

**Restart the app** without rebuilding — if it freezes or won't reload
```bash
vega device terminate-app --dir . && vega device launch-app --dir .
```

**Run the tests**
```bash
npm test
```

**Check for mistakes in your code**
```bash
npm run lint
```

**Check the app setup is valid** — run before submitting to Amazon
```bash
vega project doctor
```

---

## If something breaks

**App won't update when you save a file**
Restart the app (see "Restart the app" above).

**`No devices found`**
The simulator isn't running. Go back to step 2.

**Live reload stopped working after restarting the simulator**
Port forwarding is lost every time the TV restarts. Redo step 4.

**Metro says port 8081 is already in use**
```bash
pkill -f metro
```
Then start Metro again.

**Debugger won't open with `j`**
Open it in Chrome manually:
```bash
google-chrome --new-window "http://localhost:8081$(curl -s http://localhost:8081/json/list | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['devtoolsFrontendUrl'])")"
```

---

## Two things to never forget

1. **Never put spaces in the folder path.** The Vega build tool breaks on them.
   That's why this folder is `vega-os-and-fire-tv-env` and not `vega os and fire tv env`.
2. **Your `console.log` does not show in Metro anymore.** It only shows in the
   debugger (step 7). This is normal for React Native 0.83.

---

## The backend (only when you change `backend/` or `aws/`)

Backend code runs on AWS, not on the TV, so it has its own commands. One-off
setup is in `AWS_SETUP.md`.

**Run the backend tests** (no AWS needed)
```bash
npm run test:backend
```

**Deploy or update the backend** (about a minute)
```bash
cd backend && . .venv/bin/activate && python ../aws/deploy.py
```
It prints the capture URL. If it changed, paste it into `src/config.ts`.

**Check what is deployed**
```bash
python aws/deploy.py --status
```

**Run the accuracy report over every photo in the bucket** (costs about 8p a photo)
```bash
cd backend && python run_batch.py results.json
```

**Watch the processing function's log** when a photo "never arrives" on the TV:
CloudWatch → Log groups → `/aws/lambda/bigprint-tv-process`.
