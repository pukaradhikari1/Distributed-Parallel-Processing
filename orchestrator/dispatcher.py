from grpc_client import send_task_to_worker
from jobs import complete_job, fail_job, jobs
from workers import workers

def dispatch_job(job_id: str, worker_id: str):
    """Reads files from disk and sends them via gRPC."""
    worker_ip = workers[worker_id]['ip']
    job = jobs[job_id]

    try:
        # 1. Read files back from disk
        with open(job['script_path'], 'rb') as f:
            script_bytes = f.read()
        
        data_bytes = b""
        if job.get('data_path') and job['data_path']:
            with open(job['data_path'], 'rb') as f:
                data_bytes = f.read()
                
        weight_bytes = b""
        if job.get('weights_path') and job['weights_path']:
            with open(job['weights_path'], 'rb') as f:
                weight_bytes = f.read()

        # 2. Dispatch via gRPC (FIXED argument names to match grpc_client)
        response = send_task_to_worker(
            worker_ip=worker_ip, 
            job_id=job_id,
            shard_index=0,
            script_bytes=script_bytes,  
            data_bytes=data_bytes,
            model_weights_bytes=weight_bytes  # Fixed argument name!
        )

        # 3. Handle response
        if response and getattr(response, 'success', False):
            result = response.result_data.decode('utf-8')
            complete_job(job_id, result)
        else:
            error_message = getattr(response, 'error_message', "Worker did not respond via gRPC")
            fail_job(job_id, error_message)

    except Exception as e:
        fail_job(job_id, str(e))
    finally:
        if worker_id in workers:
            workers[worker_id]['current_job'] = None