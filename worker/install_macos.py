import os
import platform
import subprocess
import sys

# HOW TO RUN:
# macOS → python3 install.py

PLIST_LABEL = "com.dpp.worker"
VENV_NAME = "dpp_venv"


def is_macos():
    return platform.system() == "Darwin"


def setup_macos():
    # worker/ folder — where install.py lives
    current_dir = os.path.dirname(os.path.abspath(__file__))

    # repo root — one level up from worker/
    repo_root = os.path.dirname(current_dir)

    # paths
    venv_path = os.path.join(current_dir, VENV_NAME)
    python_path = os.path.join(venv_path, "bin", "python3")
    pip_path = os.path.join(venv_path, "bin", "pip")
    requirements_path = os.path.join(repo_root, "requirements.txt")
    grpc_server_path = os.path.join(repo_root, "grpc_layer", "grpc_server.py")
    plist_dir = os.path.join(os.path.expanduser("~"), "Library", "LaunchAgents")
    plist_path = os.path.join(plist_dir, f"{PLIST_LABEL}.plist")
    log_path = os.path.join(current_dir, "worker.log")
    error_log_path = os.path.join(current_dir, "worker_error.log")

    # Check requirements.txt exists
    if not os.path.exists(requirements_path):
        print(f"❌ requirements.txt not found at {requirements_path}")
        print("   Make sure you cloned the full repo.")
        sys.exit(1)

    # Check grpc_server.py exists
    if not os.path.exists(grpc_server_path):
        print(f"❌ grpc_server.py not found at {grpc_server_path}")
        print("   Make sure grpc_layer/ folder exists in the repo root.")
        sys.exit(1)

    # Step 1 — create venv (skip if already exists)
    if os.path.exists(venv_path):
        print("[1/4] Virtual environment already exists — skipping creation.")
    else:
        print("[1/4] Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", venv_path], check=True)
        print("✅ Virtual environment created.")

    # Step 2 — install requirements
    print("[2/4] Installing packages...")
    subprocess.run([python_path, "-m", "pip", "install", "--upgrade", "pip"], check=True)
    subprocess.run([python_path, "-m", "pip", "install", "-r", requirements_path], check=True)
    print("✅ Packages installed.")

    # Step 3 — create launchd plist (skip if already exists)
    print("[3/4] Checking launchd agent...")

    if os.path.exists(plist_path):
        print("⚠️  launchd agent already exists — skipping registration.")
    else:
        print("[3/4] Creating launchd agent...")
        os.makedirs(plist_dir, exist_ok=True)

        plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{PLIST_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>{python_path}</string>
        <string>{grpc_server_path}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>{os.path.join(repo_root, "grpc_layer")}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>{log_path}</string>

    <key>StandardErrorPath</key>
    <string>{error_log_path}</string>
</dict>
</plist>"""

        with open(plist_path, "w") as f:
            f.write(plist_content)

        print("✅ launchd plist created.")

    # Step 4 — load agent (skip if already running)
    print("[4/4] Checking if worker is already running...")
    check_port = subprocess.run(
        "lsof -i :50051",
        shell=True,
        capture_output=True,
        text=True
    )

    if "50051" in check_port.stdout:
        print("⚠️  Worker already running on port 50051 — skipping start.")
    else:
        print("Loading launchd agent...")
        os.system(f"launchctl load {plist_path}")
        os.system(f"launchctl start {PLIST_LABEL}")
        print("✅ Worker started.")

    print("")
    print("✅ macOS setup complete!")
    print("✅ Worker will auto-start on every login.")
    print(f"   Check status : launchctl list | grep dpp")
    print(f"   View logs    : tail -f {log_path}")
    print(f"   View errors  : tail -f {error_log_path}")


if __name__ == "__main__":
    syst = platform.system()
    print(f"System detected: {syst}")
    print("")

    if syst == "Darwin":
        setup_macos()
    else:
        print(f"❌ This script is for macOS only. Detected: {syst}")
        print("   Use install.py for Windows/Linux.")
