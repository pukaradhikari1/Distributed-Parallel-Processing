import json
from grpc_client import send_task_to_worker
from jobs import complete_job, fail_job
from workers import workers
from database import SessionLocal
from models import Job

# UPDATED to accept the full cluster list and this specific worker's index
def dispatch_job(job_id: str, worker_id: str, cluster_ips: list, worker_index: int):
    db = SessionLocal()
    try:
        worker_ip = workers[worker_id]['ip']
        job = db.query(Job).filter(Job.job_id == job_id).first()
        
        if not job:
            return

        with open(job.script_path, 'rb') as f:
            original_script_bytes = f.read()
            
        # ---------------------------------------------------------
        # THE MAGIC TRICK: INJECTING TF_CONFIG DIRECTLY INTO THE SCRIPT
        # ---------------------------------------------------------
        # We assign port 12345 to all workers for TensorFlow cross-talk
        cluster_list = [f"{ip}:12345" for ip in cluster_ips]
        
        tf_config_dict = {
            "cluster": {"worker": cluster_list},
            "task": {"type": "worker", "index": worker_index}
        }
        
        # Write the python code to set the environment variable
        injection_code = f"""
import os
import json
os.environ['TF_CONFIG'] = json.dumps({tf_config_dict})

# --- ORIGINAL SCRIPT BELOW ---
"""
        # Glue the injection to the top of the original script
        script_bytes = injection_code.encode('utf-8') + original_script_bytes
        # ---------------------------------------------------------
        
        data_bytes = b""
        if job.data_path:
            with open(job.data_path, 'rb') as f:
                data_bytes = f.read()
                
        weight_bytes = b""
        if job.weights_path:
            with open(job.weights_path, 'rb') as f:
                weight_bytes = f.read()

        response = send_task_to_worker(
            worker_ip=worker_ip, job_id=job_id, shard_index=worker_index,
            script_bytes=script_bytes, data_bytes=data_bytes, model_weights_bytes=weight_bytes
        )

        if response and getattr(response, 'success', False):
            result = response.result_data.decode('utf-8')
            complete_job(db, job_id, result)
        else:
            error_message = getattr(response, 'error_message', "Worker did not respond via gRPC")
            fail_job(db, job_id, error_message)

    except Exception as e:
        fail_job(db, job_id, str(e))
    finally:
        db.close()
        if worker_id in workers:
            workers[worker_id]['current_job'] = None