import os
import platform

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

if __name__ == "__main__":
    syst = platform.system()
    print(f"System detected: {syst}")
    
    if syst == "Windows":
        # (setup_windows function here)
        pass 
    elif syst == "Linux":
        setup_linux()
    else:
        print("Unknown OS")