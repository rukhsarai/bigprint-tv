#!/usr/bin/env python3
"""
Deploy or update the BigPrint TV backend. Safe to run repeatedly.

    cd backend && python -m venv .venv && . .venv/bin/activate && pip install boto3
    python ../aws/deploy.py            # creates or updates everything, prints the URL
    python ../aws/deploy.py --status   # just show what exists

What it creates, all in us-east-1, all named bigprint-tv-*:
  - Lambda bigprint-tv-capture  (public Function URL, reserved concurrency 5)
  - Lambda bigprint-tv-process  (S3-triggered, reserved concurrency 3)
  - S3 notification uploads/*.jpg -> process function
  - S3 lifecycle: uploads/, results/, sessions/, counters/ deleted after 1 day

It needs the IAM user from AWS_SETUP.md with the BigPrintTvPhase2 policy, and
the two roles BigPrintTvCaptureRole and BigPrintTvProcessRole with the
policies in aws/capture-role-policy.json and aws/process-role-policy.json.
"""

from __future__ import annotations

import argparse
import io
import json
import os
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
        "memory": 1024,
        "concurrency": 3,
        "env": {"BUCKET": BUCKET, "DAILY_CAP": "500", "REWRITE_WITH_IMAGE": "0"},
    },
}

lam = boto3.client("lambda", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)


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
    lam.put_function_concurrency(FunctionName=name, ReservedConcurrentExecutions=spec["concurrency"])
    return lam.get_function_configuration(FunctionName=name)["FunctionArn"]


def ensure_url(name: str) -> str:
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
            "Events": ["s3:ObjectCreated:Put"],
            "Filter": {"Key": {"FilterRules": [
                {"Name": "prefix", "Value": "uploads/"},
                {"Name": "suffix", "Value": ".jpg"},
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
            for p in ("uploads", "results", "sessions", "counters")
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
    try:
        print("capture URL:", lam.get_function_url_config(FunctionName="bigprint-tv-capture")["FunctionUrl"])
    except ClientError:
        print("capture URL: none")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    args = ap.parse_args()
    if args.status:
        status()
        return
    capture_arn = ensure_function("bigprint-tv-capture", FUNCTIONS["bigprint-tv-capture"])
    process_arn = ensure_function("bigprint-tv-process", FUNCTIONS["bigprint-tv-process"])
    url = ensure_url("bigprint-tv-capture")
    ensure_s3_trigger(process_arn)
    ensure_lifecycle()
    print()
    print("Capture URL:", url)
    print("Put it in src/config.ts as CAPTURE_BASE_URL (without the trailing slash).")
    print(json.dumps({"capture": capture_arn, "process": process_arn}, indent=1))


if __name__ == "__main__":
    sys.exit(main())
