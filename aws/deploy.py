#!/usr/bin/env python3
"""
Deploy or update the BigPrint TV backend. Safe to run repeatedly.

    cd backend && python -m venv .venv && . .venv/bin/activate && pip install boto3
    python ../aws/deploy.py                 # creates or updates everything, prints the endpoint
    python ../aws/deploy.py --write-config  # ...and writes it into src/config.ts
    python ../aws/deploy.py --status        # just show what exists

What it creates, all in us-east-1, all named bigprint-tv-*:
  - Lambda bigprint-tv-capture  (reserved concurrency 5 where the account allows)
  - API Gateway HTTP API bigprint-tv in front of it: the public endpoint. The
    function is invoked by the API Gateway service principal, so the function
    itself needs no public policy, and accounts whose guardrails refuse public
    Lambda function URLs (they answer 403 to everyone) still work. The stage
    is throttled as a first line of abuse control.
  - Lambda bigprint-tv-process  (S3-triggered, reserved concurrency 3 where the account allows)
  - S3 notification uploads/*.jpg -> process function
  - S3 lifecycle: uploads/, results/, sessions/, counters/, ratelimit/ deleted after 1 day

It needs the IAM user from AWS_SETUP.md with the BigPrintTvPhase2 policy, and
the two roles BigPrintTvCaptureRole and BigPrintTvProcessRole with the
policies in aws/capture-role-policy.json and aws/process-role-policy.json.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import time
import zipfile

import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
ACCOUNT = "236605144361"
BUCKET = "bigprint-tv-dev-ru22"
RUNTIME = "python3.12"

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "backend")

FUNCTIONS = {
    "bigprint-tv-capture": {
        "files": ["lambda_capture.py", "capture_page.html"],
        "handler": "lambda_capture.handler",
        "role": f"arn:aws:iam::{ACCOUNT}:role/BigPrintTvCaptureRole",
        "timeout": 15,
        "memory": 256,
        "concurrency": 5,
        "env": {"BUCKET": BUCKET},
    },
    "bigprint-tv-process": {
        "files": ["lambda_process.py", "pipeline.py", "speech.py"],
        "handler": "lambda_process.handler",
        "role": f"arn:aws:iam::{ACCOUNT}:role/BigPrintTvProcessRole",
        "timeout": 120,
        # Most of a read is spent waiting on Textract, Bedrock and Polly, so
        # more memory would cost more without making it much faster.
        "memory": 1024,
        "concurrency": 3,
        "env": {"BUCKET": BUCKET, "DAILY_CAP": "200", "REWRITE_WITH_IMAGE": "0"},
    },
}

lam = boto3.client("lambda", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
agw = boto3.client("apigatewayv2", region_name=REGION)

API_NAME = "bigprint-tv"
# Requests per second, sustained and burst, across all callers. Plenty for a
# TV polling every 3 s plus phones; far below anything that costs money.
API_RATE = 20.0
API_BURST = 50


def zip_bytes(files: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name in files:
            info = zipfile.ZipInfo(name)
            info.date_time = (2026, 1, 1, 0, 0, 0)  # reproducible
            info.external_attr = 0o644 << 16
            with open(os.path.join(BACKEND, name), "rb") as f:
                z.writestr(info, f.read())
    return buf.getvalue()


def wait_updated(name: str):
    for _ in range(60):
        cfg = lam.get_function_configuration(FunctionName=name)
        if cfg.get("LastUpdateStatus") in (None, "Successful") and cfg.get("State") in (None, "Active"):
            return
        time.sleep(2)
    raise RuntimeError(f"{name} did not become ready")


def ensure_function(name: str, spec: dict) -> str:
    code = zip_bytes(spec["files"])
    try:
        lam.get_function(FunctionName=name)
        exists = True
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
        exists = False

    if not exists:
        print(f"creating {name}")
        lam.create_function(
            FunctionName=name, Runtime=RUNTIME, Role=spec["role"], Handler=spec["handler"],
            Code={"ZipFile": code}, Timeout=spec["timeout"], MemorySize=spec["memory"],
            Environment={"Variables": spec["env"]}, Architectures=["arm64"],
            Description="BigPrint TV", Publish=False,
        )
    else:
        print(f"updating {name}")
        wait_updated(name)
        lam.update_function_configuration(
            FunctionName=name, Role=spec["role"], Handler=spec["handler"], Runtime=RUNTIME,
            Timeout=spec["timeout"], MemorySize=spec["memory"], Environment={"Variables": spec["env"]},
        )
        wait_updated(name)
        lam.update_function_code(FunctionName=name, ZipFile=code)
    wait_updated(name)
    try:
        lam.put_function_concurrency(FunctionName=name, ReservedConcurrentExecutions=spec["concurrency"])
    except ClientError as e:
        # New accounts have a 10-concurrency limit and may not reserve any of it.
        # The account limit then acts as the cap; the daily cap still protects the bill.
        if "UnreservedConcurrentExecution" not in str(e):
            raise
        print(f"  (could not reserve concurrency for {name}: account limit too low; skipping)")
    return lam.get_function_configuration(FunctionName=name)["FunctionArn"]


def ensure_api(capture_arn: str) -> str:
    """An HTTP API with one $default route to the capture function.

    Quick-create wires the route, the AWS_PROXY integration (payload format
    2.0, the same event shape as a function URL) and an auto-deployed $default
    stage in one call, so the Lambda code does not change.
    """
    existing = [a for a in agw.get_apis()["Items"] if a["Name"] == API_NAME]
    if existing:
        api = existing[0]
    else:
        api = agw.create_api(Name=API_NAME, ProtocolType="HTTP", Target=capture_arn,
                             Description="BigPrint TV capture endpoint")
    api_id = api["ApiId"]
    agw.update_stage(ApiId=api_id, StageName="$default", AutoDeploy=True,
                     DefaultRouteSettings={"ThrottlingRateLimit": API_RATE, "ThrottlingBurstLimit": API_BURST})
    try:
        lam.add_permission(
            FunctionName="bigprint-tv-capture", StatementId="api-gateway", Action="lambda:InvokeFunction",
            Principal="apigateway.amazonaws.com", SourceArn=f"arn:aws:execute-api:{REGION}:{ACCOUNT}:{api_id}/*",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceConflictException":
            raise
    return api["ApiEndpoint"]


def ensure_url(name: str) -> str:
    """The older public Function URL. Kept behind --function-url for accounts
    that allow it; the API is the default because some do not."""
    try:
        url = lam.get_function_url_config(FunctionName=name)["FunctionUrl"]
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
        url = lam.create_function_url_config(FunctionName=name, AuthType="NONE")["FunctionUrl"]
    try:
        lam.add_permission(
            FunctionName=name, StatementId="public-url", Action="lambda:InvokeFunctionUrl",
            Principal="*", FunctionUrlAuthType="NONE",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceConflictException":
            raise
    return url


def remove_url(name: str):
    """Drop the Function URL and its public statement once the API is live, so
    there is one front door and no dangling public policy."""
    for call in (lambda: lam.delete_function_url_config(FunctionName=name),
                 lambda: lam.remove_permission(FunctionName=name, StatementId="public-url")):
        try:
            call()
        except ClientError as e:
            if e.response["Error"]["Code"] != "ResourceNotFoundException":
                print(f"  (could not remove the old function URL piece: {e.response['Error']['Code']})")


def check_endpoint(url: str) -> bool:
    """Only an anonymous request proves the endpoint is public, so make one."""
    import urllib.error
    import urllib.request
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=10) as r:
            print(f"  anonymous GET /health -> {r.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"  anonymous GET /health -> {e.code} {e.read(120)!r}")
        if e.code == 403:
            print("  403 for an anonymous caller means something in the account refuses public\n"
                  "  endpoints. See AWS_SETUP.md, 'The endpoint answers 403 to everyone'.")
        return False
    except Exception as e:  # noqa: BLE001 - a diagnostic, not a control path
        print(f"  anonymous GET /health failed: {e}")
        return False


def write_config(url: str):
    path = os.path.join(HERE, "..", "src", "config.ts")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    new, n = re.subn(r"export const CAPTURE_BASE_URL =\n  '[^']*';", f"export const CAPTURE_BASE_URL =\n  '{url}';", text)
    if n != 1:
        print("  could not find CAPTURE_BASE_URL in src/config.ts; set it by hand")
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)
    print("  wrote src/config.ts; rebuild the app")


def ensure_no_retries(name: str):
    """A timed-out read must not be re-run twice more at full price."""
    try:
        lam.put_function_event_invoke_config(FunctionName=name, MaximumRetryAttempts=0)
    except ClientError as e:
        print(f"  (could not set retry policy for {name}: {e.response['Error']['Code']}; skipping)")


def ensure_s3_trigger(process_arn: str):
    try:
        lam.add_permission(
            FunctionName="bigprint-tv-process", StatementId="s3-uploads", Action="lambda:InvokeFunction",
            Principal="s3.amazonaws.com", SourceArn=f"arn:aws:s3:::{BUCKET}", SourceAccount=ACCOUNT,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceConflictException":
            raise
    s3.put_bucket_notification_configuration(
        Bucket=BUCKET,
        NotificationConfiguration={"LambdaFunctionConfigurations": [{
            "Id": "bigprint-uploads",
            "LambdaFunctionArn": process_arn,
            "Events": ["s3:ObjectCreated:*"],
            "Filter": {"Key": {"FilterRules": [
                {"Name": "prefix", "Value": "uploads/"},
                {"Name": "suffix", "Value": ".jpg"},
            ]}},
        }, {
            # Someone pressed Listen: the voice is made only on request.
            "Id": "bigprint-voice",
            "LambdaFunctionArn": process_arn,
            "Events": ["s3:ObjectCreated:*"],
            "Filter": {"Key": {"FilterRules": [
                {"Name": "prefix", "Value": "voice/"},
                {"Name": "suffix", "Value": ".json"},
            ]}},
        }]},
    )


def ensure_lifecycle():
    s3.put_bucket_lifecycle_configuration(
        Bucket=BUCKET,
        LifecycleConfiguration={"Rules": [
            {"ID": f"expire-{p}", "Status": "Enabled", "Filter": {"Prefix": f"{p}/"},
             "Expiration": {"Days": 1},
             "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}}
            for p in ("uploads", "voice", "results", "sessions", "counters", "ratelimit")
        ]},
    )


def status():
    for name in FUNCTIONS:
        try:
            cfg = lam.get_function_configuration(FunctionName=name)
            print(f"{name}: {cfg['State']} {cfg['Runtime']} {cfg['MemorySize']}MB "
                  f"updated {cfg['LastModified']}")
        except ClientError:
            print(f"{name}: not deployed")
    apis = [a for a in agw.get_apis()["Items"] if a["Name"] == API_NAME]
    print("endpoint:", apis[0]["ApiEndpoint"] if apis else "none")
    try:
        print("old function URL:", lam.get_function_url_config(FunctionName="bigprint-tv-capture")["FunctionUrl"])
    except ClientError:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--write-config", action="store_true", help="put the endpoint into src/config.ts")
    ap.add_argument("--function-url", action="store_true",
                    help="use a public Lambda Function URL instead of the API (not every account allows one)")
    args = ap.parse_args()
    if args.status:
        status()
        return
    capture_arn = ensure_function("bigprint-tv-capture", FUNCTIONS["bigprint-tv-capture"])
    process_arn = ensure_function("bigprint-tv-process", FUNCTIONS["bigprint-tv-process"])
    if args.function_url:
        url = ensure_url("bigprint-tv-capture")
    else:
        url = ensure_api(capture_arn)
        remove_url("bigprint-tv-capture")
    ensure_no_retries("bigprint-tv-process")
    ensure_s3_trigger(process_arn)
    ensure_lifecycle()
    print()
    print("Endpoint:", url)
    reachable = check_endpoint(url)
    if not reachable:
        print("The TV will show 'The reading service refused this TV' until this is fixed.")
    if args.write_config:
        write_config(url)
    else:
        print("Put it in src/config.ts as CAPTURE_BASE_URL (without the trailing slash), or rerun with --write-config.")
    print(json.dumps({"capture": capture_arn, "process": process_arn}, indent=1))


if __name__ == "__main__":
    sys.exit(main())
