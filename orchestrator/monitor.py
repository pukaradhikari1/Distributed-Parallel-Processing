import asyncio
import time

from workers import workers, get_available_worker
from jobs import jobs, assign_job, requeue_job
from errors import log_error 
from dispatcher import dispatch_job # NEW: Import dispatcher

async def monitor_workers():
    while True:
        current_time = time.time()

        for worker_id, worker in workers.items():
            if current_time - worker['last_seen'] > 30:
                if worker['status'] != 'offline':
                    print(f"Worker {worker_id} went offline")
                    log_error(
                        worker_id=worker_id, 
                        severity="high", 
                        message="Heartbeat timeout after 30s — connection reset by peer"
                    )

                worker['status'] = 'offline'

                for job_id, job in jobs.items():
                    if (
                        job['worker_id'] == worker_id
                        and job['status'] == 'running'
                    ):
                        print(f"Reassigning job {job_id}")
                        requeue_job(job_id)
                        new_worker = get_available_worker()

                        if new_worker:
                            assign_job(job_id, new_worker)
                            workers[new_worker]['current_job'] = job_id
                            print(f"Job {job_id} reassigned to {new_worker}")
                            
                            # NEW: Actually trigger the re-dispatch in a non-blocking way
                            asyncio.to_thread(dispatch_job, job_id, new_worker)

        await asyncio.sleep(5)