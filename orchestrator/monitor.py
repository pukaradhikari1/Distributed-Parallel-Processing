import asyncio
import time

from workers import workers, get_available_worker
from jobs import assign_job, requeue_job
from errors import log_error 
from dispatcher import dispatch_job 
from database import SessionLocal
from models import Job

async def monitor_workers():
    while True:
        current_time = time.time()

        for worker_id, worker in list(workers.items()):
            if current_time - worker['last_seen'] > 30:
                if worker['status'] != 'offline':
                    print(f"Worker {worker_id} went offline")
                    log_error(worker_id=worker_id, severity="high", message="Heartbeat timeout")
                
                worker['status'] = 'offline'
                
                db = SessionLocal()
                try:
                    active_jobs = db.query(Job).filter(Job.worker_id == worker_id, Job.status == 'running').all()
                    for job in active_jobs:
                        print(f"Reassigning job {job.job_id}")
                        requeue_job(db, job.job_id)
                        worker['current_job'] = None
                        new_worker = get_available_worker()

                        if new_worker:
                            assign_job(db, job.job_id, new_worker)
                            workers[new_worker]['current_job'] = job.job_id
                            print(f"Job {job.job_id} reassigned to {new_worker}")
                            
                            new_worker_ip = workers[new_worker]['ip']
                            asyncio.create_task(asyncio.to_thread(
                                dispatch_job, job.job_id, new_worker, [new_worker_ip], 0
                            ))
                finally:
                    db.close()

        await asyncio.sleep(5)