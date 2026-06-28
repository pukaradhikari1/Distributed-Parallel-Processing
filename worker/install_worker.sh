#!/bin/bash

# --- Worker Linux Startup Script (VENV VERSION) ---

# 1. Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================="
echo "          STARTING LINUX WORKER           "
echo "=========================================="

# 2. Check for Python 3
if ! command -v python3 &> /dev/null
then
    echo "ERROR: python3 could not be found."
    echo "Please install it using: sudo apt install python3"
    exit 1
fi

# 3. Check/Create Virtual Environment
VENV_PATH="$DIR/venv"

if [ ! -d "$VENV_PATH" ]; then
    echo "Creating virtual environment in $VENV_PATH..."
    # Note: On some Ubuntu systems, you may need to run: sudo apt install python3-venv
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to create venv. You might need to run: sudo apt install python3-venv"
        exit 1
    fi
fi

# 4. Activate Virtual Environment
echo "Activating virtual environment..."
source venv/bin/activate

# 5. Install/Update dependencies inside the venv
echo "Checking dependencies..."
pip install --upgrade pip
pip install -r ../requirements.txt --quiet

# 6. Run the Worker
while true; do
    echo "[$(date)]Starting worker.py..."
    python3 worker.py

    echo""
    echo"[!] Worker exited or crashed. Re-registerin in 10 seconds..."
    echo"Press Ctrl+C to stop."
    sleep 10
done

