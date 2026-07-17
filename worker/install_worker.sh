#!/bin/bash

# --- Worker Linux Startup Script (Unified Version) ---

# 1. Get the directory where THIS script is located (the 'worker' folder)
WORKER_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# 2. Define the path to the grpc_layer folder
GRPC_LAYER_DIR="$( cd "$WORKER_DIR/../grpc_layer" && pwd )"
# 3. Define repo root (where requirements.txt is)
REPO_ROOT="$( cd "$WORKER_DIR/.." && pwd )"

cd "$WORKER_DIR"

echo "=========================================="
echo "          STARTING LINUX WORKER           "
echo "=========================================="
echo "Worker Dir: $WORKER_DIR"
echo "gRPC Layer: $GRPC_LAYER_DIR"

export PATH="/usr/lib/wsl/lib:/usr/local/cuda/bin:$PATH"
export LD_LIBRARY_PATH="/usr/lib/wsl/lib:/usr/lib/x86_64-linux-gnu:/usr/local/cuda/lib64:$LD_LIBRARY_PATH"

# Prevent TensorFlow from crashing on 4GB RTX 2050
export TF_FORCE_GPU_ALLOW_GROWTH=true
export CUDA_VISIBLE_DEVICES=0

# 4. Check for Python 3
if ! command -v python3 &> /dev/null
then
    echo "ERROR: python3 could not be found."
    exit 1
fi

# 5. Check/Create Virtual Environment inside the worker folder
VENV_PATH="$( cd "$WORKER_DIR/.." && pwd )/venv"

echo "Using Virtual Env at: $VENV_PATH"

if [ ! -d "$VENV_PATH" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_PATH"
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to create venv. Run: sudo apt install python3-venv"
        exit 1
    fi
fi

# 6. Activate Virtual Environment
source "$VENV_PATH/bin/activate"

# 7. Install/Update dependencies
echo "Checking dependencies..."
pip install --upgrade pip --quiet
# Assuming requirements.txt is in the root or worker folder
if [ -f "$REPO_ROOT/requirements.txt" ]; then
    pip install -r "$REPO_ROOT/requirements.txt" --quiet
elif [ -f "$WORKER_DIR/requirements.txt" ]; then
    pip install -r "$WORKER_DIR/requirements.txt" --quiet
fi

# 8. MOVE TO THE GRPC_LAYER FOLDER TO RUN
# This is crucial so that 'import distributed_pb2' works correctly!
cd "$GRPC_LAYER_DIR"

# 9. Run the Worker Loop
while true; do
    echo "[$(date)] Starting grpc_server.py..."
    
    # We use the python inside our venv explicitly
    "$VENV_PATH/bin/python3" "grpc_server.py"

    echo ""
    echo "[!] Worker exited or crashed. Re-registering in 10 seconds..."
    echo "Press Ctrl+C to stop."
    sleep 10
done