import os
import asyncio

from fastapi import FastAPI, UploadFile, File, HTTPException

from models import Worker, Heartbeat
from workers import workers, register_worker, update_heartbeat, get_available_worker
from jobs import jobs, create_job, assign_job
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
    success = update_heartbeat(data.worker_id)
    if not success:
        raise HTTPException(status_code=404, detail='Worker not found')
    return {'message': 'Heartbeat received'}

@app.post('/submit-job')
async def submit_job(file: UploadFile = File(...)):
    contents = await file.read()
    file_path = f'uploads/{file.filename}'

    with open(file_path, 'wb') as f:
        f.write(contents)

    job_id = create_job(file.filename)
    worker_id = get_available_worker()

    if worker_id:
        assign_job(job_id, worker_id)
        workers[worker_id]['current_job'] = job_id
        status = 'running'
    else:
        status = 'queued'

    return {
        'job_id': job_id,
        'status': status,
        'assigned_worker': worker_id
    }

@app.get('/workers')
def list_workers():
    return workers

@app.get('/jobs')
def list_jobs():
    return jobs