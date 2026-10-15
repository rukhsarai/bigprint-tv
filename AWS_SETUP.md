# AWS Setup — BigPrint TV

## Current values (verified 11 Oct 2026)

| | |
|---|---|
| Region | `us-east-1` |
| S3 bucket | `bigprint-tv-dev-ru22` |
| IAM user | `bigprint-tv-dev` |
| Policy | `BigPrintTvPhase1` |
| Credentials | `~/.aws/credentials`, `[default]` profile |

**Status:** Textract ✅ · Polly ✅ · S3 ✅ · Bedrock Nova ❌ (account-level
restriction, all quotas applied as 0 — not a permissions problem)

---

Do these in order. Should take about 20 minutes.

Everything stays in **one region: `us-east-1`**. Mixing regions causes confusing
failures later.

---

## Before you start: choose a bucket name

S3 bucket names are shared across every AWS customer in the world, so yours must
be unique. Pick something nobody else will have:

```
bigprint-tv-dev-8f2k
```

Change `8f2k` to any four random characters. **Write this name down — you will
type it three times.**

---

## Step 1 — Create the S3 bucket

This is where photos get uploaded and audio comes back.

1. Go to the **S3** console: https://s3.console.aws.amazon.com/
2. Click **Create bucket**
3. **Bucket name:** the name you chose above
4. **Region:** US East (N. Virginia) `us-east-1`
5. **Block Public Access:** leave **all four boxes ticked** (this is the default)
6. Leave everything else alone
7. Click **Create bucket**

✅ Done when the bucket appears in your list.

---

## Step 2 — Nova model access: nothing to do

**Skip this step.** Checked in the console on 11 Oct 2026: the Model access page
has been retired. AWS now says serverless foundation models are "automatically
enabled across all AWS commercial regions when first invoked", so Nova works
without any manual activation.

Two things still apply:

- **Anthropic models** may ask first-time users for use-case details. Not
  relevant here — we use Nova.
- Access is still governed by **IAM** (Step 3) and by Service Control Policies,
  so the policy below is what actually grants it.

✅ Nothing to do. Go to Step 3.

---

## Step 3 — Create the permission policy

This says exactly what the app is allowed to do. Nothing more.

1. Go to **IAM**: https://console.aws.amazon.com/iam/
2. Left menu → **Policies** → **Create policy**
3. Click the **JSON** tab
4. Delete everything in the box
5. Open `aws/iam-policy-phase1.json` from this project and copy all of it
6. Paste it into the box
7. **Find both places that say `REPLACE-WITH-YOUR-BUCKET`** and replace each
   with your bucket name. There are two — one has `/*` after it, keep that `/*`.
8. Click **Next**
9. **Policy name:** `BigPrintTvPhase1`
10. Click **Create policy**

✅ Done when the policy appears in your policy list.

---

## Step 4 — Create the user

1. IAM → left menu → **Users** → **Create user**
2. **User name:** `bigprint-tv-dev`
3. **Do NOT** tick "Provide user access to the AWS Management Console" — this
   user is for code only, it never needs to log in
4. Click **Next**
5. Choose **Attach policies directly**
6. **Leave "Set permissions boundary" unticked** — it is optional and causes
   confusing failures if set wrong
7. In the search box type `BigPrintTvPhase1`
8. Tick **only that one policy**
9. Click **Next**, then **Create user**

✅ Done when the user appears in your user list.

---

## Step 5 — Create the access key

1. Click the user **bigprint-tv-dev**
2. Open the **Security credentials** tab
3. Scroll to **Access keys** → **Create access key**
4. Choose **Application running outside AWS**
5. Click **Next**, then **Create access key**
6. You now see an **Access key** and a **Secret access key**

**Keep this page open.** The secret is shown once and never again. If you lose
it, delete the key and make a new one — no harm done.

⚠️ **Do not paste these into the chat.** The next step puts them on your machine
where they belong.

---

## Step 6 — Put the keys on your computer

Install the AWS command line tool if you do not have it:

```bash
sudo apt install -y awscli
```

Then:

```bash
aws configure
```

It asks four questions:

| It asks | You type |
|---|---|
| AWS Access Key ID | paste the access key |
| AWS Secret Access Key | paste the secret key |
| Default region name | `us-east-1` |
| Default output format | `json` |

Check it worked:

```bash
aws sts get-caller-identity
```

✅ Done when it prints your account number and `user/bigprint-tv-dev`.

If it says "command not found" or "Unable to locate credentials", the keys did
not save — run `aws configure` again.

---

## Step 7 — Set a spending alarm

Textract and Bedrock charge per request. A bug in a loop is the real risk, so
cap it before the first call.

1. Go to **Billing and Cost Management**:
   https://console.aws.amazon.com/costmanagement/
2. Left menu → **Budgets** → **Create budget**
3. Choose **Use a template (simplified)** → **Monthly cost budget**
4. **Budget amount:** `20`
5. **Email:** your email address
6. Click **Create budget**

✅ Done when the budget appears in the list.

---

## Step 8 — Apply hackathon credits, if you have them

If the hackathon gave you AWS credits, apply them now so the test run costs
nothing:

1. **Billing and Cost Management** → left menu → **Credits**
2. Click **Redeem credit** and enter the code

---

## Step 9 — Tell me

Say "aws is set up" and I will test every permission with one small call each,
before we spend anything real. If something is wrong we find it now rather than
halfway through the accuracy test.

---

## What I will need from you next

**10 to 20 photos of real letters and bills.**

Make them realistic, not perfect:

- Some taken at an angle
- Some creased or folded
- Some in poor light
- A mix: utility bill, bank letter, hospital or GP letter, handwritten card
- At least one that is genuinely hard to read

Put them in a folder and tell me the path. Perfect photos would give a flattering
result that falls apart on real users.

---

## If something goes wrong

| Problem | Cause | Fix |
|---|---|---|
| `AccessDeniedException` from Bedrock | IAM policy wrong, or model id not matching `amazon.nova-*` | Check Step 3. Note the old "enable model access" fix no longer applies — that page is retired |
| `Unable to locate credentials` | `aws configure` not run, or run as a different user | Re-run Step 6 |
| `InvalidAccessKeyId` | Key typed wrong or truncated | Delete the key, create a new one, re-run Step 6 |
| `NoSuchBucket` | Bucket name in the policy does not match the real bucket | Check all three places the name appears |
| `AccessDenied` on S3 | Policy has the wrong bucket name, or missing the `/*` line | Edit the policy, check both Resource lines |
| Bedrock model not listed | Wrong region | Switch the console to `us-east-1` |

---

## What this user cannot do

Worth knowing, so you can relax about the keys existing:

- Cannot create or change any IAM user, role or permission
- Cannot see or change billing
- Cannot touch any other S3 bucket
- Cannot create servers, databases or any other resource
- Can only call Textract, Nova, Polly, and the one bucket

The worst case is an unexpected Textract bill, and Step 7 caps that.
