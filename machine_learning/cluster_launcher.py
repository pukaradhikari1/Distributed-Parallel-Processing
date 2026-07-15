"""
cluster_launcher.py

Run this EXACT SAME command on every worker node — no manual IP-finding
or per-node editing needed. It will:

  1. Discover the orchestrator via the same UDP broadcast grpc_server.py uses
  2. Poll GET /workers until the expected number of nodes are online
  3. Deterministically assign TF_CONFIG worker indices (sorted by worker_id,
     so every node computes the identical cluster spec independently)
  4. Set TF_CONFIG and exec the training script

Prereq: each node's grpc_server.py must already be running and registered
with the orchestrator (so the orchestrator knows its IP).

Usage (same on every node):
    python3 cluster_launcher.py --nodes 3 --script multiworker.py
"""

import argparse
import json
import os
import socket
import sys
import time
import requests

TF_PORT = 12345  # shared port used for TF collective ops on every node


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    finally:
        s.close()


def find_orchestrator(timeout=None):
    client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    client.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    client.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    client.bind(("", 50005))
    client.settimeout(1.0)
    print("Searching for orchestrator...", end="", flush=True)
    start = time.time()
    while True:
        try:
            data, _ = client.recvfrom(1024)
            msg = data.decode()
            if msg.startswith("ORCHESTRATOR:"):
                ip = msg.split(":")[1]
                print(f" found at {ip}")
                return ip
        except socket.timeout:
            print(".", end="", flush=True)
            if timeout and time.time() - start > timeout:
                raise TimeoutError("Orchestrator not found on the network")


def wait_for_cluster(orchestrator_ip, expected_nodes, poll_interval=2):
    url = f"http://{orchestrator_ip}:8000/workers"
    print(f"Waiting for {expected_nodes} worker(s) to be online...")
    while True:
        resp = requests.get(url, timeout=5)
        workers = resp.json()
        online = {wid: w for wid, w in workers.items() if w.get("status") == "online"}
        print(f"  {len(online)}/{expected_nodes} online", end="\r")
        if len(online) >= expected_nodes:
            print()
            return online
        time.sleep(poll_interval)


def build_tf_config(online_workers, local_ip):
    # Sort by worker_id so every node independently computes the SAME
    # cluster list in the SAME order -- this is what keeps indices consistent
    # across machines without any coordination beyond hitting the same API.
    ordered = sorted(online_workers.items(), key=lambda kv: kv[0])
    cluster = [f"{w['ip']}:{TF_PORT}" for _, w in ordered]

    my_index = next(
        (i for i, (_, w) in enumerate(ordered) if w["ip"] == local_ip), None
    )
    if my_index is None:
        raise RuntimeError(
            f"Local IP {local_ip} not found among registered workers {cluster}. "
            "Make sure grpc_server.py is running and registered on this node first."
        )

    return {
        "cluster": {"worker": cluster},
        "task": {"type": "worker", "index": my_index},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--nodes", type=int, required=True, help="Expected number of worker nodes")
    parser.add_argument("--script", default="multiworker.py", help="Training script to launch")
    parser.add_argument("--orchestrator-ip", default=None, help="Skip UDP discovery, use this IP directly")
    args = parser.parse_args()

    orchestrator_ip = args.orchestrator_ip or find_orchestrator()
    online = wait_for_cluster(orchestrator_ip, args.nodes)
    local_ip = get_local_ip()

    tf_config = build_tf_config(online, local_ip)
    print("TF_CONFIG:", json.dumps(tf_config))

    os.environ["TF_CONFIG"] = json.dumps(tf_config)
    os.execvp(sys.executable, [sys.executable, args.script])


if __name__ == "__main__":
    main()
