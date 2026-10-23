#!/usr/bin/env bash
# Rebuild JUDGES_GUIDE.pdf from tools/judges_guide.html.
# The screenshots it references live in video/stills/, which is not in git
# (recordings, not source), so this only rebuilds on a machine that has them.
set -euo pipefail
cd "$(dirname "$0")/.."
google-chrome --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=JUDGES_GUIDE.pdf "file://$PWD/tools/judges_guide.html"
echo "JUDGES_GUIDE.pdf rebuilt"
