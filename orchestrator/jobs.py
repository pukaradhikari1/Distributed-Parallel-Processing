
import uuid

jobs = {}

# UPDATED: Now accepts file paths
def create_job(filename, script_path, data_path=None, weights_path=None):
    job_id = str(uuid.uuid4())

    jobs[job_id] = {
        "job_id": job_id,
        "filename": filename,
        "status": "queued",
        "worker_id": None,
        "result": None,
        "error": None,
        # NEW: Store the locations on disk
        "script_path": script_path,
        "data_path": data_path,
        "weights_path": weights_path
    }


def assign_job(job_id, worker_id):
    jobs[job_id]["worker_id"] = worker_id
    jobs[job_id]["status"] = "running"


def complete_job(job_id, result):
    jobs[job_id]["status"] = "completed"
    jobs[job_id]["result"] = result
    jobs[job_id]["error"] = None


def fail_job(job_id, error):
    jobs[job_id]["status"] = "failed"
    jobs[job_id]["error"] = error


def requeue_job(job_id):
    jobs[job_id]["status"] = "queued"
    jobs[job_id]["worker_id"] = None