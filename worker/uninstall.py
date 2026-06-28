import os
import sys
import platform
import shutil

#navigate to worker folder in terminal
# 1) chmod +x uninstall_worker.sh
# 2) sudo python3 uninstall.py

# to verify if the worker service is removed:
# sudo systemctl status worker 
def uninstall_linux():
    print("--- Linux Cleanup (Systemd & Autostart) ---")
    
    # 1. Stop and remove systemd service
    service_name = "worker.service"
    service_path = f"/etc/systemd/system/{service_name}"
    
    if os.path.exists(service_path):
        print(f"Stopping and disabling {service_name}...")
        os.system(f"sudo systemctl stop {service_name}")
        os.system(f"sudo systemctl disable {service_name}")
        os.system(f"sudo rm {service_path}")
        os.system("sudo systemctl daemon-reload")
        os.system("sudo systemctl reset-failed")
        print("SUCCESS: Systemd service removed.")

    # 2. Remove desktop autostart file (if it exists)
    home = os.path.expanduser("~")
    desktop_file = os.path.join(home, ".config", "autostart", "worker_node.desktop")
    if os.path.exists(desktop_file):
        os.remove(desktop_file)
        print("SUCCESS: Desktop autostart file removed.")

    # 3. Clean up Crontab (if cron was used)
    print("Cleaning up Crontab...")
    os.system('crontab -l | grep -v "start_worker.sh" | crontab -')

def cleanup_files():
    print("--- Cleaning Folder Artifacts ---")
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Delete Virtual Environment
    venv_path = os.path.join(current_dir, "venv")
    if os.path.exists(venv_path):
        print("Deleting venv folder (this may take a moment)...")
        shutil.rmtree(venv_path)
        print("SUCCESS: Virtual environment deleted.")

    # 2. Delete temporary files and logs
    patterns = ["task_", "data_", "weights_", "worker_debug.log", "worker.log", "active_worker_ip.txt"]
    for filename in os.listdir(current_dir):
        if any(pattern in filename for pattern in patterns):
            try:
                os.remove(os.path.join(current_dir, filename))
            except:
                pass
    print("SUCCESS: Log files and temporary shards deleted.")

if __name__ == "__main__":
    confirm = input("This will completely remove the worker and all its dependencies. Continue? (y/n): ")
    if confirm.lower() != 'y':
        print("Uninstall cancelled.")
        sys.exit()

    syst = platform.system()
    if syst == "Linux":
        uninstall_linux()
    elif syst == "Windows":
        # (Windows schtasks delete logic here)
        os.system('schtasks /delete /tn "WorkerNode" /f')
    
    cleanup_files()
    print("\n[FINISHED] Distributed Worker has been fully uninstalled.")