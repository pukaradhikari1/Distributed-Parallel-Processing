import os
import asyncio
import socket
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from typing import Optional
from sqlalchemy.orm import Session

from database import engine, Base, get_db
import models # Ensures Job table is loaded
import auth   # Ensures DBUser table is loaded

# Build all tables safely at startup
Base.metadata.create_all(bind=engine)

from models import Worker, Heartbeat
from workers import workers, register_worker, update_heartbeat, get_available_worker
from jobs import create_job, assign_job, get_all_jobs
from dispatcher import dispatch_job
from monitor import monitor_workers
from errors import get_all_errors


async def broadcast_presence():
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
            s.sendto(message, ('<broadcast>', 50005))
        except Exception:
            pass
        await asyncio.sleep(3)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Orchestrator starting up background tasks...")
    asyncio.create_task(monitor_workers())
    asyncio.create_task(broadcast_presence())
    yield 
    print("Orchestrator shutting down...")


app = FastAPI(lifespan=lifespan)
app.include_router(auth.router)


@app.get('/')
def home():
    return {'message': 'Orchestrator Running'}

@app.post('/register-worker')
def register(worker: Worker):
    register_worker(worker.dict())
    return {'message': 'Worker registered', 'workers': workers}

@app.post('/heartbeat')
def heartbeat(data: Heartbeat):
    success = update_heartbeat(data)
    if not success:
        raise HTTPException(status_code=404, detail='Worker not found')
    return {'message': 'Heartbeat received'}

@app.post('/submit-job')
async def submit_job(
    background_tasks: BackgroundTasks, 
    user_id: str = Form(...),
    job_name: str = Form(...),             
    notes: Optional[str] = Form(None),     
    script_file: UploadFile = File(...),
    data_file: Optional[UploadFile] = File(None),
    weights_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    job_dir = os.path.join('uploads', script_file.filename.split('.')[0] + "_" + os.urandom(4).hex())
    os.makedirs(job_dir, exist_ok=True)

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

    job_id = create_job(db, user_id, job_name, script_path, data_path, weights_path)
    worker_id = get_available_worker()

    if not worker_id:
        return {
            'job_id': job_id,
            'status': 'queued',
            'assigned_worker': None,
            'message': 'No worker available right now. Saved to queue.'
        }

    assign_job(db, job_id, worker_id)
    workers[worker_id]['current_job'] = job_id
    
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
def list_jobs(db: Session = Depends(get_db)):
    return get_all_jobs(db)

@app.get('/errors')
def list_errors():
    return get_all_errors()