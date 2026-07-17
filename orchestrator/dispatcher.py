import os
import json
import io
import zipfile
from grpc_client import send_task_to_worker
from jobs import complete_job_shard, complete_job, fail_job 
from database import SessionLocal

# NEW: Import WorkerNode instead of the old workers dictionary
from models import Job, WorkerNode 

def dispatch_job(job_id: str, worker_id: str, cluster_ips: list, worker_index: int):
    db = SessionLocal()
    try:
        # NEW: Fetch the worker's IP address directly from the database
        worker_node = db.query(WorkerNode).filter(WorkerNode.worker_id == worker_id).first()
        if not worker_node:
            raise Exception(f"Worker {worker_id} not found in database.")
        
        worker_ip = worker_node.ip
        
        job = db.query(Job).filter(Job.job_id == job_id).first()
        
        if not job: return

        with open(job.script_path, 'rb') as f:
            original_script_bytes = f.read()
            
        data_bytes = b""
            
        # ---------------------------------------------------------
        # THE ROUTING SWITCH
        # ---------------------------------------------------------
        if job.job_type == "distributed_ml":
            # 1. TF_CONFIG INJECTION
            cluster_list = [f"{ip}:12345" for ip in cluster_ips]
            tf_config_dict = {
                "cluster": {"worker": cluster_list},
                "task": {"type": "worker", "index": worker_index}
            }
            injection_code = f"import os\nimport json\nos.environ['TF_CONFIG'] = json.dumps({tf_config_dict})\n"
            script_bytes = injection_code.encode('utf-8') + original_script_bytes
            
            # 2. IN-MEMORY ZIP SHARDING
            if job.data_path and job.data_path.endswith('.zip'):
                total_workers = len(cluster_ips)
                with zipfile.ZipFile(job.data_path, 'r') as original_zip:
                    valid_files = [f for f in original_zip.namelist() if not f.endswith('/')]
                    my_files = [f for i, f in enumerate(valid_files) if i % total_workers == worker_index]
                    
                    memory_zip = io.BytesIO()
                    with zipfile.ZipFile(memory_zip, 'w') as new_zip:
                        for file_name in my_files:
                            new_zip.writestr(file_name, original_zip.read(file_name))
                    data_bytes = memory_zip.getvalue()
            elif job.data_path:
                with open(job.data_path, 'rb') as f:
                    data_bytes = f.read()
                    
        else:
            # FOR "STANDARD" JOBS: Skip injection and send data raw
            script_bytes = original_script_bytes
            if job.data_path:
                with open(job.data_path, 'rb') as f:
                    data_bytes = f.read()
        # ---------------------------------------------------------
                
        weight_bytes = b""
        if job.weights_path:
            with open(job.weights_path, 'rb') as f:
                weight_bytes = f.read()

        # 3. DISPATCH VIA GRPC
        response = send_task_to_worker(
            worker_ip=worker_ip, job_id=job_id, shard_index=worker_index,
            script_bytes=script_bytes, data_bytes=data_bytes, model_weights_bytes=weight_bytes
        )

        if response and getattr(response, 'success', False):
            result = response.result_data.decode('utf-8')
            # Write to the appropriate database tables based on job type
            if job.total_shards > 1:
                complete_job_shard(db, job_id, worker_index, result)
            else:
                complete_job(db, job_id, result)
        else:
            error_message = getattr(response, 'error_message', "Worker did not respond via gRPC")
            fail_job(db, job_id, error_message)

    except Exception as e:
        fail_job(db, job_id, str(e))
    finally:
        # NEW: Clear the current_job status in the database instead of the dictionary
        worker_node = db.query(WorkerNode).filter(WorkerNode.worker_id == worker_id).first()
        if worker_node:
            worker_node.current_job = None
            db.commit()
            
        db.close()