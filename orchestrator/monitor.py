import asyncio
import time

from workers import get_available_worker
from jobs import assign_job_shard, requeue_job, get_shard_index_for_worker, get_cluster_ips_for_job
from errors import log_error 
from dispatcher import dispatch_job 
from database import SessionLocal
from models import Job, WorkerNode

async def monitor_workers():
    while True:
        db = SessionLocal()
        try:
            current_time = time.time()
            all_workers = db.query(WorkerNode).all()

            for worker in all_workers:
                if current_time - worker.last_seen > 30:
                    if worker.status != 'offline':
                        print(f"Worker {worker.worker_id} went offline")
                        log_error(worker_id=worker.worker_id, severity="high", message="Heartbeat timeout")
                    
                    worker.status = 'offline'
                    db.commit()
                    
                    active_jobs = db.query(Job).filter(Job.worker_id == worker.worker_id, Job.status == 'running').all()
                    
                    for job in active_jobs:
                        print(f"Reassigning job {job.job_id}")
                        requeue_job(db, job.job_id)
                        
                        worker.current_job = None
                        db.commit()
                        
                        new_worker_id = get_available_worker(db)

                        if new_worker_id:
                            # 1. Fetch exact shard details
                            shard_index = get_shard_index_for_worker(db, job.job_id, worker.worker_id)
                            
                            # 2. Rebuild network topology and replace IP
                            cluster_ips = get_cluster_ips_for_job(db, job.job_id)
                            new_worker = db.query(WorkerNode).filter(WorkerNode.worker_id == new_worker_id).first()
                            
                            if cluster_ips and shard_index is not None and shard_index < len(cluster_ips):
                                cluster_ips[shard_index] = new_worker.ip

                            assign_job_shard(db, job.job_id, new_worker_id, shard_index)
                            
                            new_worker.current_job = job.job_id
                            db.commit()
                            
                            print(f"Job {job.job_id} (Shard {shard_index}) reassigned to {new_worker_id}")
                            
                            asyncio.create_task(asyncio.to_thread(
                                dispatch_job, job.job_id, new_worker_id, cluster_ips, shard_index
                            ))
        finally:
            db.close()

        await asyncio.sleep(5)