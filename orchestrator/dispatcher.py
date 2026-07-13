from grpc_client import send_task_to_worker
from jobs import complete_job, fail_job
from workers import workers
from database import SessionLocal
from models import Job

def dispatch_job(job_id: str, worker_id: str):
    db = SessionLocal()
    try:
        worker_ip = workers[worker_id]['ip']
        job = db.query(Job).filter(Job.job_id == job_id).first()
        
        if not job:
            return

        with open(job.script_path, 'rb') as f:
            script_bytes = f.read()
        
        data_bytes = b""
        if job.data_path:
            with open(job.data_path, 'rb') as f:
                data_bytes = f.read()
                
        weight_bytes = b""
        if job.weights_path:
            with open(job.weights_path, 'rb') as f:
                weight_bytes = f.read()

        response = send_task_to_worker(
            worker_ip=worker_ip, job_id=job_id, shard_index=0,
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