import os
import platform
import subprocess
import sys

#navigate to worker folder in terminal
# 1) chmod +x install_worker.sh
# 2) sudo python3 install.py

# to verify if the worker is running in the background:
# sudo systemctl status worker 
# journalctl -u worker.service -f

def setup_linux():
    import pwd
    current_dir = os.path.dirname(os.path.abspath(__file__))
    sh_path = os.path.abspath(os.path.join(current_dir, "install_worker.sh"))
    user = os.environ.get('SUDO_USER') or pwd.getpwuid(os.getuid())[0]

    try:
        smi_path = subprocess.check_output(["which", "nvidia-smi"]).decode().strip()
        smi_bin_dir = os.path.dirname(smi_path)
    except:
        if os.path.exists("/usr/lib/wsl/lib/nvidia-smi"):
            smi_bin_dir = "/usr/lib/wsl/lib"
        else:
            smi_bin_dir = "/usr/bin"

    possible_lib_paths = [
        "/usr/lib/wsl/lib",            # WSL2 Drivers
        "/usr/local/cuda/lib64",       # Standard CUDA
        "/usr/lib/x86_64-linux-gnu"    # Ubuntu Drivers
    ]
    # Only keep paths that actually exist on this computer
    valid_libs = [p for p in possible_lib_paths if os.path.exists(p)]
    ld_path = ":".join(valid_libs)

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

Environment="PATH={smi_bin_dir}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="LD_LIBRARY_PATH={ld_path}"
Environment="TF_FORCE_GPU_ALLOW_GROWTH=true"
Environment="CUDA_VISIBLE_DEVICES=0"

[Install]
WantedBy=multi-user.target
"""
    
    # Save the service file
    service_path = "/tmp/worker.service"
    with open(service_path, "w") as f:
        f.write(service_content)

    print("Installing Systemd Service (Requires Sudo)...")
    print(f"Auto-detected GPU Binaries: {smi_bin_dir}")
    print(f"Auto-detected GPU Libraries: {ld_path}")
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
    grpc_server_path = os.path.join(repo_root,"grpc_layer", "grpc_server.py")

    # Check requirements.txt exists
    if not os.path.exists(requirements_path):
        print(f" requirements.txt not found at {requirements_path}")
        print("   Make sure you cloned the full repo.")
        sys.exit(1)

    # Check grpc_server.py exists
    if not os.path.exists(grpc_server_path):
        print(f" grpc_server.py not found at {grpc_server_path}")
        print("   Make sure grpc_layer/ folder exists in the repo root.")
        sys.exit(1)

    # Step 1 — create venv (skip if already exists)
    if os.path.exists(venv_path):
        print("[1/4] Virtual environment already exists — skipping creation.")
    else:
        print("[1/4] Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", venv_path], check=True)
        print(" Virtual environment created.")

    print("[2/4] Installing packages...")
    subprocess.run([python_path, "-m", "pip", "install", "--upgrade", "pip"], check=True)
    subprocess.run([python_path, "-m", "pip", "install", "-r", requirements_path], check=True)
    print(" Packages installed.")

    # Step 3 — register in Task Scheduler (skip if already registered)
    print("[3/4] Checking Task Scheduler...")
    check = subprocess.run(
        'schtasks /query /tn "DPP Worker Server"',
        shell=True,
        capture_output=True
    )

    if check.returncode == 0:
        print(" Task already exists in Task Scheduler — skipping registration.")
    else:
        print("[3/4] Registering in Task Scheduler...")
        task_command = (
            f'schtasks /create /tn "DPP Worker Server" '
            f'/tr "{python_path} {grpc_server_path}" '
            f'/sc onstart /ru SYSTEM /rl HIGHEST /f'
        )
        subprocess.run(task_command, shell=True, check=True)
        print(" Task registered in Task Scheduler.")

    # Step 4 — start immediately (skip if already running)
    print("[4/4] Checking if worker is already running...")
    check_port = subprocess.run(
        "netstat -an | findstr 50051",
        shell=True,
        capture_output=True,
        text=True
    )

    if "50051" in check_port.stdout:
        print("  Worker already running on port 50051 — skipping start.")
    else:
        print("Starting worker server now...")
        subprocess.Popen([python_path, grpc_server_path])
        print(" Worker started.")

    print("")
    print("Windows setup complete!")
    print("Worker will auto-start on every reboot.")
    print("   Verify: netstat -an | findstr 50051")

def optimize_wsl_networking():
    if platform.system() != "Windows":
        return

    print("Checking WSL configuration...")
    
    user_profile = os.environ.get('USERPROFILE')
    if not user_profile:
        print("Could not find Windows User Profile.")
        return

    wsl_config_path = os.path.join(user_profile, ".wslconfig")
    
    required_config = [
        "[wsl2]\n",
        "networkingMode=mirrored\n"
    ]

    needs_update = False
    current_content = []
    if os.path.exists(wsl_config_path):
        with open(wsl_config_path, "r") as f:
            current_content = f.readlines()
        
        if not any("networkingMode=mirrored" in line for line in current_content):
            needs_update = True
    else:
        needs_update = True

    if needs_update:
        print(f"Updating {wsl_config_path} for better networking...")
        
        if not current_content:
            new_content = required_config
        else:
            new_content = current_content
            if "[wsl2]\n" not in new_content:
                new_content.insert(0, "[wsl2]\n")
            new_content.append("networkingMode=mirrored\n")

        with open(wsl_config_path, "w") as f:
            f.writelines(new_content)
        
        print("SUCCESS: Mirrored networking enabled.")
        print("IMPORTANT: You must restart WSL for changes to take effect.")
        print("Please run 'wsl --shutdown' in PowerShell.")
    else:
        print("WSL Networking is already optimized.")

if __name__ == "__main__":
    syst = platform.system()
    print(f"System detected: {syst}")
    is_wsl="microsoft" in platform.release().lower()
    
    if syst == "Windows":
        optimize_wsl_networking()
        ("WSL networking has been optimized.\n")

        choice = input("Do you want to install the NATIVE Windows Worker? \n(Type 'y' for native, or press Enter to skip and use WSL instead): ")
        
        if choice.lower() == 'y':
            setup_windows()
        else:
            print("\nSkipping Windows Native setup.")
        setup_windows() 
    elif syst == "Linux":
        if is_wsl:
            print("WSL detected.")
        setup_linux()
    else:
        print(f"Unknown OS: {syst}")