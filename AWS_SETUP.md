# AWS Setup — BigPrint TV

## Current values

| | |
|---|---|
| Region | `us-east-1` — everything stays here |
| S3 bucket | `bigprint-tv-dev-ru22` (Block Public Access ON) |
| IAM user | `bigprint-tv-dev` — policies `BigPrintTvPhase1` + `BigPrintTvPhase2` |
| Lambda roles | `BigPrintTvCaptureRole`, `BigPrintTvProcessRole` |
| Functions | `bigprint-tv-capture` (public URL), `bigprint-tv-process` (S3 trigger) |
| Credentials | `~/.aws/credentials`, `[default]` profile |

Everything the account can do is listed in the five JSON files under `aws/`.
No part of the system has more access than the file says.

---

## Part A — the IAM user (one-off, ~20 minutes)

Do these in order.

### A1. Create the bucket

1. S3 console → **Create bucket**
2. Name: `bigprint-tv-dev-ru22` (bucket names are global; pick your own and
   replace it in every `aws/*.json` file and in `aws/deploy.py`)
3. Region `us-east-1`, **leave all four Block Public Access boxes ticked**
4. Create

### A2. Nova model access: nothing to do

The Bedrock "Model access" page has been retired. Nova is enabled on first
use; access is governed by IAM only.

### A3. The user and its two policies

1. IAM → **Policies** → **Create policy** → JSON → paste `aws/iam-policy-phase1.json`
   (replace `REPLACE-WITH-YOUR-BUCKET`, twice) → name `BigPrintTvPhase1`
2. IAM → **Users** → **Create user** `bigprint-tv-dev`, no console access,
   attach `BigPrintTvPhase1` directly
3. Open the user → **Add permissions** → **Create inline policy** → JSON →
   paste `aws/iam-policy-phase2.json` → name `BigPrintTvPhase2`
4. **Security credentials** → **Create access key** → *Application running
   outside AWS* → copy both values once

```bash
python3 -m venv ~/.venv/aws && . ~/.venv/aws/bin/activate && pip install awscli boto3
aws configure        # paste the key, secret, us-east-1, json
aws sts get-caller-identity
```

What this user **cannot** do: create or change any IAM user, role or policy
beyond passing the two named roles to Lambda; touch any other bucket; create
servers or databases; see billing.

### A4. A spending alarm

Billing → **Budgets** → **Create budget** → monthly cost, `20` USD, your email.
The daily cap in the backend (500 documents, about $40) and reserved
concurrency keep a bug or an abuser well under this.

---

## Part B — the two Lambda roles (one-off, ~10 minutes)

Lambda functions run as a *role*, not as your user. Each role gets the
smallest policy that lets its function work. The user cannot create roles (that
would be a privilege-escalation path), so you do this in the console.

For each of the two roles:

1. IAM → **Roles** → **Create role** → *AWS service* → *Lambda* → Next →
   Next (tick nothing) → name it → **Create role**
2. Open the role → **Add permissions** → **Create inline policy** → JSON →
   paste the file → save

| Role name | Policy file | What it allows |
|---|---|---|
| `BigPrintTvCaptureRole` | `aws/capture-role-policy.json` | sessions, per-address limits, write photos and a status file, read results, own logs |
| `BigPrintTvProcessRole` | `aws/process-role-policy.json` | read photos and its own status file, Textract, Nova, Polly, write results, a daily counter, own logs |

The capture role deliberately cannot call Textract, Bedrock or Polly: it is the
only thing on the public internet.

**Check the paste.** Open the role → the policy → *JSON* and compare the `Sid`
names with the file. The capture role must list `Sessions`,
`PerAddressLimits`, `StorePhotosAndProcessingStatus`, `ReadResults`, `OwnLogs`;
the process role `ReadPhotos`, `WriteResults`, `ReadOwnStatus`,
`DailyCapCounter`, `ReadDocuments`, `NovaOnly`, `Speech`, `OwnLogs`. A missing
name means an older copy of the file was pasted; paste the current one over it.
Policies are versioned in this repository precisely so that this check is
possible.

---

## Part C — deploy (repeatable, ~1 minute)

```bash
cd backend && . .venv/bin/activate   # or any venv with boto3
python ../aws/deploy.py
```

It creates or updates both functions, the public URL, the S3 trigger and the
one-day lifecycle rules, then prints the capture URL. Put that in
`src/config.ts` as `CAPTURE_BASE_URL` and rebuild the app.

`python ../aws/deploy.py --status` shows what exists.

---

## If something goes wrong

| Problem | Cause | Fix |
|---|---|---|
| `AccessDeniedException` from Bedrock | model id not `amazon.nova-*`, or SCP | check `aws/process-role-policy.json`; the old "enable model access" page no longer exists |
| `ThrottlingException: Too many tokens per day` on a new account | account verification, not quota | wait; it clears itself. Do not file a quota increase |
| TV shows "cannot reach the internet" | `CAPTURE_BASE_URL` empty or wrong, or the function URL permission missing | `python ../aws/deploy.py --status`; `curl <url>/health` should return `{"ok": true}` |
| Phone says "This code is not in use" | the TV session expired (2 h) or the TV was restarted | go back to the pairing screen and scan again |
| Photo accepted but TV never changes | S3 trigger or process role problem | CloudWatch → `/aws/lambda/bigprint-tv-process`; `aws/deploy.py` re-applies the trigger |
| `Maximum policy size of 2048 bytes exceeded for user` | pasting a role policy onto the user | role policies go on the roles (Part B), not on the user |
| `POST /session` returns 500; log says `not authorized to perform: s3:PutObject` on `ratelimit/` | the capture role holds an older policy without `PerAddressLimits` | paste `aws/capture-role-policy.json` over it (see "Check the paste") |
| Log line `s3 get …: AccessDenied, treated as missing` | S3 answers 403, not 404, for a missing key when the caller cannot list the bucket; the functions treat that as "not there" | harmless on its own. If it appears for a key that exists, that role's policy is wrong |
| `NoSuchBucket` / `AccessDenied` on S3 | bucket name mismatch | the name appears in every `aws/*.json` file and in `aws/deploy.py` |
| Textract `UnsupportedDocumentException` | HEIC or WebP | the phone page converts to JPEG; `run_batch.py` skips other formats |
