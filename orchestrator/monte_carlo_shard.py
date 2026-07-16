"""
monte_carlo_shard.py

This is the script that gets uploaded to the orchestrator via /submit-job
and executed on a worker by grpc_server.py:

    subprocess.run([sys.executable, script_file, data_file, weight_file], ...)

So it MUST accept exactly two positional args:
    argv[1] -> data_file  (JSON config for this shard)
    argv[2] -> weights_file (unused here, but grpc_server always passes one --
               it'll just be an empty file for non-ML jobs)

It prints one line starting with "RESULT_JSON:" containing the shard's
partial results. The orchestrator captures all of stdout as job.result,
so the client-side driver just has to find that line and parse it.

Simulation model: Geometric Brownian Motion (GBM) asset price at time T.

    S_T = S0 * exp[(mu - 0.5 * sigma^2) * T + sigma * sqrt(T) * Z],   Z ~ N(0,1)

This replaces the placeholder formula in worker/simulation_handler.py
(start_value * exp(volatility * shocks), which has no drift term or time
scaling) with the standard closed-form GBM terminal price.
"""

import sys
import json
import numpy as np


def run_shard(config: dict) -> dict:
    num_simulations = int(config["num_simulations"])
    S0 = float(config["start_value"])
    mu = float(config.get("mu", 0.0))          # drift, annualized
    sigma = float(config["volatility"])          # annualized volatility
    T = float(config.get("T", 1.0))              # time horizon, years
    seed = int(config["seed"])                   # MUST differ per shard
    strike = float(config.get("strike", S0))      # threshold for "success"

    # Bound memory: never materialize the full num_simulations array at
    # once. Instead walk through it in fixed-size batches and only keep
    # running scalar accumulators. This is what lets a shard scale from
    # 100K to 500M+ simulations with the same, flat memory footprint.
    batch_size = int(config.get("batch_size", 2_000_000))

    # Each batch needs its own independent random stream -- SeedSequence
    # spawn makes each batch's stream reproducible and, if you ever want
    # to split a shard further, trivially parallelizable.
    seed_seq = np.random.SeedSequence(seed)

    drift = (mu - 0.5 * sigma ** 2) * T
    vol_term = sigma * np.sqrt(T)

    partial_sum = 0.0
    partial_sum_sq = 0.0
    successful_trials = 0
    remaining = num_simulations
    batch_idx = 0

    while remaining > 0:
        this_batch = min(batch_size, remaining)
        batch_rng = np.random.default_rng(seed_seq.spawn(1)[0])

        z = batch_rng.standard_normal(this_batch)
        s_t = S0 * np.exp(drift + vol_term * z)

        partial_sum += float(np.sum(s_t))
        partial_sum_sq += float(np.sum(s_t ** 2))
        successful_trials += int(np.sum(s_t > strike))

        del z, s_t
        remaining -= this_batch
        batch_idx += 1

        done = num_simulations - remaining
        print(f"[shard] batch {batch_idx}: {done:,}/{num_simulations:,} done", flush=True)

    return {
        "shard_seed": seed,
        "count": num_simulations,
        "partial_sum": partial_sum,
        "partial_sum_sq": partial_sum_sq,
        "successful_trials": successful_trials,
        "strike": strike,
    }


def main():
    if len(sys.argv) < 2:
        print("ERROR: missing data_file argument", file=sys.stderr)
        sys.exit(1)

    data_file = sys.argv[1]

    with open(data_file, "r") as f:
        config = json.load(f)

    print(f"[shard] starting: {config.get('num_simulations')} sims, seed={config.get('seed')}")
    result = run_shard(config)

    # Machine-parseable line the client driver looks for.
    print("RESULT_JSON: " + json.dumps(result))


if __name__ == "__main__":
    main()