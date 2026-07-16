"""
run_distributed_monte_carlo.py

Client-side driver for the Distributed-Parallel-Processing orchestrator.

Why this exists: the orchestrator only ever assigns ONE job to ONE idle
worker per /submit-job call (see dispatcher.py: shard_index is hardcoded
to 0, and monitor.py never retries a job stuck in "queued"). There's no
built-in fan-out. This script does the fan-out at the client level:

  1. Ask the orchestrator how many workers are online and idle right now.
  2. Split total_simulations into that many shards, each with a distinct
     RNG seed (shards MUST use different seeds or you're not adding
     independent samples, just repeating the same ones).
  3. Submit one job per idle worker, using monte_carlo_shard.py as the
     script payload and a small per-shard JSON as the data payload.
  4. Poll /jobs until that round's jobs are done.
  5. If shards remain (more shards than workers), repeat with the next
     idle batch.
  6. Parse each job's "RESULT_JSON:" line out of job.result and combine
     the sufficient statistics into a final mean, standard error, and
     probability estimate.

Usage:
    python run_distributed_monte_carlo.py

Edit the CONFIG block below to point at your orchestrator and set your
simulation parameters.
"""

import io
import json
import time
import math
import requests
import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
grpc_path = os.path.abspath(os.path.join(current_dir, "..", "grpc_layer"))
sys.path.append(grpc_path)

import grpc_server

# ---------------------------------------------------------------------------
# CONFIG - edit these for your setup
# ---------------------------------------------------------------------------
ORCHESTRATOR_URL = "192.168.1.93"#find_orchestrator()  # <-- your orchestrator's IP
USER_ID = "quant-user-1"
JOB_NAME_PREFIX = "gbm_mc"

TOTAL_SIMULATIONS = 20_000_000   # across ALL shards combined
S0 = 100.0                       # starting asset price
MU = 0.05                        # annualized drift
SIGMA = 0.20                     # annualized volatility
T = 1.0                          # horizon in years
STRIKE = 100.0                   # "success" threshold, e.g. option strike
BASE_SEED = 1000                 # each shard gets BASE_SEED + shard_index

POLL_INTERVAL_SEC = 3
POLL_TIMEOUT_SEC = 600
SCRIPT_PATH = "monte_carlo_shard.py"
# ---------------------------------------------------------------------------


def get_idle_workers():
    resp = requests.get(f"{ORCHESTRATOR_URL}/workers", timeout=10)
    resp.raise_for_status()
    workers = resp.json()
    return [
        wid for wid, w in workers.items()
        if w.get("status") == "online" and w.get("current_job") is None
    ]


def submit_shard(shard_index, num_simulations, seed):
    config = {
        "num_simulations": num_simulations,
        "start_value": S0,
        "mu": MU,
        "volatility": SIGMA,
        "T": T,
        "strike": STRIKE,
        "seed": seed,
    }

    with open(SCRIPT_PATH, "rb") as f:
        script_bytes = f.read()

    data_bytes = json.dumps(config).encode("utf-8")

    files = {
        "script_file": ("monte_carlo_shard.py", io.BytesIO(script_bytes), "text/x-python"),
        "data_file": ("shard_config.json", io.BytesIO(data_bytes), "application/json"),
    }
    form = {
        "user_id": USER_ID,
        "job_name": f"{JOB_NAME_PREFIX}_shard{shard_index}",
    }

    resp = requests.post(f"{ORCHESTRATOR_URL}/submit-job", data=form, files=files, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    print(f"  shard {shard_index}: submitted -> job_id={body['job_id']} "
          f"status={body['status']} worker={body.get('assigned_worker')}")
    return body["job_id"]


def poll_jobs(job_ids):
    """Block until every job_id in job_ids is completed or failed."""
    remaining = set(job_ids)
    results = {}
    deadline = time.time() + POLL_TIMEOUT_SEC

    while remaining and time.time() < deadline:
        resp = requests.get(f"{ORCHESTRATOR_URL}/jobs", timeout=10)
        resp.raise_for_status()
        jobs = {j["job_id"]: j for j in resp.json()}

        for jid in list(remaining):
            job = jobs.get(jid)
            if not job:
                continue
            if job["status"] == "completed":
                results[jid] = ("completed", job.get("result"))
                remaining.discard(jid)
            elif job["status"] == "failed":
                results[jid] = ("failed", job.get("error"))
                remaining.discard(jid)

        if remaining:
            time.sleep(POLL_INTERVAL_SEC)

    for jid in remaining:
        results[jid] = ("timeout", None)

    return results


def parse_result_json(stdout_text):
    if not stdout_text:
        return None
    for line in stdout_text.splitlines():
        if line.startswith("RESULT_JSON:"):
            return json.loads(line[len("RESULT_JSON:"):].strip())
    return None


def run():
    shards_remaining = []
    # Pre-plan shard sizes once we know worker count; but worker count
    # can change round to round, so we plan the FIRST round's split off
    # current idle workers and keep remaining sims in a pool.
    idle = get_idle_workers()
    if not idle:
        raise RuntimeError("No idle workers registered with the orchestrator right now.")

    print(f"Found {len(idle)} idle worker(s) online.")

    # Decide shard count: don't make more shards than makes sense, but
    # also don't starve workers -- one shard per idle worker per round,
    # sized so total adds up to TOTAL_SIMULATIONS.
    num_shards = max(len(idle), 1)
    base = TOTAL_SIMULATIONS // num_shards
    remainder = TOTAL_SIMULATIONS % num_shards
    shard_sizes = [base + (1 if i < remainder else 0) for i in range(num_shards)]
    shard_sizes = [s for s in shard_sizes if s > 0]

    print(f"Splitting {TOTAL_SIMULATIONS:,} simulations into {len(shard_sizes)} shard(s): "
          f"{shard_sizes}")

    all_partial_results = []
    shard_index = 0
    pending_sizes = list(shard_sizes)

    while pending_sizes:
        idle = get_idle_workers()
        if not idle:
            print("No idle workers right now, waiting...")
            time.sleep(POLL_INTERVAL_SEC)
            continue

        batch = pending_sizes[:len(idle)]
        pending_sizes = pending_sizes[len(idle):]

        print(f"\nSubmitting a round of {len(batch)} shard(s)...")
        job_ids = []
        for size in batch:
            seed = BASE_SEED + shard_index
            job_id = submit_shard(shard_index, size, seed)
            job_ids.append(job_id)
            shard_index += 1

        print("Polling for completion...")
        results = poll_jobs(job_ids)

        for jid, (status, payload) in results.items():
            if status == "completed":
                parsed = parse_result_json(payload)
                if parsed:
                    all_partial_results.append(parsed)
                    print(f"  {jid}: OK - {parsed['count']:,} sims, "
                          f"partial mean={parsed['partial_sum'] / parsed['count']:.4f}")
                else:
                    print(f"  {jid}: completed but couldn't parse RESULT_JSON. Raw: {payload!r}")
            else:
                print(f"  {jid}: {status.upper()} - {payload}")

    aggregate(all_partial_results)


def aggregate(partials):
    if not partials:
        print("\nNo successful shards -> nothing to aggregate.")
        return

    total_count = sum(p["count"] for p in partials)
    total_sum = sum(p["partial_sum"] for p in partials)
    total_sum_sq = sum(p["partial_sum_sq"] for p in partials)
    total_success = sum(p["successful_trials"] for p in partials)
    strike = partials[0]["strike"]

    mean = total_sum / total_count
    variance = (total_sum_sq / total_count) - mean ** 2
    stderr = math.sqrt(max(variance, 0) / total_count)
    prob_above_strike = total_success / total_count

    print("\n" + "=" * 60)
    print("AGGREGATED MONTE CARLO RESULT")
    print("=" * 60)
    print(f"Shards combined:        {len(partials)}")
    print(f"Total simulations:      {total_count:,}")
    print(f"Estimated E[S_T]:       {mean:.4f}")
    print(f"Std error of estimate:  {stderr:.4f}")
    print(f"95% CI:                 [{mean - 1.96*stderr:.4f}, {mean + 1.96*stderr:.4f}]")
    print(f"P(S_T > {strike}):          {prob_above_strike:.4%}")


if __name__ == "__main__":
    run()