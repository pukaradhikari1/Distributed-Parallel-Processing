import os
import sys
import platform
import shutil

# HOW TO RUN:
# macOS → python3 uninstall_macos.py
#Verify: launchctl list | grep dpp

PLIST_LABEL = "com.dpp.worker"
VENV_NAME = "dpp_venv"


def uninstall_macos():
    print("--- macOS Cleanup (launchd) ---")

    current_dir = os.path.dirname(os.path.abspath(__file__))
    plist_path = os.path.join(
        os.path.expanduser("~"), "Library", "LaunchAgents", f"{PLIST_LABEL}.plist"
    )

    # Step 1 — stop the agent
    print("[1/4] Stopping launchd agent...")
    os.system(f"launchctl stop {PLIST_LABEL}")
    print(" Agent stopped.")

    # Step 2 — unload the agent
    print("[2/4] Unloading launchd agent...")
    if os.path.exists(plist_path):
        os.system(f"launchctl unload {plist_path}")
        os.remove(plist_path)
        print("launchd plist removed.")
    else:
        print("Plist not found — already removed.")

    # Step 3 — kill any running grpc_server.py process
    print("[3/4] Stopping any running worker processes...")
    os.system("pkill -f grpc_server.py")
    print("Worker processes stopped.")

    # Step 4 — delete venv
    print("[4/4] Deleting virtual environment...")
    venv_path = os.path.join(current_dir, VENV_NAME)
    if os.path.exists(venv_path):
        shutil.rmtree(venv_path)
        print(f" {VENV_NAME} deleted.")
    else:
        print(f"  {VENV_NAME} not found — already removed.")

    # Cleanup log files
    log_files = ["worker.log", "worker_error.log"]
    for log in log_files:
        log_path = os.path.join(current_dir, log)
        if os.path.exists(log_path):
            os.remove(log_path)
            print(f" Deleted {log}")

    print("")
    print("macOS uninstall complete.")


if __name__ == "__main__":
    syst = platform.system()

    if syst != "Darwin":
        print(f" This script is for macOS only. Detected: {syst}")
        print("   Use uninstall.py for Windows/Linux.")
        sys.exit(1)

    confirm = input(
        "This will completely remove the worker and all its files. Continue? (y/n): "
    )
    if confirm.lower() != "y":
        print("Uninstall cancelled.")
        sys.exit()

    print(f"\nSystem detected: {syst}")
    print("")
    uninstall_macos()
