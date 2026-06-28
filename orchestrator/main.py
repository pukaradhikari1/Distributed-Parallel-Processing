import os
import asyncio

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from typing import Optional

from models import Worker, Heartbeat
from workers import workers, register_worker, update_heartbeat, get_available_worker
from jobs import jobs, create_job, assign_job, complete_job, fail_job
from grpc_client import send_task_to_worker
from monitor import monitor_workers
import auth

app = FastAPI()
app.include_router(auth.router)

@app.on_event('startup')
async def startup_event():
    asyncio.create_task(monitor_workers())

@app.get('/')
def home():
    return {'message': 'Orchestrator Running'}

@app.post('/register-worker')
def register(worker: Worker):
    register_worker(worker.dict())
    return {
        'message': 'Worker registered',
        'workers': workers
    }

@app.post('/heartbeat')
def heartbeat(data: Heartbeat):
    success = update_heartbeat(data)
    if not success:
        raise HTTPException(status_code=404, detail='Worker not found')
    return {'message': 'Heartbeat received'}

# UPDATED: Now accepts data and weights
def dispatch_job_background(job_id: str, worker_id: str, script_bytes: bytes, data_bytes: bytes, weight_bytes: bytes):
    """Background task to send the gRPC payload so the API doesn't freeze."""
    worker_ip = workers[worker_id]['ip']
    worker_address = f"{worker_ip}:50052"

    try:
        response = send_task_to_worker(
            worker_address=worker_address,
            job_id=job_id,
            shard_index=0,
            script_bytes=script_bytes,  
            data_bytes=data_bytes,
            weight_bytes=weight_bytes # Passing the new weights!
        )

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

# UPDATED: Endpoint now accepts up to 3 files (Script, Data, Weights)
@app.post('/submit-job')
async def submit_job(
    background_tasks: BackgroundTasks, 
    script_file: UploadFile = File(...),
    data_file: Optional[UploadFile] = File(None),
    weights_file: Optional[UploadFile] = File(None)
):
    os.makedirs('uploads', exist_ok=True)

    # Read the script (Mandatory)
    script_bytes = await script_file.read()
    
    # Read data & weights (Optional)
    data_bytes = await data_file.read() if data_file else b""
    weight_bytes = await weights_file.read() if weights_file else b""

    job_id = create_job(script_file.filename)
    worker_id = get_available_worker()

    if not worker_id:
        return {
            'job_id': job_id,
            'status': 'queued',
            'assigned_worker': None,
            'message': 'No worker available right now. Saved to queue.'
        }

    assign_job(job_id, worker_id)
    workers[worker_id]['current_job'] = job_id
    
    # Dispatch all files to the worker
    background_tasks.add_task(dispatch_job_background, job_id, worker_id, script_bytes, data_bytes, weight_bytes)

    return {
        'job_id': job_id,
        'status': 'running',
        'assigned_worker': worker_id,
        'message': 'Job dispatched in the background'
    }

@app.get('/workers')
def list_workers():
    return workers

@app.get('/jobs')
def list_jobs():
    return jobs