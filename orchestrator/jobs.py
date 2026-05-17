import uuid

jobs = {}

def create_job(filename):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        'job_id': job_id,
        'filename': filename,
        'status': 'queued',
        'worker_id': None
    }
    return job_id

def assign_job(job_id, worker_id):
    jobs[job_id]['worker_id'] = worker_id
    jobs[job_id]['status'] = 'running'

def complete_job(job_id):
    jobs[job_id]['status'] = 'completed'

def requeue_job(job_id):
    jobs[job_id]['status'] = 'queued'
    jobs[job_id]['worker_id'] = None