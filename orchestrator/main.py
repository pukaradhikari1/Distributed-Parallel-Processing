import os
import asyncio

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks

from models import Worker, Heartbeat
from workers import workers, register_worker, update_heartbeat, get_available_worker
from jobs import jobs, create_job, assign_job, complete_job, fail_job
from grpc_client import send_task_to_worker
from monitor import monitor_workers

app = FastAPI()

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


def dispatch_job_background(job_id: str, worker_id: str, file_contents: bytes):
    """Background task to send the gRPC payload so the API doesn't freeze."""
    worker_ip = workers[worker_id]['ip']
    
    
    worker_address = f"{worker_ip}:50052"

    try:
        response = send_task_to_worker(
            worker_address=worker_address,
            job_id=job_id,
            shard_index=0,
            script_bytes=file_contents,  
            data_bytes=b""               
        )

        if response.success:
            result = response.result_data.decode('utf-8')
            complete_job(job_id, result)
        else:
            fail_job(job_id, response.error_message)

    except Exception as e:
        fail_job(job_id, str(e))
    finally:
        
        if worker_id in workers:
            workers[worker_id]['current_job'] = None


@app.post('/submit-job')
async def submit_job(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    os.makedirs('uploads', exist_ok=True)

    contents = await file.read()
    file_path = f'uploads/{file.filename}'

    with open(file_path, 'wb') as f:
        f.write(contents)

    
    job_id = create_job(file.filename)
    
    
    worker_id = get_available_worker()

    if not worker_id:
        return {
            'job_id': job_id,
            'status': 'queued',
            'assigned_worker': None,
            'message': 'No worker available right now. Saved to queue.'
        }

    # 3. Assign the job to the worker in the registry
    assign_job(job_id, worker_id)
    workers[worker_id]['current_job'] = job_id

    
    background_tasks.add_task(dispatch_job_background, job_id, worker_id, contents)

    
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