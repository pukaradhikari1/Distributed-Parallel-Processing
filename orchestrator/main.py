import os
import asyncio
import socket

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from typing import Optional

from models import Worker, Heartbeat
from workers import workers, register_worker, update_heartbeat, get_available_worker
from jobs import jobs, create_job, assign_job, complete_job, fail_job
from dispatcher import dispatch_job
from monitor import monitor_workers
from errors import get_all_errors  
import auth

app = FastAPI()
app.include_router(auth.router)


async def broadcast_presence():
    """Broadcasts the Orchestrator's IP address over the network so workers can find it."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    
    
    try:
        s_ip = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s_ip.connect(('8.8.8.8', 80))
        local_ip = s_ip.getsockname()[0]
        s_ip.close()
    except Exception:
        local_ip = '127.0.0.1'

    message = f"ORCHESTRATOR:{local_ip}".encode()
    
    while True:
        try:
            # Broadcast to the whole local network on port 50005
            s.sendto(message, ('<broadcast>', 50005))
            print(f"[DEBUG] Broadcasting IP: {local_ip} on port 50005")
        except Exception:
            pass
        await asyncio.sleep(3) # Broadcast every 3 seconds


@app.on_event('startup')
async def startup_event():
    asyncio.create_task(monitor_workers())
    asyncio.create_task(broadcast_presence())


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


@app.post('/submit-job')
async def submit_job(
    background_tasks: BackgroundTasks, 
    job_name: str = Form(...),             
    notes: Optional[str] = Form(None),     
    script_file: UploadFile = File(...),
    data_file: Optional[UploadFile] = File(None),
    weights_file: Optional[UploadFile] = File(None)
):
    # 1. Create a dedicated directory for this job to avoid filename collisions
    job_dir = os.path.join('uploads', script_file.filename.split('.')[0] + "_" + os.urandom(4).hex())
    os.makedirs(job_dir, exist_ok=True)

    # 2. Save Script
    script_path = os.path.join(job_dir, script_file.filename)
    with open(script_path, "wb") as f:
        f.write(await script_file.read())

    
    data_path = None
    if data_file:
        data_path = os.path.join(job_dir, data_file.filename)
        with open(data_path, "wb") as f:
            f.write(await data_file.read())

    
    weights_path = None
    if weights_file:
        weights_path = os.path.join(job_dir, weights_file.filename)
        with open(weights_path, "wb") as f:
            f.write(await weights_file.read())

    # 5. Create job using the Android Job Name instead of raw filename
    job_id = create_job(job_name, script_path, data_path, weights_path)
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
    
    # 6. Dispatch using the new dispatcher
    background_tasks.add_task(dispatch_job, job_id, worker_id)

    return {
        'job_id': job_id,
        'job_name': job_name,
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


# ADDED BACK: Endpoint for the Android Errors Screen
@app.get('/errors')
def list_errors():
    return get_all_errors()