import uuid
from sqlalchemy.orm import Session
from models import Job, JobShard, WorkerNode

def create_job(db: Session, user_id: str, filename: str, script_path: str, data_path: str = None, weights_path: str = None, job_type: str = "standard"):
    job_id = str(uuid.uuid4())
    new_job = Job(
        job_id=job_id, 
        user_id=user_id, 
        filename=filename, 
        job_type=job_type,
        status="queued",
        worker_id=None, 
        script_path=script_path, 
        data_path=data_path, 
        weights_path=weights_path
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    return job_id

def assign_job(db: Session, job_id: str, worker_id: str):
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if job:
        job.worker_id = worker_id
        job.status = "running"
        db.commit()

def complete_job(db: Session, job_id: str, result: str):
    import time # Ensure time is imported at the top of jobs.py
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if job:
        job.status = "completed"
        job.result = result
        job.completed_at = time.time() # Track end time for 1-worker jobs
        db.commit()

def fail_job(db: Session, job_id: str, error: str):
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if job:
        job.status = "failed"
        job.error = error
        db.commit()

def requeue_job(db: Session, job_id: str):
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if job:
        job.status = "queued"
        job.worker_id = None
        db.commit()

def get_all_jobs(db: Session):
    return db.query(Job).all()

def assign_job_shard(db: Session, job_id: str, worker_id: str, shard_index: int):
    shard_id = str(uuid.uuid4())
    new_shard = JobShard(
        shard_id=shard_id,
        job_id=job_id,
        worker_id=worker_id,
        shard_index=shard_index,
        status="running"
    )
    db.add(new_shard)
    
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if job and job.status == "queued":
        job.status = "running"
    db.commit()

def complete_job_shard(db: Session, job_id: str, shard_index: int, result: str):
    import time
    shard = db.query(JobShard).filter(JobShard.job_id == job_id, JobShard.shard_index == shard_index).first()
    if shard:
        shard.status = "completed"
        shard.result = result
        db.commit()

    # NEW: Check if ALL shards for this job are completely finished
    all_shards = db.query(JobShard).filter(JobShard.job_id == job_id).all()
    if all_shards and all(s.status == "completed" for s in all_shards):
        main_job = db.query(Job).filter(Job.job_id == job_id).first()
        if main_job and main_job.status != "completed":
            main_job.status = "completed"
            main_job.completed_at = time.time() # Track end time for multi-worker jobs
            
            # Stitch all the shard results together into one final string
            sorted_shards = sorted(all_shards, key=lambda x: x.shard_index)
            combined_result = "\n---\n".join([f"Shard {s.shard_index} Output:\n{s.result}" for s in sorted_shards])
            
            main_job.result = combined_result
            db.commit()

# --- NEW: Shard Recovery Helpers ---

def get_shard_index_for_worker(db: Session, job_id: str, worker_id: str):
    """Finds which exact piece of the distributed job the dead worker was handling."""
    shard = db.query(JobShard).filter(JobShard.job_id == job_id, JobShard.worker_id == worker_id).first()
    return shard.shard_index if shard else 0

def get_cluster_ips_for_job(db: Session, job_id: str):
    """Rebuilds the active cluster IP list so the new worker knows who else is in the network."""
    shards = db.query(JobShard).filter(JobShard.job_id == job_id).order_by(JobShard.shard_index).all()
    ips = []
    for shard in shards:
        worker = db.query(WorkerNode).filter(WorkerNode.worker_id == shard.worker_id).first()
        ips.append(worker.ip if worker else "127.0.0.1")
    return ips