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

    rng = np.random.default_rng(seed)
    z = rng.standard_normal(num_simulations)

    drift = (mu - 0.5 * sigma ** 2) * T
    diffusion = sigma * np.sqrt(T) * z
    s_t = S0 * np.exp(drift + diffusion)

    # Local compilation to minimize what has to travel back over gRPC/HTTP:
    # only send sufficient statistics, not the raw per-trial array.
    partial_sum = float(np.sum(s_t))
    partial_sum_sq = float(np.sum(s_t ** 2))
    successful_trials = int(np.sum(s_t > strike))

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