import os
import platform
import subprocess
import sys

#navigate to worker folder in terminal
# 1) chmod +x install_worker.sh
# 2) sudo python3 install.py

# to verify if the worker is running in the background:
# sudo systemctl status worker 
def setup_linux():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    sh_path = os.path.abspath(os.path.join(current_dir, "install_worker.sh"))
    user = os.getlogin()

    # Define the Service File
    service_content = f"""[Unit]
Description=Distributed Worker Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User={user}
WorkingDirectory={current_dir}
ExecStart=/bin/bash {sh_path}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
"""
    
    # Save the service file
    service_path = "/tmp/worker.service"
    with open(service_path, "w") as f:
        f.write(service_content)

    print("Installing Systemd Service (Requires Sudo)...")
    os.system(f"sudo mv {service_path} /etc/systemd/system/worker.service")
    os.system("sudo systemctl daemon-reload")
    os.system("sudo systemctl enable worker.service")
    os.system("sudo systemctl start worker.service")
    
    print("\nSUCCESS: Worker is now a background system service!")
    print("Check status with: sudo systemctl status worker.service")


def setup_windows():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(current_dir)

    venv_path = os.path.join(current_dir, "dpp_venv")
    python_path = os.path.join(venv_path, "Scripts", "python.exe")
    pip_path = os.path.join(venv_path, "Scripts", "pip.exe")
    requirements_path = os.path.join(repo_root, "requirements.txt")
    grpc_server_path = os.path.join(repo_root, "grpc_layer", "grpc_server.py")

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

    print("[2/4] Installing packages...")
    subprocess.run([python_path, "-m", "pip", "install", "--upgrade", "pip"], check=True)
    subprocess.run([python_path, "-m", "pip", "install", "-r", requirements_path], check=True)
    print("✅ Packages installed.")

    # Step 3 — register in Task Scheduler (skip if already registered)
    print("[3/4] Checking Task Scheduler...")
    check = subprocess.run(
        'schtasks /query /tn "DPP Worker Server"',
        shell=True,
        capture_output=True
    )

    if check.returncode == 0:
        print("⚠️  Task already exists in Task Scheduler — skipping registration.")
    else:
        print("[3/4] Registering in Task Scheduler...")
        task_command = (
            f'schtasks /create /tn "DPP Worker Server" '
            f'/tr "{python_path} {grpc_server_path}" '
            f'/sc onstart /ru SYSTEM /rl HIGHEST /f'
        )
        subprocess.run(task_command, shell=True, check=True)
        print("✅ Task registered in Task Scheduler.")

    # Step 4 — start immediately (skip if already running)
    print("[4/4] Checking if worker is already running...")
    check_port = subprocess.run(
        "netstat -an | findstr 50051",
        shell=True,
        capture_output=True,
        text=True
    )

    if "50051" in check_port.stdout:
        print("⚠️  Worker already running on port 50051 — skipping start.")
    else:
        print("Starting worker server now...")
        subprocess.Popen([python_path, grpc_server_path])
        print("✅ Worker started.")

    print("")
    print("✅ Windows setup complete!")
    print("✅ Worker will auto-start on every reboot.")
    print("   Verify: netstat -an | findstr 50051")
    
if __name__ == "__main__":
    syst = platform.system()
    print(f"System detected: {syst}")
    
    if syst == "Windows":
        setup_windows() 
    elif syst == "Linux":
        setup_linux()
    else:
        print("Unknown OS")