#!/bin/bash
# Prove the deployed backend works, end to end, from any machine with curl
# and python3: pair like the TV, upload like the phone, poll like the TV,
# ask for the voice, fetch the audio. Takes about 20 seconds and costs
# roughly five cents of AWS. Run before recording a demo, after a deploy,
# or to show a reviewer the pipeline without a Fire TV.
#
#   backend/tools/round_trip.sh                 # uses a rendered sample bill
#   backend/tools/round_trip.sh photo.jpg       # uses your own JPEG
#   BASE_URL=https://... backend/tools/round_trip.sh
#
# The sample bill is drawn by make_sample_letter.py (needs Pillow). It is
# synthetic: no real person's post is ever sent anywhere by this script.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE_URL="${BASE_URL:-$(sed -n "s/^  '\(https:[^']*\)';/\1/p" "$HERE/../../src/config.ts" | head -1)}"
if [ -z "$BASE_URL" ]; then echo "No CAPTURE_BASE_URL in src/config.ts; set BASE_URL"; exit 1; fi
OUT="${TMPDIR:-/tmp}/bigprint-round-trip"
mkdir -p "$OUT"
PHOTO="${1:-}"
if [ -z "$PHOTO" ]; then
  PHOTO="$OUT/sample-bill.jpg"
  python3 "$HERE/make_sample_letter.py" "$PHOTO" || { echo "could not draw the sample (pip install Pillow), or pass a JPEG"; exit 1; }
fi
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }

echo "endpoint: $BASE_URL"
T0=$(date +%s)
S=$(curl -sS -m 20 -X POST "$BASE_URL/session") || { echo "session failed"; exit 1; }
CODE=$(echo "$S" | json "['code']"); KEY=$(echo "$S" | json "['secret']")
Q="c=$CODE&k=$KEY"
echo "1. session: code $CODE (the TV shows this; the QR carries the secret)"
echo "2. phone page: HTTP $(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$BASE_URL/?$Q")"
U=$(curl -sS -m 60 -X POST -H "Content-Type: image/jpeg" --data-binary @"$PHOTO" "$BASE_URL/upload?$Q")
echo "3. upload: $U"
T1=$(date +%s)
for _ in $(seq 1 150); do
  R=$(curl -sS -m 20 "$BASE_URL/result?$Q&since=")
  ST=$(echo "$R" | json ".get('state')")
  [ "$ST" = "done" ] || [ "$ST" = "error" ] && break
  sleep 1
done
echo "4. result: state=$ST after $(( $(date +%s) - T1 )) s"
echo "$R" | python3 -c "
import sys, json
r = json.load(sys.stdin); d = r.get('document') or {}
if r.get('message'): print('   message:', r['message'])
print('   kind:', d.get('kind'), '| sender:', d.get('sender'), '| warning:', d.get('lowConfidence'))
for f in d.get('keyFacts', []): print('   key fact:', f['label'], '=', f['value'], f'({f.get(\"confidence\")}%)')
for l in d.get('lines', []): print('   |', l)
print('   main points:', len(d.get('summary') or []), '| exact lines:', len(d.get('exact') or []))
"
DOC=$(echo "$R" | json ".get('document',{}).get('id','')" 2>/dev/null)
[ -z "$DOC" ] && { echo "no document; stopping"; exit 1; }
T2=$(date +%s)
curl -sS -m 20 -o /dev/null -X POST "$BASE_URL/voice?$Q&d=$DOC"
for _ in $(seq 1 90); do
  V=$(curl -sS -m 20 "$BASE_URL/voice?$Q&d=$DOC")
  A=$(echo "$V" | json ".get('audio')")
  [ "$A" = "ready" ] || [ "$A" = "none" ] && break
  sleep 1
done
echo "5. voice: $V after $(( $(date +%s) - T2 )) s"
if [ "$A" = "ready" ]; then
  curl -sS -m 30 -o "$OUT/story-0.mp3" -w "6. audio: HTTP %{http_code}, %{size_download} bytes -> $OUT/story-0.mp3\n" "$BASE_URL/audio?$Q&d=$DOC&n=0"
fi
echo "done in $(( $(date +%s) - T0 )) s"
