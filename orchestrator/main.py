import os
import asyncio

from fastapi import FastAPI, UploadFile, File, HTTPException

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
    success = update_heartbeat(data.worker_id)
    if not success:
        raise HTTPException(status_code=404, detail='Worker not found')
    return {'message': 'Heartbeat received'}

@app.post('/submit-job')
async def submit_job(file: UploadFile = File(...)):
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
            'message': 'No worker available right now'
        }

    assign_job(job_id, worker_id)
    workers[worker_id]['current_job'] = job_id

    worker_address = workers[worker_id]['ip']

    try:
        response = send_task_to_worker(
            worker_address=worker_address,
            job_id=job_id,
            shard_index=0,
            script_bytes=b'process_file',
            data_bytes=contents
        )

        if response.success:
            result = response.result_data.decode('utf-8')
            complete_job(job_id, result)

            workers[worker_id]['current_job'] = None

            return {
                'job_id': job_id,
                'status': 'completed',
                'assigned_worker': worker_id,
                'result': result
            }

        else:
            fail_job(job_id, response.error_message)
            workers[worker_id]['current_job'] = None

            return {
                'job_id': job_id,
                'status': 'failed',
                'assigned_worker': worker_id,
                'error': response.error_message
            }

    except Exception as e:
        fail_job(job_id, str(e))
        workers[worker_id]['current_job'] = None

        return {
            'job_id': job_id,
            'status': 'failed',
            'assigned_worker': worker_id,
            'error': str(e)
        }

@app.get('/workers')
def list_workers():
    return workers

@app.get('/jobs')
def list_jobs():
    return jobs