import time
import uuid
from datetime import datetime

system_errors = []

def log_error(worker_id: str, severity: str, message: str):
    """Logs an error to be displayed on the Android Errors dashboard."""
    error = {
        "id": str(uuid.uuid4()),
        "worker_id": worker_id,
        "severity": severity,  # "low", "medium", "high", "critical"
        "message": message,
        "timestamp": datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p"),
        "resolved": False
    }
    system_errors.append(error)
    
    # Keep only the latest 100 errors to save memory
    if len(system_errors) > 100:
        system_errors.pop(0)

def get_all_errors():
    # Return errors sorted newest to oldest
    return system_errors[::-1]