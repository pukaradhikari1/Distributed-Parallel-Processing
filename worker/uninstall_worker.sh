#!/bin/bash

echo "=========================================="
echo "          REMOVING LINUX WORKER           "
echo "=========================================="

# 1. Kill any active worker processes
echo "[1/4] Stopping worker processes..."
pkill -f "worker.py"

# 2. Stop and Disable systemd service
if [ -f "/etc/systemd/system/worker.service" ]; then
    echo "[2/4] Removing systemd service..."
    sudo systemctl stop worker.service
    sudo systemctl disable worker.service
    sudo rm /etc/systemd/system/worker.service
    sudo systemctl daemon-reload
fi

# 3. Remove from GNOME Startup Applications
AUTOSTART_FILE="$HOME/.config/autostart/worker_node.desktop"
if [ -f "$AUTOSTART_FILE" ]; then
    rm "$AUTOSTART_FILE"
    echo "Removed Startup Application entry."
fi

# 4. Delete the Virtual Environment
echo "[3/4] Deleting Virtual Environment (venv)..."
if [ -d "venv" ]; then
    rm -rf venv
fi

# 5. Final Cleanup
echo "[4/4] Cleaning up temporary files..."
rm task_*.py data_*.bin weights_*.bin active_worker.txt 2>/dev/null

echo ""
echo "SUCCESS: Disrtributed Worker has been uninstalled."